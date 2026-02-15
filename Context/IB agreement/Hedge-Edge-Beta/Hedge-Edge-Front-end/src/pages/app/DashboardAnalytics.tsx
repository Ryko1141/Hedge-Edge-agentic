import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTradingAccounts } from '@/hooks/useTradingAccounts';
import { useTradeHistoryContext } from '@/contexts/TradeHistoryContext';
import { buildChartData } from '@/hooks/useTradeHistory';
import { useConnectionsFeed } from '@/hooks/useConnectionsFeed';
import { useHedgeStats } from '@/hooks/useHedgeStats';
import { useCopierGroupsContext } from '@/contexts/CopierGroupsContext';
import { isElectron } from '@/lib/desktop';
import { PROP_FIRMS } from '@/components/dashboard/AddAccountModal';
import { Card, CardContent } from '@/components/ui/card';
import { PageBackground } from '@/components/ui/page-background';
import { Separator } from '@/components/ui/separator';
import { GradientText } from '@/components/ui/gradient-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, DollarSign, Check, X, Trash2, Lock, RefreshCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Uniform bar color - dark themed with 50% transparency
const BAR_COLOR = 'hsla(120, 70%, 35%, 0.5)'; // Darker green with 50% opacity
const BAR_STROKE = 'hsl(120, 70%, 40%)'; // Darker green for border

// Payout entry interface
interface PayoutEntry {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
  received: boolean;
  denied: boolean;
}

// Local storage key for payouts
const PAYOUTS_KEY = 'hedge_edge_payouts';

const getStoredPayouts = (): PayoutEntry[] => {
  try {
    const stored = localStorage.getItem(PAYOUTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const savePayouts = (payouts: PayoutEntry[]) => {
  localStorage.setItem(PAYOUTS_KEY, JSON.stringify(payouts));
};

const DashboardAnalytics = () => {
  const { accounts, loading, fetchAccounts, syncAccountFromMT5 } = useTradingAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [payouts, setPayouts] = useState<PayoutEntry[]>(getStoredPayouts);
  const [isAddingPayout, setIsAddingPayout] = useState(false);
  const [newPayoutAmount, setNewPayoutAmount] = useState('');
  const [isRefreshingChart, setIsRefreshingChart] = useState(false);
  
  // Dynamic daily limit from EOD tracker (uses day-start balance, not initial account size)
  const [dynamicDailyLimit, setDynamicDailyLimit] = useState<{
    referenceBalance: number;
    dailyLimitPnL: number;
    currentDayPnL: number;
    currentDayPnLPercent: number;
    remainingDailyDrawdown: number;
    isLimitBreached: boolean;
    tradingDate: string;
  } | null>(null);

  // Trade history from always-mounted context (records events on ALL pages)
  const { getTradesForAccount, requestHistoryForAccount, requestHistoryForAll } = useTradeHistoryContext();

  // Live connections feed — gives us real-time balance/equity/profit from the EA
  const { getSnapshot } = useConnectionsFeed({ autoStart: true });

  // Copier groups — needed to map leader → follower accounts for hedge P/L
  const { groups: copierGroups } = useCopierGroupsContext();

  // Hedge stats — computed from live snapshots + copier group config (no copier-engine IPC)
  const { getAccountHedgeStats, getAggregateHedgeStats } = useHedgeStats(accounts, copierGroups, getSnapshot);

  // Helper to get live snapshot for an account (same pattern as DashboardOverview)
  const getAccountSnapshot = useCallback((account: { login?: string; id: string; is_archived?: boolean }) => {
    if (account.is_archived || !account.login) return null;
    return getSnapshot(account.login) || getSnapshot(account.id) || null;
  }, [getSnapshot]);

  // Auto-sync: whenever we have a live EA snapshot, persist balance to Supabase
  // so the database stays up-to-date even after app restart
  const hasSyncedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const account of accounts) {
      if (account.is_archived || !account.login) continue;
      const snap = getAccountSnapshot(account);
      if (!snap?.metrics?.balance) continue;
      // Only sync once per session per account to avoid excessive writes
      if (hasSyncedRef.current.has(account.id)) continue;
      hasSyncedRef.current.add(account.id);
      syncAccountFromMT5(account.id, {
        balance: snap.metrics.balance,
        equity: snap.metrics.equity,
        profit: snap.metrics.profit,
      });
    }
  }, [accounts, getAccountSnapshot, syncAccountFromMT5]);

  // Auto-fetch trade history from connected EAs when the Analytics page loads
  // or when the selected account changes (if we have no local trades yet)
  const hasFetchedHistoryRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // On initial page load, request history from ALL connected terminals
    if (hasFetchedHistoryRef.current.size === 0) {
      requestHistoryForAll();
      hasFetchedHistoryRef.current.add('__all__');
    }
  }, [requestHistoryForAll]);

  useEffect(() => {
    // When a specific account is selected, fetch its history if we have none
    if (!selectedAccountId || selectedAccountId === 'all') return;
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account?.login || account.is_archived) return;
    // Only fetch once per session per account
    if (hasFetchedHistoryRef.current.has(account.login)) return;
    const trades = getTradesForAccount(selectedAccountId);
    if (trades.length === 0) {
      hasFetchedHistoryRef.current.add(account.login);
      requestHistoryForAccount(account.login);
    }
  }, [selectedAccountId, accounts, getTradesForAccount, requestHistoryForAccount]);

  // Fetch dynamic daily limit from EOD tracker (desktop only)
  // This uses the day-start balance (updated at broker EOD) instead of initial account size
  useEffect(() => {
    if (!isElectron()) {
      setDynamicDailyLimit(null);
      return;
    }
    if (!selectedAccountId || selectedAccountId === 'all') {
      setDynamicDailyLimit(null);
      return;
    }
    
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account || account.is_archived) {
      setDynamicDailyLimit(null);
      return;
    }
    
    const maxDailyLossPercent = Number(account.max_daily_loss) || 0;
    if (maxDailyLossPercent <= 0) {
      setDynamicDailyLimit(null);
      return;
    }
    
    // Use login as the account identifier for the daily limit tracker
    const accountIdForTracker = account.login || selectedAccountId;
    
    const fetchDailyLimit = async () => {
      try {
        const result = await window.electronAPI?.dailyLimit?.calculate(
          accountIdForTracker,
          maxDailyLossPercent
        );
        if (result?.success && result.data) {
          const apiResult = result.data;
          // Map API result to state shape expected by the component
          setDynamicDailyLimit({
            referenceBalance: apiResult.dailyStartBalance,
            dailyLimitPnL: -apiResult.dailyLimitAmount, // Negative because it's a loss limit
            currentDayPnL: -(apiResult.dailyStartBalance - apiResult.currentEquity),
            currentDayPnLPercent: apiResult.dailyLimitPercent,
            remainingDailyDrawdown: apiResult.remainingAmount,
            isLimitBreached: apiResult.usedAmount >= apiResult.dailyLimitAmount,
            tradingDate: apiResult.serverDay,
          });
        } else {
          setDynamicDailyLimit(null);
        }
      } catch (err) {
        console.error('[DashboardAnalytics] Failed to fetch daily limit:', err);
        setDynamicDailyLimit(null);
      }
    };
    
    fetchDailyLimit();
    
    // Refresh every 30 seconds to catch EOD transitions
    const interval = setInterval(fetchDailyLimit, 30000);
    return () => clearInterval(interval);
  }, [selectedAccountId, accounts]);

  // Separate active and archived accounts - archived accounts don't need live data
  const activeAccounts = accounts.filter(a => !a.is_archived);
  const archivedAccounts = accounts.filter(a => a.is_archived);

  // Get selected account or all accounts
  const selectedAccount = selectedAccountId === 'all' 
    ? null 
    : accounts.find(a => a.id === selectedAccountId);
  
  const isSelectedArchived = selectedAccount?.is_archived;

  // Calculate stats based on selection (only from active accounts for "all")
  const relevantAccounts = selectedAccount 
    ? [selectedAccount] 
    : activeAccounts; // Only active accounts for aggregate stats
  
  const totalInvestment = relevantAccounts.reduce((sum, acc) => sum + (Number(acc.account_size) || 0), 0);

  // Calculate hedge stats using correct formula: HD_i = -(P_f,i × F_i) / (D_i × S_i) - P_h,i
  const propAccounts = activeAccounts.filter(a => a.phase === 'funded' || a.phase === 'evaluation');
  const hedgeAccounts = activeAccounts.filter(a => a.phase === 'live');

  // Aggregate hedge P/L and discrepancy (for "All Accounts" view)
  const { totalHedgePnL: hedgePnL, totalHedgeDiscrepancy: hedgeDiscrepancy } = getAggregateHedgeStats();

  // Calculate total challenge fees across all accounts (active + archived)
  // If an account has previous_account_id, it's linked to an archived account — count as ONE fee
  const totalChallengeFees = useMemo(() => {
    // Only count fees from "root" accounts (those NOT linked to a previous account)
    // This ensures that a chain of archived -> new account only counts one fee
    const allPropAccounts = accounts.filter(a => a.phase !== 'live');
    return allPropAccounts
      .filter(a => !a.previous_account_id) // Only root accounts (not continuations)
      .reduce((sum, acc) => sum + (Number(acc.evaluation_fee) || 0), 0);
  }, [accounts]);

  // Calculate total received payouts from all accounts
  const totalReceivedPayouts = useMemo(() => {
    return payouts.filter(p => p.received).reduce((sum, p) => sum + p.amount, 0);
  }, [payouts]);

  // Per-account challenge fee (with archive linkage: walk back to root, count fee once)
  const selectedAccountChallengeFee = useMemo(() => {
    if (!selectedAccount || selectedAccount.phase === 'live') return 0;
    // Walk back to the root account in the chain
    let current = selectedAccount;
    while (current.previous_account_id) {
      const prev = accounts.find(a => a.id === current.previous_account_id);
      if (prev) current = prev;
      else break;
    }
    return Number(current.evaluation_fee) || 0;
  }, [selectedAccount, accounts]);

  // Per-account received payouts
  const selectedAccountPayouts = useMemo(() => {
    if (!selectedAccount) return 0;
    return payouts
      .filter(p => p.received && p.accountId === selectedAccount.id)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [selectedAccount, payouts]);

  // Per-account hedge P/L and discrepancy (attributed from copier engine)
  const selectedAccountHedgeStats = useMemo(() => {
    if (!selectedAccount || selectedAccount.phase === 'live') {
      return { hedgePnL: 0, expectedHedgePnL: 0, hedgeDiscrepancy: 0 };
    }
    return getAccountHedgeStats(selectedAccount);
  }, [selectedAccount, getAccountHedgeStats]);

  const selectedAccountProportionalHedgePnL = selectedAccountHedgeStats.hedgePnL;

  // Per-account hedge discrepancy: HD_i = -(P_f,i × F_i) / (D_i × S_i) - P_h,i
  const selectedAccountHedgeDiscrepancy = selectedAccountHedgeStats.hedgeDiscrepancy;

  // Total P/L:
  // All Accounts: Payouts - (|Hedge P/L| + Challenge Fees + Hedge Discrepancy)
  // Funded account: Account Payouts - (|Proportional Hedge Loss| + Challenge Fee + Hedge Discrepancy)
  // Evaluation account: not shown
  const totalPnL = selectedAccountId === 'all'
    ? totalReceivedPayouts - (Math.abs(hedgePnL) + totalChallengeFees + hedgeDiscrepancy)
    : (selectedAccount?.phase === 'funded'
      ? selectedAccountPayouts - (Math.abs(selectedAccountProportionalHedgePnL) + selectedAccountChallengeFee + selectedAccountHedgeDiscrepancy)
      : 0);

  // $ to Target for evaluation accounts: Target $ - current P/L
  const dollarsToTarget = useMemo(() => {
    if (!selectedAccount || selectedAccount.phase !== 'evaluation') return 0;
    const profitTarget = (Number(selectedAccount.profit_target) || 0) / 100 * (Number(selectedAccount.account_size) || 0);
    const currentPnLVal = Number(selectedAccount.pnl) || 0;
    return profitTarget - currentPnLVal;
  }, [selectedAccount]);

  // Net ROI = ((Payouts - Costs) / Costs) × 100
  // All Accounts: costs = |Hedge P/L| + Challenge Fees + Hedge Discrepancy
  // Funded account: costs = |proportional Hedge P/L| + account challenge fee + account hedge discrepancy
  // Evaluation account: replaced with $ to Target (handled in rendering)
  const totalCosts = Math.abs(hedgePnL) + totalChallengeFees + hedgeDiscrepancy;
  const selectedAccountCosts = Math.abs(selectedAccountProportionalHedgePnL) + selectedAccountChallengeFee + selectedAccountHedgeDiscrepancy;
  const roi = selectedAccountId === 'all'
    ? (totalCosts > 0 ? ((totalReceivedPayouts - totalCosts) / totalCosts) * 100 : 0)
    : (selectedAccount?.phase === 'funded'
      ? (selectedAccountCosts > 0 ? ((selectedAccountPayouts - selectedAccountCosts) / selectedAccountCosts) * 100 : 0)
      : 0);

  // Calculate totals for the chart header - funded and evaluation account balances (active only)
  // Use live balance from EA when connected, fall back to Supabase value
  const fundedAccounts = activeAccounts.filter(a => a.phase === 'funded');
  const evaluationAccounts = activeAccounts.filter(a => a.phase === 'evaluation');
  const getLiveBalance = (acc: typeof activeAccounts[0]) => {
    const snap = getAccountSnapshot(acc);
    return snap?.metrics?.balance ?? (Number(acc.current_balance) || Number(acc.account_size) || 0);
  };
  const totalFunded = fundedAccounts.reduce((sum, acc) => sum + getLiveBalance(acc), 0);
  const totalEvaluation = evaluationAccounts.reduce((sum, acc) => sum + getLiveBalance(acc), 0);

  // Get unique prop firms from connected accounts (excluding hedge and archived accounts)
  // Use account_size (starting/original size) not current_balance for the bar chart
  const propFirmData = activeAccounts
    .filter(account => account.phase !== 'live') // Exclude hedge accounts
    .reduce((acc, account) => {
      const firmName = account.prop_firm || 'Unknown';
      if (!acc[firmName]) {
        // Find logo from PROP_FIRMS array
        const firm = PROP_FIRMS.find(f => f.name === firmName);
        acc[firmName] = { name: firmName, balance: 0, count: 0, logo: firm?.logo || null };
      }
      acc[firmName].balance += Number(account.account_size) || 0;
      acc[firmName].count += 1;
      return acc;
    }, {} as Record<string, { name: string; balance: number; count: number; logo: string | null }>);

  const barChartData = Object.values(propFirmData);

  // Get starting balance for selected account
  const startingBalance = selectedAccount 
    ? Number(selectedAccount.account_size) || 0
    : 0;

  // Get LIVE balance from EA connection (falls back to stale Supabase value)
  const liveSnapshot = selectedAccount ? getAccountSnapshot(selectedAccount) : null;
  const liveBalance = liveSnapshot?.metrics?.balance;
  const effectiveBalance = selectedAccount
    ? (liveBalance ?? (Number(selectedAccount.current_balance) || Number(selectedAccount.account_size) || 0))
    : 0;

  // Calculate current P&L using live EA balance when available
  const currentPnL = selectedAccount 
    ? effectiveBalance - startingBalance
    : 0;
  
  // Build chart data from real tracked trade history
  // Falls back to a minimal 2-point chart (0 → current P&L) when no history exists
  const areaChartData = useMemo(() => {
    if (!selectedAccount) {
      return [{ trades: 0, pnl: 0, name: 'Sample' }];
    }
    const trades = getTradesForAccount(selectedAccount.id);
    return buildChartData(trades, currentPnL, selectedAccount.account_name);
  }, [selectedAccount?.id, currentPnL, getTradesForAccount]);

  // Calculate max trades for X-axis domain
  const maxTrades = Math.max(...areaChartData.map(d => d.trades), 0);

  // Calculate profit target and max loss as P&L values
  const profitTargetPnL = selectedAccount 
    ? ((Number(selectedAccount.profit_target) || 0) / 100 * startingBalance)
    : 0;
  
  const maxLossPnL = selectedAccount 
    ? -((Number(selectedAccount.max_loss) || 0) / 100 * startingBalance)
    : 0;

  // Daily max loss: use dynamic EOD-based value when available (desktop with live connection)
  // Falls back to static calculation using initial account size for non-desktop or no live data
  // The dynamic limit uses the day-start balance which adjusts at broker EOD
  // If balance is up 5%, the new daily limit is 5% of the NEW balance, not the initial
  const dailyMaxLossPnL = dynamicDailyLimit
    ? dynamicDailyLimit.dailyLimitPnL  // Dynamic value based on day-start balance
    : selectedAccount 
      ? -((Number(selectedAccount.max_daily_loss) || 0) / 100 * startingBalance)  // Static fallback
      : 0;

  // Day-start reference balance (for display purposes)
  const dailyReferenceBalance = dynamicDailyLimit?.referenceBalance || startingBalance;

  // Calculate custom ticks at 50% intervals of profit target/max loss
  const getCustomTicks = () => {
    if (!selectedAccount || profitTargetPnL === 0) return [0];
    
    const tickInterval = profitTargetPnL / 2; // 50% of profit target
    const ticks: number[] = [0]; // Always include $0 line
    
    // Add positive ticks (profit side)
    for (let tick = tickInterval; tick <= profitTargetPnL * 1.1; tick += tickInterval) {
      ticks.push(Math.round(tick));
    }
    
    // Add negative ticks (loss side)
    for (let tick = -tickInterval; tick >= maxLossPnL * 1.1; tick -= tickInterval) {
      ticks.push(Math.round(tick));
    }
    
    // Add current P&L as a tick if it's not too close to existing ticks
    if (currentPnL !== 0) {
      const minSpacing = Math.abs(profitTargetPnL) * 0.15; // 15% of target as minimum spacing
      const isTooClose = ticks.some(tick => Math.abs(tick - currentPnL) < minSpacing);
      if (!isTooClose) {
        ticks.push(Math.round(currentPnL));
      }
    }
    
    // Sort and filter ticks that are too close together
    const sortedTicks = ticks.sort((a, b) => a - b);
    const minTickSpacing = Math.abs(profitTargetPnL - maxLossPnL) * 0.08; // 8% of range
    
    return sortedTicks.filter((tick, i, arr) => 
      i === 0 || Math.abs(tick - arr[i - 1]) >= minTickSpacing
    );
  };

  // Calculate Y-axis domain for individual account
  const getIndividualAccountYDomain = () => {
    if (!selectedAccount) return ['auto', 'auto'];
    
    const allValues = [currentPnL, 0, profitTargetPnL, maxLossPnL, dailyMaxLossPnL];
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    
    // Add padding (10% on each side)
    const range = maxValue - minValue;
    const padding = Math.max(range * 0.15, 500);
    
    return [Math.floor(minValue - padding), Math.ceil(maxValue + padding)];
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatYAxis = (value: number) => {
    return formatCurrency(value);
  };

  // Custom dot component for the area chart - color based on final P/L
  const CustomDot = (props: { cx?: number; cy?: number }) => {
    const { cx, cy } = props;
    if (cx === undefined || cy === undefined) return null;
    const isNegative = currentPnL < 0;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        stroke={isNegative ? '#ef4444' : 'hsl(var(--primary))'}
        strokeWidth={2}
        fill={isNegative ? '#ef4444' : 'hsl(var(--primary))'}
        fillOpacity={0.8}
      />
    );
  };

  return (
    <PageBackground>
      <div className={`p-6 pt-16 space-y-6 ${isSelectedArchived ? 'grayscale opacity-60' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GradientText 
              colors={['hsl(120, 100%, 54%)', 'hsl(45, 100%, 56%)', 'hsl(120, 100%, 54%)']} 
              animationSpeed={4}
              className="text-2xl font-bold"
            >
              Analytics
            </GradientText>
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </h1>
          <p className="text-muted-foreground">Tracking your overall hedging performance</p>
        </div>

        <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${selectedAccount?.phase === 'evaluation' ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
          {/* Total P/L - hidden for evaluation accounts */}
          {selectedAccount?.phase !== 'evaluation' && (
          <div className={`flex-1 flex flex-col justify-between p-4 rounded-lg bg-card border ${
            selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
            selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
            'border-border/50'
          }`}>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Total P/L</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-semibold ${totalPnL >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(totalPnL)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Hedge P/L */}
          <div className={`flex-1 flex flex-col justify-between p-4 rounded-lg bg-card border ${
            selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
            selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
            'border-border/50'
          }`}>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Hedge P/L</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-semibold ${(selectedAccountId === 'all' ? hedgePnL : selectedAccountProportionalHedgePnL) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(selectedAccountId === 'all' ? hedgePnL : selectedAccountProportionalHedgePnL)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Prop balance or Payouts (when All Accounts selected) */}
          <div className={`flex-1 flex flex-col justify-between p-4 rounded-lg bg-card border ${
            selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
            selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
            'border-border/50'
          }`}>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {selectedAccountId === 'all' ? 'Payouts' : 'Prop balance'}
              </h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  {selectedAccountId === 'all' ? (
                    <span className={`text-xl font-semibold ${payouts.filter(p => p.received).reduce((sum, p) => sum + p.amount, 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(payouts.filter(p => p.received).reduce((sum, p) => sum + p.amount, 0))}
                    </span>
                  ) : (
                    <span className={`text-xl font-semibold ${(Number(selectedAccount?.pnl) || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(Number(selectedAccount?.pnl) || 0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ROI / $ to Target */}
          <div className={`flex-1 flex flex-col justify-between p-4 rounded-lg bg-card border ${
            selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
            selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
            'border-border/50'
          }`}>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {selectedAccount?.phase === 'evaluation' ? '$ to Target' : 'ROI'}
              </h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  {selectedAccount?.phase === 'evaluation' ? (
                    <span className={`text-xl font-semibold ${dollarsToTarget <= 0 ? 'text-primary' : 'text-yellow-400'}`}>
                      {dollarsToTarget <= 0 ? 'Target Reached!' : formatCurrency(dollarsToTarget)}
                    </span>
                  ) : (
                    <span className={`text-xl font-semibold ${roi >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {roi.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Hedge Discrepancy */}
          <div className={`flex-1 flex flex-col justify-between p-4 rounded-lg bg-card border ${
            selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
            selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
            'border-border/50'
          }`}>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Hedge Discrepancy</h3>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-semibold ${(selectedAccountId === 'all' ? hedgeDiscrepancy : selectedAccountHedgeDiscrepancy) < 0 ? 'text-destructive' : 'text-primary'}`}>
                    {formatCurrency(selectedAccountId === 'all' ? hedgeDiscrepancy : selectedAccountHedgeDiscrepancy)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart and Performance Grid */}
        <div className="grid grid-cols-7 gap-4">
          {/* Main Chart - 5 columns */}
          <div className="col-span-7 lg:col-span-5">
            <Card className={`bg-card/80 backdrop-blur-sm h-[530px] ${
              selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
              selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
              'border-border/50'
            }`}>
              <CardContent className="px-6 py-8 h-full flex flex-col">
                {/* Chart Header with Account Selector */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-16">
                    {selectedAccount ? (
                      <>
                        <div className="flex items-center gap-3">
                          {(() => {
                            const firm = PROP_FIRMS.find(f => f.name === selectedAccount.prop_firm);
                            return firm?.logo ? (
                              <img src={firm.logo} alt={firm.name} className="w-10 h-10 rounded-lg object-cover" />
                            ) : null;
                          })()}
                          <div>
                            <h3 className={`text-sm font-semibold ${selectedAccount.phase === 'funded' ? 'text-green-400' : selectedAccount.phase === 'evaluation' ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                              {selectedAccount.phase === 'funded' ? 'Funded' : selectedAccount.phase === 'evaluation' ? 'Evaluation' : 'Hedge'}
                            </h3>
                            <span className="text-2xl font-semibold text-foreground">{selectedAccount.account_name}</span>
                          </div>
                        </div>
                        <Separator orientation="vertical" className="h-12" />
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Balance</h3>
                          <span className="text-2xl font-semibold text-foreground">
                            {formatCurrency(effectiveBalance)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Total Funded</h3>
                          <span className="text-2xl font-semibold text-foreground">{formatCurrency(totalFunded)}</span>
                        </div>
                        <Separator orientation="vertical" className="h-12" />
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">Total Evaluation</h3>
                          <span className="text-2xl font-semibold text-foreground">{formatCurrency(totalEvaluation)}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Account Selector Dropdown */}
                  <div className="flex items-center gap-2">
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="w-[200px] bg-card border-border/50">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {activeAccounts
                        .filter((account) => account.phase !== 'live')
                        .map((account) => {
                          const firm = PROP_FIRMS.find(f => f.name === account.prop_firm);
                          return (
                            <SelectItem key={account.id} value={account.id}>
                              <div className="flex items-center gap-2">
                                {firm?.logo && (
                                  <img src={firm.logo} alt={firm.name} className="w-4 h-4 rounded object-cover" />
                                )}
                                <span>{account.account_name}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      {archivedAccounts.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs text-muted-foreground border-t border-border/30 mt-1 pt-2">
                            Archived (Last Recorded)
                          </div>
                          {archivedAccounts.map((account) => {
                            const firm = PROP_FIRMS.find(f => f.name === account.prop_firm);
                            return (
                              <SelectItem 
                                key={account.id} 
                                value={account.id}
                                className="text-muted-foreground"
                              >
                                <div className="flex items-center gap-2">
                                  {firm?.logo && (
                                    <img src={firm.logo} alt={firm.name} className="w-4 h-4 rounded object-cover opacity-50" />
                                  )}
                                  <span>{account.account_name} (Archived)</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={isRefreshingChart}
                    onClick={async () => {
                      setIsRefreshingChart(true);
                      try {
                        // Fetch account metadata AND trade history from connected EAs
                        await fetchAccounts();
                        if (selectedAccount?.login) {
                          await requestHistoryForAccount(selectedAccount.login);
                        } else {
                          await requestHistoryForAll();
                        }
                      } finally {
                        // Allow time for IPC events to arrive and update state
                        setTimeout(() => setIsRefreshingChart(false), 1500);
                      }
                    }}
                    title="Refresh chart data &amp; trade history"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingChart ? 'animate-spin' : ''}`} />
                  </Button>
                  </div>
                </div>

                {/* Archived account notice */}
                {isSelectedArchived && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/30 text-muted-foreground text-xs mb-4">
                    <span className="opacity-60">📦</span>
                    <span>Showing last recorded data • This account is archived and no longer syncing</span>
                  </div>
                )}

                <Separator className="mb-4" />

                {/* Chart */}
                <div className="flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {selectedAccountId === 'all' ? (
                      // Bar chart for all accounts - grouped by prop firm
                      <BarChart 
                        data={barChartData.length > 0 ? barChartData : [{ name: 'No accounts', balance: 0, count: 0, logo: null }]} 
                        margin={{ top: 10, right: 10, bottom: 50, left: 10 }}
                      >
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(120, 70%, 35%)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="hsl(120, 70%, 35%)" stopOpacity={0.2} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid 
                          strokeDasharray="5 5" 
                          stroke="hsl(var(--border))" 
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis 
                          dataKey="name" 
                          axisLine={{ stroke: 'hsl(var(--border))' }}
                          tickLine={false}
                          height={50}
                          interval={0}
                          tick={(props) => {
                            const { x, y, payload } = props;
                            const firmData = barChartData.find(d => d.name === payload.value);
                            const logo = firmData?.logo;
                            return (
                              <g transform={`translate(${x},${y})`}>
                                {logo ? (
                                  <image
                                    href={logo}
                                    x={-12}
                                    y={6}
                                    width={24}
                                    height={24}
                                    style={{ borderRadius: '4px' }}
                                    preserveAspectRatio="xMidYMid slice"
                                  />
                                ) : (
                                  <text
                                    x={0}
                                    y={16}
                                    textAnchor="middle"
                                    fill="hsl(var(--muted-foreground))"
                                    fontSize={10}
                                  >
                                    {payload.value?.substring(0, 3) || '?'}
                                  </text>
                                )}
                              </g>
                            );
                          }}
                        />
                        <YAxis 
                          tickFormatter={formatYAxis}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          width={80}
                          label={{ 
                            value: 'Account Size', 
                            angle: -90, 
                            position: 'insideLeft',
                            offset: 0,
                            fill: 'hsl(var(--muted-foreground))',
                            fontSize: 12,
                            style: { textAnchor: 'middle' }
                          }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                  <p className="text-foreground text-sm font-medium">{data.name}</p>
                                  <p className="text-sm flex items-center gap-2 mt-1">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BAR_STROKE }}></span>
                                    <span className="text-foreground">
                                      Account Size: {formatCurrency(data.balance)}
                                    </span>
                                  </p>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    {data.count} account{data.count !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="balance" 
                          radius={[4, 4, 0, 0]} 
                          fill="url(#barGradient)" 
                          stroke={BAR_STROKE} 
                          strokeWidth={1} 
                        />
                      </BarChart>
                    ) : (
                      // Area chart for individual account
                      <AreaChart 
                        data={areaChartData} 
                        margin={{ top: 10, right: 10, bottom: 30, left: 10 }}
                      >
                        <defs>
                          <linearGradient id="areaGradientPositive" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="areaGradientNegative" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity={0} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                          </linearGradient>
                          <linearGradient id="dotGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid 
                          strokeDasharray="5 5" 
                          stroke="hsl(var(--border))" 
                          horizontal={true}
                          vertical={false}
                        />
                        <XAxis 
                          dataKey="trades" 
                          type="number"
                          domain={[0, maxTrades > 0 ? maxTrades : 1]}
                          tickFormatter={(v: number) => v === 0 ? '0' : `#${v}`}
                          allowDecimals={false}
                          axisLine={{ stroke: 'hsl(var(--border))' }}
                          tickLine={{ stroke: 'hsl(var(--border))' }}
                          tick={{ fill: '#ffffff', fontSize: 12 }}
                          label={{ 
                            value: 'Trades', 
                            position: 'bottom', 
                            offset: 15,
                            fill: '#ffffff',
                            fontSize: 12
                          }}
                        />
                        <YAxis 
                          dataKey="pnl" 
                          type="number"
                          domain={getIndividualAccountYDomain()}
                          ticks={getCustomTicks()}
                          tickFormatter={formatYAxis}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#ffffff', fontSize: 12 }}
                          width={80}
                          label={{ 
                            value: 'P&L', 
                            angle: -90, 
                            position: 'insideLeft',
                            offset: 0,
                            fill: '#ffffff',
                            fontSize: 12,
                            style: { textAnchor: 'middle' }
                          }}
                        />
                        {/* Profit Target Reference Line */}
                        {profitTargetPnL > 0 && (
                          <ReferenceLine 
                            y={profitTargetPnL} 
                            stroke="#22c55e" 
                            strokeDasharray="4 4" 
                            strokeWidth={1.5}
                            label={{ 
                              value: `Target: ${formatCurrency(profitTargetPnL)}`, 
                              position: 'insideTopLeft',
                              fill: '#22c55e',
                              fontSize: 11,
                              fontWeight: 500
                            }}
                          />
                        )}
                        {/* Daily Max Loss Reference Line */}
                        {dailyMaxLossPnL < 0 && (
                          <ReferenceLine 
                            y={dailyMaxLossPnL} 
                            stroke="#eab308" 
                            strokeDasharray="4 4" 
                            strokeWidth={1.5}
                            label={{ 
                              value: `Daily Limit: ${formatCurrency(dailyMaxLossPnL)}`, 
                              position: 'insideTopLeft',
                              fill: '#eab308',
                              fontSize: 11,
                              fontWeight: 500
                            }}
                          />
                        )}
                        {/* Max Loss Reference Line */}
                        {maxLossPnL < 0 && (
                          <ReferenceLine 
                            y={maxLossPnL} 
                            stroke="#ef4444" 
                            strokeDasharray="4 4" 
                            strokeWidth={1.5}
                            label={{ 
                              value: `Max Loss: ${formatCurrency(maxLossPnL)}`, 
                              position: 'insideTopRight',
                              fill: '#ef4444',
                              fontSize: 11,
                              fontWeight: 500
                            }}
                          />
                        )}
                        {/* Current Balance Reference Line - light grey dotted */}
                        {selectedAccount && (
                          <ReferenceLine 
                            y={currentPnL} 
                            stroke="#9ca3af" 
                            strokeDasharray="3 3" 
                            strokeWidth={1}
                            label={{ 
                              value: `Current: ${formatCurrency(currentPnL)}`, 
                              position: currentPnL < 0 ? 'insideTopRight' : 'insideBottomRight',
                              fill: '#9ca3af',
                              fontSize: 11,
                              fontWeight: 500
                            }}
                          />
                        )}
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--border))' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              const tradeLabel = data.trades > 0 ? `Trade #${data.trades}` : 'Start';
                              const timeStr = data.time ? new Date(data.time).toLocaleString() : '';
                              return (
                                <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                  <p className="text-foreground text-sm font-medium">{tradeLabel}</p>
                                  {timeStr && <p className="text-xs text-muted-foreground mb-1">{timeStr}</p>}
                                  <p className={`text-sm flex items-center gap-2 ${data.pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                    <span className={`w-2 h-2 rounded-full ${data.pnl >= 0 ? 'bg-primary' : 'bg-destructive'}`}></span>
                                    P&L: {formatCurrency(data.pnl)}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="pnl" 
                          stroke={currentPnL >= 0 ? 'hsl(var(--primary))' : '#ef4444'}
                          strokeWidth={2}
                          strokeOpacity={0.8}
                          fill={currentPnL >= 0 ? 'url(#areaGradientPositive)' : 'url(#areaGradientNegative)'}
                          fillOpacity={1}
                          dot={<CustomDot />}
                          activeDot={{ r: 6, stroke: currentPnL >= 0 ? 'hsl(var(--primary))' : '#ef4444', strokeWidth: 2, fill: currentPnL >= 0 ? 'hsl(var(--primary))' : '#ef4444' }}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payout Panel - 2 columns */}
          <div className="col-span-7 lg:col-span-2">
            <Card className={`bg-card/80 backdrop-blur-sm h-[530px] ${
              selectedAccount?.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]' :
              selectedAccount?.phase === 'evaluation' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' :
              'border-border/50'
            }`}>
              <CardContent className="p-4 h-full flex flex-col relative">
                {/* Evaluation account overlay */}
                {selectedAccount?.phase === 'evaluation' && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-card/80 backdrop-blur-[2px]">
                    <Lock className="h-10 w-10 text-yellow-500/60 mb-3" />
                    <p className="text-sm font-medium text-yellow-500/80">Coming soon hedger ;)</p>
                    <p className="text-xs text-muted-foreground mt-1">Evaluation accounts can't receive payouts</p>
                  </div>
                )}
                <div className={`flex items-center justify-between mb-4 ${selectedAccount?.phase === 'evaluation' ? 'opacity-20' : ''}`}>
                  <h3 className="text-lg font-medium text-foreground">Payouts</h3>
                  {selectedAccount && selectedAccount.phase !== 'evaluation' && !isAddingPayout && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setIsAddingPayout(true)}
                      className="h-8 gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  )}
                </div>

                {/* Add Payout Form */}
                {isAddingPayout && selectedAccount && (
                  <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
                    <Label className="text-xs text-muted-foreground">Payout Amount</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={newPayoutAmount}
                          onChange={(e) => {
                            // Only allow numbers and decimal point
                            const value = e.target.value.replace(/[^0-9.]/g, '');
                            setNewPayoutAmount(value);
                          }}
                          className="pl-8 h-9"
                        />
                      </div>
                      <Button 
                        size="sm" 
                        className="h-9"
                        onClick={() => {
                          if (newPayoutAmount && selectedAccount) {
                            const newPayout: PayoutEntry = {
                              id: Date.now().toString(),
                              accountId: selectedAccount.id,
                              accountName: selectedAccount.account_name,
                              amount: parseFloat(newPayoutAmount),
                              date: new Date().toISOString().split('T')[0],
                              received: false,
                              denied: false,
                            };
                            const updated = [...payouts, newPayout];
                            setPayouts(updated);
                            savePayouts(updated);
                            setNewPayoutAmount('');
                            setIsAddingPayout(false);
                          }
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-9"
                        onClick={() => {
                          setNewPayoutAmount('');
                          setIsAddingPayout(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Payout Summary */}
                <div className={`grid grid-cols-2 gap-3 mb-4 ${selectedAccount?.phase === 'evaluation' ? 'opacity-20' : ''}`}>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Requested Payouts</p>
                    <p className="text-lg font-semibold text-primary">
                      {formatCurrency(payouts.filter(p => selectedAccountId === 'all' || p.accountId === selectedAccountId).reduce((sum, p) => sum + p.amount, 0))}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(payouts.filter(p => p.received && (selectedAccountId === 'all' || p.accountId === selectedAccountId)).reduce((sum, p) => sum + p.amount, 0))}
                    </p>
                  </div>
                </div>

                {/* Payout List */}
                <div className={`flex-1 overflow-y-auto space-y-2 ${selectedAccount?.phase === 'evaluation' ? 'opacity-20' : ''}`}>
                  {payouts
                    .filter(p => selectedAccountId === 'all' || p.accountId === selectedAccountId)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((payout) => (
                      <div 
                        key={payout.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 hover:border-border/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatCurrency(payout.amount)}</span>
                            <Badge 
                              variant={payout.received ? 'default' : payout.denied ? 'destructive' : 'secondary'}
                              className={`text-[10px] ${payout.received ? 'bg-primary/20 text-primary' : payout.denied ? 'bg-destructive/20 text-destructive' : ''}`}
                            >
                              {payout.received ? 'Received' : payout.denied ? 'Denied' : 'Pending'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {payout.accountName} • {payout.date}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              const updated = payouts.map(p => 
                                p.id === payout.id ? { ...p, received: !p.received, denied: false } : p
                              );
                              setPayouts(updated);
                              savePayouts(updated);
                            }}
                          >
                            <Check className={`h-3.5 w-3.5 ${payout.received ? 'text-primary' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              const updated = payouts.map(p => 
                                p.id === payout.id ? { ...p, denied: !p.denied, received: false } : p
                              );
                              setPayouts(updated);
                              savePayouts(updated);
                            }}
                          >
                            <X className={`h-3.5 w-3.5 ${payout.denied ? 'text-destructive' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const updated = payouts.filter(p => p.id !== payout.id);
                              setPayouts(updated);
                              savePayouts(updated);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  
                  {payouts.filter(p => selectedAccountId === 'all' || p.accountId === selectedAccountId).length === 0 && (
                    <div className="flex items-center justify-center h-40">
                      <div className="text-center text-muted-foreground">
                        <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No payouts yet</p>
                        <p className="text-xs mt-1">
                          {selectedAccount 
                            ? 'Add a payout to track your earnings'
                            : 'Select an account to add payouts'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageBackground>
  );
};

export default DashboardAnalytics;
