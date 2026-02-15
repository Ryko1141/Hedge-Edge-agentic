/**
 * useTradeHistory Hook
 * ====================
 * Tracks closed trades per account via IPC events and persists in localStorage.
 * Builds a real P&L progression chart from actual closed trade data.
 * 
 * When no trade history exists for an account, returns a minimal 2-point
 * chart (0 → current P&L) instead of fake random data.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TradeRecord {
  /** ISO timestamp of when this trade was closed */
  timestamp: string;
  /** Profit/loss of this individual trade */
  profit: number;
  /** Running cumulative P&L after this trade */
  runningPnL: number;
  /** Symbol traded (e.g., EURUSD) */
  symbol: string;
  /** Volume / lot size */
  volume?: number;
  /** Position ticket number */
  ticket?: number;
}

interface TradeHistoryMap {
  [accountId: string]: TradeRecord[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TRADE_HISTORY_KEY = 'hedge_edge_trade_history';
const MAX_TRADES_PER_ACCOUNT = 500; // Cap to prevent unbounded growth

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
    console.warn('[useTradeHistory] Failed to save trade history:', e);
  }
}

// ─── Chart data builder ─────────────────────────────────────────────────────

export interface ChartDataPoint {
  trades: number;
  pnl: number;
  name: string;
  /** Epoch milliseconds – used for time-based X-axis */
  time: number;
}

/**
 * Build chart data from real trade records.
 * Trades are sorted by timestamp so the P&L curve is chronologically correct.
 * If no trades recorded yet, returns a simple 2-point line from 0 → currentPnL.
 */
export function buildChartData(
  trades: TradeRecord[],
  currentPnL: number,
  accountName: string
): ChartDataPoint[] {
  const now = Date.now();

  if (!trades || trades.length === 0) {
    // No recorded trades — show honest minimal chart
    if (currentPnL === 0) {
      return [{ trades: 0, pnl: 0, name: accountName, time: now }];
    }
    // Simple 2-point: start → current (not labelled as a trade since it's synthetic)
    return [
      { trades: 0, pnl: 0, name: accountName, time: now - 86_400_000 },
      { trades: 0, pnl: Math.round(currentPnL), name: `${accountName} (no history)`, time: now },
    ];
  }

  // Sort trades chronologically so the P&L line is time-accurate
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Recalculate running P&L in chronological order
  let runningPnL = 0;
  const firstTime = new Date(sorted[0].timestamp).getTime();

  const data: ChartDataPoint[] = [
    { trades: 0, pnl: 0, name: accountName, time: firstTime - 1000 },
  ];

  sorted.forEach((trade, idx) => {
    runningPnL += trade.profit;
    data.push({
      trades: idx + 1,
      pnl: Math.round(runningPnL),
      name: accountName,
      time: new Date(trade.timestamp).getTime(),
    });
  });

  // If current P&L drifts from last recorded (open positions moved it),
  // append a "current" point so the chart ends at the real value
  const lastRecorded = data[data.length - 1].pnl;
  const roundedCurrent = Math.round(currentPnL);
  if (Math.abs(lastRecorded - roundedCurrent) > 1) {
    data.push({
      trades: data[data.length - 1].trades + 1,
      pnl: roundedCurrent,
      name: accountName,
      time: now,
    });
  }

  return data;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

interface UseTradeHistoryOptions {
  /** Map of account login → account id (for mapping IPC events) */
  loginToAccountId?: Record<string, string>;
}

export function useTradeHistory(options?: UseTradeHistoryOptions) {
  const [history, setHistory] = useState<TradeHistoryMap>(loadTradeHistory);
  const historyRef = useRef(history);
  historyRef.current = history;

  const loginMapRef = useRef(options?.loginToAccountId || {});
  loginMapRef.current = options?.loginToAccountId || {};

  // Listen for positionClosed events from IPC
  useEffect(() => {
    const api = (window as any).electronAPI?.trading;
    if (!api?.onEvent) {
      return; // Not in Electron environment
    }

    const unsubscribe = api.onEvent((eventData: {
      event: string;
      terminalId: string;
      data: any;
      timestamp: string;
    }) => {
      if (eventData.event !== 'positionClosed') return;

      const terminalId = eventData.terminalId;
      const posData = eventData.data?.data || eventData.data;
      const profit = Number(posData?.profit) || 0;
      const symbol = posData?.symbol || 'UNKNOWN';
      const volume = Number(posData?.volume) || undefined;
      const ticket = Number(posData?.position) || undefined;

      // Resolve account ID from terminal login
      // terminalId might be the login number, or might be the account ID directly
      const loginMap = loginMapRef.current;
      const accountId = loginMap[terminalId] || terminalId;

      // Build the new trade record
      const currentHistory = historyRef.current;
      const accountTrades = currentHistory[accountId] || [];
      const lastRunningPnL = accountTrades.length > 0 
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

      console.log(`[useTradeHistory] Recorded trade for ${accountId}: ${symbol} profit=${profit}, running=${record.runningPnL}`);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  /**
   * Get trade history for a specific account
   */
  const getTradesForAccount = useCallback((accountId: string): TradeRecord[] => {
    return history[accountId] || [];
  }, [history]);

  /**
   * Clear trade history for a specific account
   */
  const clearAccountHistory = useCallback((accountId: string) => {
    const updated = { ...historyRef.current };
    delete updated[accountId];
    setHistory(updated);
    saveTradeHistory(updated);
  }, []);

  /**
   * Clear all trade history
   */
  const clearAllHistory = useCallback(() => {
    setHistory({});
    saveTradeHistory({});
  }, []);

  return {
    history,
    getTradesForAccount,
    clearAccountHistory,
    clearAllHistory,
    buildChartData,
  };
}
