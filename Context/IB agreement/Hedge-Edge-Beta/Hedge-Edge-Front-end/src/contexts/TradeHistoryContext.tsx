/**
 * TradeHistoryContext
 * ===================
 * Always-mounted provider that records closed-trade events from the Electron
 * main process into localStorage.  Mounted at DashboardLayout level so trades
 * are captured regardless of which page the user is viewing.
 *
 * Components that need trade history (e.g. DashboardAnalytics) consume this
 * context instead of running their own IPC listener.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import type { TradeRecord, ChartDataPoint } from '@/hooks/useTradeHistory';
import { buildChartData } from '@/hooks/useTradeHistory';
import { useTradingAccounts } from '@/hooks/useTradingAccounts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TradeHistoryMap {
  [accountId: string]: TradeRecord[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TRADE_HISTORY_KEY = 'hedge_edge_trade_history';
const MAX_TRADES_PER_ACCOUNT = 500;

// ─── localStorage helpers ───────────────────────────────────────────────────

function loadTradeHistory(): TradeHistoryMap {
  try {
    const stored = localStorage.getItem(TRADE_HISTORY_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveTradeHistory(history: TradeHistoryMap): void {
  try {
    localStorage.setItem(TRADE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[TradeHistoryContext] Failed to save:', e);
  }
}

// ─── Context shape ──────────────────────────────────────────────────────────

interface TradeHistoryContextValue {
  /** Get all recorded trades for a specific account */
  getTradesForAccount: (accountId: string) => TradeRecord[];
  /** Build chart-ready data for a given account */
  buildChartDataForAccount: (
    accountId: string,
    currentPnL: number,
    accountName: string,
  ) => ChartDataPoint[];
  /** Clear trade history for one account */
  clearAccountHistory: (accountId: string) => void;
  /** Clear all trade history */
  clearAllHistory: () => void;
  /** Request trade history from a connected terminal (by account login) */
  requestHistoryForAccount: (login: string) => Promise<boolean>;
  /** Request trade history from ALL connected terminals */
  requestHistoryForAll: () => Promise<boolean>;
}

const TradeHistoryContext = createContext<TradeHistoryContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function TradeHistoryProvider({ children }: { children: ReactNode }) {
  const { accounts } = useTradingAccounts();
  const [history, setHistory] = useState<TradeHistoryMap>(loadTradeHistory);
  const historyRef = useRef(history);
  historyRef.current = history;

  // Build login → account-id map so IPC events (keyed by terminal login) can
  // be mapped to the correct Supabase account id.
  const loginMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      if (a.login) map[a.login] = a.id;
    }
    loginMapRef.current = map;
  }, [accounts]);

  // ── IPC listener — always active while provider is mounted ──

  useEffect(() => {
    const api = (window as any).electronAPI?.trading;
    if (!api?.onEvent) return; // Not in Electron environment

    const unsubscribe = api.onEvent((eventData: {
      event: string;
      terminalId: string;
      data: any;
      timestamp: string;
    }) => {
      // ── Batch import: historical deals from GET_HISTORY ──
      if (eventData.event === 'tradeHistory') {
        const deals: any[] = Array.isArray(eventData.data) ? eventData.data : [];
        console.log(`[TradeHistory] Received tradeHistory event: terminalId=${eventData.terminalId}, deals=${deals.length}, loginMap keys:`, Object.keys(loginMapRef.current));
        if (deals.length === 0) return;

        const terminalId = eventData.terminalId;
        // terminalId is formatted as "mt5-{login}" or "ctrader-{login}" by agent-channel-reader.
        // loginMapRef keys are plain login strings, so strip the platform prefix.
        const rawLogin = terminalId.replace(/^(mt5|ctrader)-/, '');
        const accountId = loginMapRef.current[rawLogin] || loginMapRef.current[terminalId] || terminalId;

        // Only include OUT / INOUT deals (realised P&L).
        const closingDeals = deals.filter(
          (d: any) => d.entry === 'OUT' || d.entry === 'INOUT',
        );
        if (closingDeals.length === 0) return;

        const currentHistory = historyRef.current;
        const existingTrades = currentHistory[accountId] || [];
        const existingTickets = new Set(existingTrades.map(t => t.ticket).filter(Boolean));

        // Build new trade records with running P&L, skipping duplicates
        let runningPnL = existingTrades.length > 0
          ? existingTrades[existingTrades.length - 1].runningPnL
          : 0;

        const newRecords: TradeRecord[] = [];
        for (const deal of closingDeals) {
          const ticket = Number(deal.ticket) || undefined;
          if (ticket && existingTickets.has(ticket)) continue; // skip duplicate

          const dealProfit = Number(deal.profit) + Number(deal.swap || 0) + Number(deal.commission || 0);
          runningPnL += dealProfit;

          // Parse MQL5 time format "YYYY.MM.DD HH:MM:SS" → ISO
          const rawTime = String(deal.time || '');
          const isoTime = rawTime.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');

          newRecords.push({
            timestamp: isoTime || new Date().toISOString(),
            profit: dealProfit,
            runningPnL,
            symbol: deal.symbol || 'UNKNOWN',
            volume: Number(deal.volume) || undefined,
            ticket,
          });
        }

        if (newRecords.length === 0) return;

        // Merge: history deals first, then any existing real-time records
        // (historical records fill in older data; real-time records are newer)
        const mergedTrades = [...newRecords, ...existingTrades]
          .reduce<TradeRecord[]>((acc, t) => {
            if (t.ticket && acc.some(x => x.ticket === t.ticket)) return acc;
            acc.push(t);
            return acc;
          }, [])
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .slice(-MAX_TRADES_PER_ACCOUNT);

        // Recalculate running P&L after merge
        let recalcPnL = 0;
        for (const t of mergedTrades) {
          recalcPnL += t.profit;
          t.runningPnL = recalcPnL;
        }

        const updatedHistory = { ...currentHistory, [accountId]: mergedTrades };
        setHistory(updatedHistory);
        saveTradeHistory(updatedHistory);

        console.log(
          `[TradeHistory] Imported ${newRecords.length} deals for ${accountId} (from ${closingDeals.length} closing deals, total: ${mergedTrades.length})`,
        );
        return;
      }

      // ── Single trade: positionClosed from snapshot diff ──
      if (eventData.event !== 'positionClosed') return;

      const terminalId = eventData.terminalId;
      const posData = eventData.data?.data || eventData.data;
      const profit = Number(posData?.profit) || 0;
      const symbol = posData?.symbol || 'UNKNOWN';
      const volume = Number(posData?.volume) || undefined;
      const ticket = Number(posData?.position) || undefined;

      // Resolve account ID from terminal login
      // terminalId is "mt5-{login}" or "ctrader-{login}" — strip prefix for lookup
      const rawLogin = terminalId.replace(/^(mt5|ctrader)-/, '');
      const accountId = loginMapRef.current[rawLogin] || loginMapRef.current[terminalId] || terminalId;

      // Deduplicate: skip if we already have a record with same ticket
      const currentHistory = historyRef.current;
      const accountTrades = currentHistory[accountId] || [];
      if (ticket && accountTrades.some(t => t.ticket === ticket)) {
        return; // Already recorded
      }

      const lastRunningPnL =
        accountTrades.length > 0
          ? accountTrades[accountTrades.length - 1].runningPnL
          : 0;

      const record: TradeRecord = {
        timestamp: eventData.timestamp || new Date().toISOString(),
        profit,
        runningPnL: lastRunningPnL + profit,
        symbol,
        volume,
        ticket,
      };

      const updatedTrades = [...accountTrades, record].slice(-MAX_TRADES_PER_ACCOUNT);
      const updatedHistory = { ...currentHistory, [accountId]: updatedTrades };

      setHistory(updatedHistory);
      saveTradeHistory(updatedHistory);

      console.log(
        `[TradeHistory] Recorded trade for ${accountId}: ${symbol} profit=${profit}, running=${record.runningPnL}`,
      );
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ── Public API ──

  const getTradesForAccount = useCallback(
    (accountId: string): TradeRecord[] => history[accountId] || [],
    [history],
  );

  const buildChartDataForAccount = useCallback(
    (accountId: string, currentPnL: number, accountName: string): ChartDataPoint[] => {
      const trades = history[accountId] || [];
      return buildChartData(trades, currentPnL, accountName);
    },
    [history],
  );

  const clearAccountHistory = useCallback((accountId: string) => {
    const updated = { ...historyRef.current };
    delete updated[accountId];
    setHistory(updated);
    saveTradeHistory(updated);
  }, []);

  const clearAllHistory = useCallback(() => {
    setHistory({});
    saveTradeHistory({});
  }, []);

  /**
   * Request trade history from a specific connected terminal.
   * The deals arrive asynchronously via the 'tradeHistory' IPC event.
   */
  const requestHistoryForAccount = useCallback(async (login: string): Promise<boolean> => {
    const api = (window as any).electronAPI?.trading;
    if (!api?.getHistory) return false;
    try {
      const result = await api.getHistory(login, 3650);
      return result?.success ?? false;
    } catch (err) {
      console.warn('[TradeHistory] requestHistoryForAccount failed:', err);
      return false;
    }
  }, []);

  /**
   * Request trade history from ALL connected terminals.
   */
  const requestHistoryForAll = useCallback(async (): Promise<boolean> => {
    const api = (window as any).electronAPI?.trading;
    if (!api?.getHistoryAll) return false;
    try {
      const result = await api.getHistoryAll();
      return result?.success ?? false;
    } catch (err) {
      console.warn('[TradeHistory] requestHistoryForAll failed:', err);
      return false;
    }
  }, []);

  const value = useMemo<TradeHistoryContextValue>(
    () => ({
      getTradesForAccount,
      buildChartDataForAccount,
      clearAccountHistory,
      clearAllHistory,
      requestHistoryForAccount,
      requestHistoryForAll,
    }),
    [getTradesForAccount, buildChartDataForAccount, clearAccountHistory, clearAllHistory, requestHistoryForAccount, requestHistoryForAll],
  );

  return (
    <TradeHistoryContext.Provider value={value}>
      {children}
    </TradeHistoryContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTradeHistoryContext() {
  const ctx = useContext(TradeHistoryContext);
  if (!ctx) {
    throw new Error(
      'useTradeHistoryContext must be used within a <TradeHistoryProvider>',
    );
  }
  return ctx;
}
