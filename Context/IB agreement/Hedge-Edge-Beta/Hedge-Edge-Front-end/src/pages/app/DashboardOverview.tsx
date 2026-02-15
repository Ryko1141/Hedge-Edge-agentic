import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { logger } from '@/lib/logger';
import { useTradingAccounts, TradingAccount } from '@/hooks/useTradingAccounts';
import { useConnectionsFeed } from '@/hooks/useConnectionsFeed';
import { useHedgeStats } from '@/hooks/useHedgeStats';
import { useCopierGroupsContext } from '@/contexts/CopierGroupsContext';
import { isBridgeAvailable, mt5, type AccountSnapshot } from '@/lib/local-trading-bridge';
import type { ConnectionSnapshot } from '@/types/connections';
import { AccountCard } from '@/components/dashboard/AccountCard';
import { AddAccountModal } from '@/components/dashboard/AddAccountModal';
import { AccountDetailsModal } from '@/components/dashboard/AccountDetailsModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GradientText } from '@/components/ui/gradient-text';
import { AnimatedCurrency } from '@/components/ui/animated-counter';
import { ShinyText } from '@/components/ui/shiny-text';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Target, 
  BarChart3,
  RefreshCw,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Settings,
  Zap,
  Shield,
} from 'lucide-react';

const DashboardOverview = () => {
  const { accounts, loading, createAccount, deleteAccount, archiveAccount, restoreAccount, syncAccountFromMT5 } = useTradingAccounts();
  const { snapshots, getSnapshot, disconnect, archiveDisconnect, refreshFromEA, manualRefreshAll } = useConnectionsFeed({ autoStart: true, debug: true });
  const { groups: copierGroups } = useCopierGroupsContext();
  const { getAggregateHedgeStats, getAccountHedgeStats } = useHedgeStats(accounts, copierGroups, getSnapshot);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedAccount, setSelectedAccount] = useState<TradingAccount | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  // Terminal bridge connectivity — polls the local trading bridge for each account
  // so cards reflect real-time connectivity (same source the modal uses)
  const [terminalSnapshots, setTerminalSnapshots] = useState<Record<string, AccountSnapshot>>({});
  const terminalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollTerminalAccounts = useCallback(async () => {
    if (!isBridgeAvailable()) return;

    try {
      const status = await mt5.getStatus();
      if (!status.success || !status.data?.terminalRunning) {
        // Terminal not running — clear all terminal snapshots
        setTerminalSnapshots(prev => Object.keys(prev).length > 0 ? {} : prev);
        return;
      }

      const nonArchivedWithLogin = accounts.filter(a => !a.is_archived && a.login);
      const newSnaps: Record<string, AccountSnapshot> = {};

      // Check each account concurrently (IPC is fast, same process)
      await Promise.all(
        nonArchivedWithLogin.map(async (account) => {
          try {
            const result = await mt5.getSnapshot({
              login: String(account.login),
              password: '',
              server: String(account.server || ''),
            });
            if (result.success && result.data) {
              newSnaps[String(account.login)] = result.data;
            }
          } catch {
            // Account not available via terminal — skip
          }
        })
      );

      setTerminalSnapshots(newSnaps);
    } catch (err) {
      logger.error('Terminal poll error', { component: 'DashboardOverview', error: err instanceof Error ? err.message : String(err) });
    }
  }, [accounts]);

  // Start terminal polling on mount and whenever accounts change
  useEffect(() => {
    // Initial poll after a short delay to let the app settle
    const initTimer = setTimeout(pollTerminalAccounts, 1500);

    // Then poll every 5 seconds
    terminalPollRef.current = setInterval(pollTerminalAccounts, 5000);

    return () => {
      clearTimeout(initTimer);
      if (terminalPollRef.current) clearInterval(terminalPollRef.current);
    };
  }, [pollTerminalAccounts]);

  // Auto-refresh from EA files on mount
  useEffect(() => {
    // Give the app a moment to initialize, then refresh from EA files
    const timer = setTimeout(() => {
      refreshFromEA?.().then((result) => {
        logger.debug('EA refresh completed', { component: 'DashboardOverview' });
      }).catch((err: unknown) => logger.error('EA refresh failed', { component: 'DashboardOverview', error: err instanceof Error ? err.message : String(err) }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [refreshFromEA]);

  // Manual refresh handler for the Refresh button
  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [result] = await Promise.all([
        manualRefreshAll(),
        pollTerminalAccounts(), // Also refresh terminal bridge data immediately
      ]);
      logger.debug('Manual refresh completed', { component: 'DashboardOverview' });
      setLastRefreshTime(new Date());
    } catch (err) {
      logger.error('Manual refresh failed', { component: 'DashboardOverview', error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper to synthesize a ConnectionSnapshot from local terminal data
  const buildTerminalSnapshot = useCallback((account: TradingAccount, snap: AccountSnapshot): ConnectionSnapshot => {
    return {
      session: {
        id: String(account.login),
        accountId: account.id,
        platform: 'mt5',
        role: 'local',
        status: 'connected',
        lastUpdate: snap.timestamp || new Date().toISOString(),
      },
      metrics: {
        balance: snap.balance,
        equity: snap.equity,
        profit: snap.profit,
        positionCount: snap.positions_count || 0,
        margin: snap.margin,
        freeMargin: snap.margin_free,
        marginLevel: snap.margin_level,
      },
      positions: snap.positions?.map(p => ({
        ticket: p.ticket,
        symbol: p.symbol,
        type: p.type.toLowerCase() as 'buy' | 'sell',
        volume: p.volume,
        openPrice: p.price_open,
        currentPrice: p.price_current,
        profit: p.profit,
        stopLoss: p.sl,
        takeProfit: p.tp,
        openTime: p.time,
        magic: p.magic,
        comment: p.comment,
      })),
      timestamp: snap.timestamp || new Date().toISOString(),
    };
  }, []);

  // Helper to get connection snapshot for an account
  // Checks supervisor first, then falls back to local terminal bridge data
  // Returns null for archived accounts - they should be fully disconnected
  const getAccountSnapshot = useCallback((account: TradingAccount): ConnectionSnapshot | null => {
    // Archived accounts should NEVER have connection snapshots - they are fully disconnected
    if (account.is_archived) return null;
    if (!account.login) return null;

    // 1. Try supervisor snapshot first (most authoritative)
    //    getSnapshot now supports direct key, "mt5-<login>" prefix, and mt5Login fallback
    const supervisorSnap = getSnapshot(account.login) || getSnapshot(account.id);
    if (supervisorSnap) return supervisorSnap;

    // 2. Fallback: check local terminal bridge data
    const terminalSnap = terminalSnapshots[String(account.login)];
    if (terminalSnap) {
      return buildTerminalSnapshot(account, terminalSnap);
    }

    // Debug: log when we can't find a snapshot for an account that has a login
    // This helps diagnose "shows Disconnected when actually connected" issues
    if (Object.keys(snapshots).length > 0) {
      logger.debug('No snapshot found for account', {
        component: 'DashboardOverview',
        metadata: {
          accountName: account.account_name,
          snapshotKeyCount: Object.keys(snapshots).length,
        },
      });
    }

    return null;
  }, [getSnapshot, terminalSnapshots, buildTerminalSnapshot, snapshots]);

  const handleAccountClick = (account: TradingAccount) => {
    setSelectedAccount(account);
    setDetailsModalOpen(true);
  };

  // Wrapper to disconnect account from MT5 before archiving
  // Also persists the current hedge P/L so subsequent phases can factor it into lot sizing
  const handleArchiveAccount = async (id: string) => {
    const account = accounts.find(a => a.id === id);

    // Compute this account's hedge P/L before disconnecting
    let hedgePnL: number | undefined;
    if (account && account.phase !== 'live') {
      const stats = getAccountHedgeStats(account);
      hedgePnL = stats.hedgePnL;
      logger.debug('Storing hedge P/L on archive', { component: 'DashboardOverview', metadata: { accountName: account.account_name } });
    }

    if (account?.login) {
      // Archive-disconnect: fully removes session so health-check won't auto-reconnect
      // The ZMQ bridge stays alive so the terminal can be re-used for a new account
      logger.info('Archive-disconnecting account', { component: 'DashboardOverview' });
      await archiveDisconnect(account.login, 'Account archived');
      // Also try with account id in case that's the key used
      await archiveDisconnect(account.id, 'Account archived');
    }
    // Then archive the account (with hedge P/L persisted)
    return archiveAccount(id, hedgePnL);
  };

  // Wrapper to handle restore and tab switching
  const handleRestoreAccount = async (id: string) => {
    // Count archived accounts BEFORE restoring (excluding the one being restored)
    const archivedCountAfterRestore = accounts.filter(a => a.is_archived && a.id !== id).length;
    
    // Restore the account
    await restoreAccount(id);
    
    // If no more archived accounts remain, switch to "All Accounts" tab
    if (archivedCountAfterRestore === 0) {
      setActiveTab('all');
    }
    // Otherwise, stay on the archived tab (no action needed)
  };

  // Wrapper to handle delete and tab switching (when deleting from archived tab)
  const handleDeleteAccount = async (id: string) => {
    // Count archived accounts BEFORE deleting (excluding the one being deleted)
    const archivedCountAfterDelete = accounts.filter(a => a.is_archived && a.id !== id).length;
    
    // Check if this is an archived account being deleted
    const isArchived = accounts.find(a => a.id === id)?.is_archived;
    
    // Delete the account
    await deleteAccount(id);
    
    // If we were on the archived tab and no more archived accounts remain, switch to "all"
    if (isArchived && activeTab === 'archived' && archivedCountAfterDelete === 0) {
      setActiveTab('all');
    }
  };

  // Filter accounts: "all" excludes archived, "archived" shows only archived
  const filteredAccounts = accounts.filter((account) => {
    const isArchived = account.is_archived;
    if (activeTab === 'archived') return isArchived;
    if (activeTab === 'all') return !isArchived;
    // For phase-specific tabs, exclude archived
    return account.phase === activeTab && !isArchived;
  });

  // Calculate stats (exclude archived accounts)
  const activeAccounts = accounts.filter(a => !a.is_archived);
  const propAccounts = activeAccounts.filter(a => a.phase === 'funded' || a.phase === 'evaluation');
  const hedgeAccounts = activeAccounts.filter(a => a.phase === 'live');

  // Assets Under Management = cumulative sum of account_size for funded + evaluation accounts only (excludes hedge accounts)
  const totalAUM = propAccounts.reduce((sum, acc) => sum + (Number(acc.account_size) || 0), 0);

  // --- Total P&L = P - (H + HD + E) ---
  // P = total received payouts from all accounts
  const totalReceivedPayouts = useMemo(() => {
    try {
      const stored = localStorage.getItem('hedge_edge_payouts');
      const payouts: Array<{ amount: number; received: boolean }> = stored ? JSON.parse(stored) : [];
      return payouts.filter(p => p.received).reduce((sum, p) => sum + p.amount, 0);
    } catch {
      return 0;
    }
  }, [accounts]); // re-compute when accounts change (proxy for data changes)

  // H = cumulative Hedge P/L (attributed from copier engine per-leader)
  // HD = hedge discrepancy = Σ HD_i using formula: HD_i = -(P_f,i × F_i) / (D_i × S_i) - P_h,i
  const { totalHedgePnL: cumulativeHedgePnL, totalHedgeDiscrepancy: hedgeDiscrepancy } = getAggregateHedgeStats();

  // E = cumulative eval fees for all accounts (only root accounts in a progression chain)
  const totalEvalFees = useMemo(() => {
    const allPropAccounts = accounts.filter(a => a.phase !== 'live');
    return allPropAccounts
      .filter(a => !a.previous_account_id)
      .reduce((sum, acc) => sum + (Number(acc.evaluation_fee) || 0), 0);
  }, [accounts]);

  // Total P&L = P - (H + HD + E)
  const totalPnL = totalReceivedPayouts - (Math.abs(cumulativeHedgePnL) + hedgeDiscrepancy + totalEvalFees);

  // Net ROI = ((P - C) / C) * 100  where C = |H| + HD + E
  const totalCosts = Math.abs(cumulativeHedgePnL) + hedgeDiscrepancy + totalEvalFees;
  const roiPercent = totalCosts > 0
    ? ((totalReceivedPayouts - totalCosts) / totalCosts) * 100
    : 0;

  const evaluationCount = activeAccounts.filter(a => a.phase === 'evaluation').length;
  const fundedCount = activeAccounts.filter(a => a.phase === 'funded').length;
  const hedgeCount = activeAccounts.filter(a => a.phase === 'live').length;
  const archivedCount = accounts.filter(a => a.is_archived).length;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const statsCards = [
    {
      title: 'Total P&L',
      icon: totalPnL >= 0 ? TrendingUp : TrendingDown,
      value: totalPnL,
      type: 'currency' as const,
      className: totalPnL >= 0 ? 'text-primary' : 'text-destructive',
      iconClassName: totalPnL >= 0 ? 'text-primary' : 'text-destructive',
      tooltip: 'Payouts Received - (|Hedge P/L| + Hedge Discrepancy + Eval Fees). HD = -(Pf×F)/(D×S) - Ph',
      colorByValue: true,
      shiny: totalPnL > 0,
    },
    {
      title: 'Assets Under Management',
      icon: Wallet,
      value: totalAUM,
      type: 'currency' as const,
      className: 'text-foreground',
      iconClassName: 'text-muted-foreground',
      tooltip: 'Cumulative account sizes for funded & evaluation accounts',
      colorByValue: false,
    },
    {
      title: 'ROI',
      icon: BarChart3,
      value: roiPercent,
      type: 'percent' as const,
      className: roiPercent >= 0 ? 'text-primary' : 'text-destructive',
      iconClassName: 'text-muted-foreground',
      tooltip: 'Net ROI = ((Payouts − Costs) / Costs) × 100.  Costs = |Hedge P/L| + Hedge Discrepancy + Eval Fees',
      colorByValue: true,
    },
    {
      title: 'Active Accounts',
      icon: Target,
      value: accounts.length,
      type: 'number' as const,
      subtitle: `(${evaluationCount} eval, ${fundedCount} funded, ${hedgeCount} hedge)`,
      className: 'text-foreground',
      iconClassName: 'text-muted-foreground',
      tooltip: 'Total number of connected trading accounts',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GradientText 
              colors={['hsl(120, 100%, 54%)', 'hsl(45, 100%, 56%)', 'hsl(120, 100%, 54%)']} 
              animationSpeed={4}
              className="text-2xl font-bold"
            >
              Overview
            </GradientText>
            <Sparkles className="w-5 h-5 text-secondary animate-pulse" />
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </h1>
          <p className="text-muted-foreground">Manage all your trading accounts in one place</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Last refresh timestamp */}
          {lastRefreshTime && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Last refresh: {lastRefreshTime.toLocaleTimeString()}
            </span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="group"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 transition-transform group-hover:scale-110 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh all account data from ZMQ cache (auto-refreshes every 30s)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button onClick={() => setAddModalOpen(true)} className="group">
            <Plus className="mr-2 h-4 w-4 transition-transform group-hover:rotate-90" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <TooltipProvider>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {statsCards.map((stat, index) => (
            <SpotlightCard 
              key={stat.title}
              className="rounded-xl"
              spotlightColor="hsl(var(--primary) / 0.1)"
            >
              <Card 
                className="border-border/30 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm hover:border-primary/30 group cursor-default"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <Tooltip>
                    <TooltipTrigger>
                      <stat.icon className={`h-4 w-4 transition-all duration-300 group-hover:scale-110 ${stat.iconClassName}`} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{stat.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-24 animate-shimmer" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      {stat.type === 'currency' ? (
                        stat.shiny && stat.value > 0 ? (
                          <ShinyText 
                            text={formatCurrency(stat.value)}
                            className={`text-2xl font-bold ${stat.className}`}
                            color="hsl(var(--primary))"
                            shineColor="hsl(var(--secondary))"
                            speed={3}
                          />
                        ) : (
                          <AnimatedCurrency 
                            value={stat.value} 
                            fontSize={24}
                            colorByValue={stat.colorByValue}
                          />
                        )
                      ) : stat.type === 'percent' ? (
                        <span className={`text-2xl font-bold transition-colors ${stat.className}`}>
                          {stat.value >= 0 ? '+' : ''}{stat.value.toFixed(2)}%
                        </span>
                      ) : (
                        <span className={`text-2xl font-bold transition-colors ${stat.className}`}>
                          {stat.value}
                        </span>
                      )}
                      {stat.subtitle && (
                        <p className="text-sm text-muted-foreground">
                          {stat.subtitle}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </SpotlightCard>
          ))}
        </div>
      </TooltipProvider>

      {/* Tabs & Accounts */}
      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between">
              <TabsList className="bg-muted/50 backdrop-blur-sm">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all">
                  All Accounts
                </TabsTrigger>
                <TabsTrigger value="evaluation" className="data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary transition-all">
                  Evaluation
                </TabsTrigger>
                <TabsTrigger value="funded" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all">
                  Funded
                </TabsTrigger>
                <TabsTrigger value="live" className="data-[state=active]:bg-accent/40 data-[state=active]:text-foreground transition-all">
                  Hedge
                </TabsTrigger>
                {archivedCount > 0 && (
                  <TabsTrigger value="archived" className="data-[state=active]:bg-muted data-[state=active]:text-muted-foreground transition-all">
                    Archived ({archivedCount})
                  </TabsTrigger>
                )}
              </TabsList>

            </div>

            <TabsContent value={activeTab} className="mt-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="border-border/30 bg-card/50">
                      <CardHeader className="pb-2">
                        <Skeleton className="h-5 w-32 animate-shimmer" />
                        <Skeleton className="h-4 w-24 animate-shimmer" />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Skeleton className="h-12 w-full animate-shimmer" />
                          <Skeleton className="h-12 w-full animate-shimmer" />
                        </div>
                        <Skeleton className="h-2 w-full animate-shimmer" />
                        <Skeleton className="h-2 w-full animate-shimmer" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredAccounts.length === 0 ? (
                <Card className="border-border/30 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 p-6 border-b border-border/30">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-foreground">Welcome to Hedge Edge!</h3>
                          <p className="text-muted-foreground">Let's set up your first trading account in a few easy steps</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Quick Start Steps */}
                    <div className="p-6 space-y-4">
                      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Quick Start</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group cursor-pointer" onClick={() => setAddModalOpen(true)}>
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                            <span className="text-lg font-bold text-primary">1</span>
                          </div>
                          <div>
                            <h5 className="font-medium text-foreground flex items-center gap-2">
                              Add Account
                              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </h5>
                            <p className="text-sm text-muted-foreground">Connect your MT5, cTrader, or add a manual account</p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-secondary">2</span>
                          </div>
                          <div>
                            <h5 className="font-medium text-foreground">Install EA/cBot</h5>
                            <p className="text-sm text-muted-foreground">Enable real-time sync from your trading terminal</p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-foreground">3</span>
                          </div>
                          <div>
                            <h5 className="font-medium text-foreground">Start Trading</h5>
                            <p className="text-sm text-muted-foreground">Track performance and use the trade copier</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Features Preview */}
                    <div className="p-6 pt-0">
                      <div className="flex flex-wrap gap-3 text-sm">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary">
                          <Zap className="w-3.5 h-3.5" />
                          <span>Real-time Sync</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 text-secondary">
                          <Shield className="w-3.5 h-3.5" />
                          <span>Secure Local Connection</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 text-foreground">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Performance Analytics</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* CTA */}
                    <div className="p-6 pt-0 flex justify-center">
                      <Button size="lg" onClick={() => setAddModalOpen(true)} className="group">
                        <Plus className="mr-2 h-5 w-5 transition-transform group-hover:rotate-90" />
                        Add Your First Account
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredAccounts.map((account, index) => (
                    <SpotlightCard
                      key={account.id}
                      className="animate-fade-in-up rounded-xl"
                      style={{ animationDelay: `${index * 75}ms` }}
                      spotlightColor={account.phase === 'funded' ? 'hsl(var(--primary) / 0.12)' : account.phase === 'evaluation' ? 'hsl(var(--secondary) / 0.12)' : 'hsl(210, 100%, 50% / 0.12)'}
                    >
                      <AccountCard
                        account={account}
                        onDelete={handleDeleteAccount}
                        onArchive={handleArchiveAccount}
                        onRestore={handleRestoreAccount}
                        onClick={handleAccountClick}
                        connectionSnapshot={getAccountSnapshot(account)}
                      />
                    </SpotlightCard>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AddAccountModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSubmit={createAccount}
        existingAccounts={accounts}
      />

      <AccountDetailsModal
        account={selectedAccount}
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        onSyncAccount={syncAccountFromMT5}
        connectionSnapshot={selectedAccount ? getAccountSnapshot(selectedAccount) : null}
      />
    </div>
  );
};

export default DashboardOverview;