import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { TradingAccount } from "@/hooks/useTradingAccounts";
import { useVPSMT5Feed } from "@/hooks/useVPSMT5Feed";
import { useHedgeStats } from "@/hooks/useHedgeStats";
import { useCopierGroupsContext } from "@/contexts/CopierGroupsContext";
import { useConnectionsFeed } from "@/hooks/useConnectionsFeed";
import { getCachedPassword, cachePassword } from "@/lib/mt5-password-cache";
import { mt5, ctrader, isBridgeAvailable, type TradingPlatform } from "@/lib/local-trading-bridge";
import type { Position } from "@/lib/local-trading-bridge";
import type { ConnectionSnapshot, ConnectionStatus as ConnectionStatusType } from "@/types/connections";
import { getStatusBadgeClass, formatConnectionStatus } from "@/lib/desktop";
import type { CopierGroup, FollowerConfig, VolumeSizingMode } from "@/types/copier";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Wifi,
  WifiOff,
  Lock,
  Server,
  Power,
  PowerOff,
  Archive,
  Settings,
  Crown,
  Users,
  ArrowRightLeft,
  Repeat2,
  Info,
  CircleDot,
  Pause,
  AlertTriangle,
  BarChart3,
  Hash,
  ArrowRight,
  Save,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSuggestedLotMultiplier } from "@/lib/lot-multiplier";

// Type alias for backwards compatibility  
type MT5Position = Position;

// Formatting utilities
const formatCurrency = (value: number, currency = "USD"): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatLots = (volume: number): string => volume.toFixed(2);
const formatPrice = (price: number): string => price.toFixed(5);
const formatPercent = (value: number): string => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};
const calculatePnLPercent = (currentBalance: number, startingBalance: number): number => {
  if (startingBalance === 0) return 0;
  return ((currentBalance - startingBalance) / startingBalance) * 100;
};

// ─── Payout storage (same as DashboardAnalytics) ─────────────────────────────
interface PayoutEntry {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
  received: boolean;
  denied: boolean;
}

const PAYOUTS_KEY = 'hedge_edge_payouts';
const getStoredPayouts = (): PayoutEntry[] => {
  try {
    const stored = localStorage.getItem(PAYOUTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// ─── Copier config constants (same as ConfigureCopierGroupModal) ──────────

// ─── Follower form state (same as ConfigureCopierGroupModal) ──────────────

interface FollowerFormState {
  volumeSizing: VolumeSizingMode;
  lotMultiplier: string;
  reverseMode: boolean;
  symbolSuffix: string;
  symbolAliases: string;
  symbolBlacklist: string;
  magicNumberFilter: string;
}

function followerToForm(f: FollowerConfig): FollowerFormState {
  return {
    volumeSizing: 'lot-multiplier',
    lotMultiplier: String(f.lotMultiplier),
    reverseMode: true, // Always true — this copier only reverses (hedges) trades
    symbolSuffix: f.symbolSuffix,
    symbolAliases: f.symbolAliases
      .map(a => `${a.masterSymbol}=${a.slaveSymbol}${a.lotMultiplier ? `|${a.lotMultiplier}` : ''}`)
      .join(';'),
    symbolBlacklist: [
      ...(f.symbolWhitelist || []).map(s => `+${s}`),
      ...(f.symbolBlacklist || []).map(s => `-${s}`),
    ].join(';'),
    magicNumberFilter: [
      ...(f.magicNumberWhitelist || []).map(n => `+${n}`),
      ...(f.magicNumberBlacklist || []).map(n => `-${n}`),
    ].join(';'),
  };
}

function formToFollowerPatch(form: FollowerFormState): Partial<FollowerConfig> {
  const symbolAliases = form.symbolAliases
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const [left, right] = entry.split('=');
      if (!left || !right) return null;
      const [slaveSymbol, mult] = right.split('|');
      return {
        masterSymbol: left.trim(),
        slaveSymbol: slaveSymbol.trim(),
        lotMultiplier: mult ? parseFloat(mult) : undefined,
      };
    })
    .filter(Boolean) as FollowerConfig['symbolAliases'];

  const symbolWhitelist: string[] = [];
  const symbolBlacklist: string[] = [];
  form.symbolBlacklist
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(entry => {
      if (entry.startsWith('+')) symbolWhitelist.push(entry.slice(1));
      else if (entry.startsWith('-')) symbolBlacklist.push(entry.slice(1));
      else symbolBlacklist.push(entry);
    });

  // Parse magic number filter
  const magicNumberWhitelist: number[] = [];
  const magicNumberBlacklist: number[] = [];
  form.magicNumberFilter
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(entry => {
      if (entry.startsWith('+')) {
        const num = parseInt(entry.slice(1));
        if (!isNaN(num)) magicNumberWhitelist.push(num);
      } else if (entry.startsWith('-')) {
        const num = parseInt(entry.slice(1));
        if (!isNaN(num)) magicNumberBlacklist.push(num);
      } else {
        const num = parseInt(entry);
        if (!isNaN(num)) magicNumberBlacklist.push(num);
      }
    });

  return {
    volumeSizing: 'lot-multiplier' as const,
    lotMultiplier: parseFloat(form.lotMultiplier) || 1,
    reverseMode: true, // Always true — this copier only reverses (hedges) trades
    symbolSuffix: form.symbolSuffix,
    symbolAliases,
    symbolWhitelist,
    symbolBlacklist,
    magicNumberWhitelist,
    magicNumberBlacklist,
  };
}

interface AccountDetailsModalProps {
  account: TradingAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncAccount?: (id: string, data: { balance: number; equity: number; profit: number }) => void;
  /** Connection snapshot for this account (from useConnectionsFeed) */
  connectionSnapshot?: ConnectionSnapshot | null;
  /** Callback to connect the account */
  onConnect?: (account: TradingAccount, password: string) => Promise<{ success: boolean; error?: string }>;
  /** Callback to disconnect the account */
  onDisconnect?: (account: TradingAccount) => Promise<{ success: boolean; error?: string }>;
  /** The connected hedge account (if this is a prop account) or connected prop account (if this is a hedge account) */
  connectedAccount?: TradingAccount | null;
  /** Connection snapshot for the connected account */
  connectedAccountSnapshot?: ConnectionSnapshot | null;
  /** All trading accounts (for analytics tile calculations) */
  allAccounts?: TradingAccount[];
  /** Copier group for this account's link */
  copierGroup?: CopierGroup | null;
  /** Callback to save copier group changes */
  onSaveCopierGroup?: (updated: CopierGroup) => void;
}

export function AccountDetailsModal({
  account,
  open,
  onOpenChange,
  onSyncAccount,
  connectionSnapshot,
  onConnect,
  onDisconnect,
  connectedAccount,
  connectedAccountSnapshot,
  allAccounts = [],
  copierGroup,
  onSaveCopierGroup,
}: AccountDetailsModalProps) {
  // Password state for accounts without cached password
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [cachedPassword, setCachedPassword] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  
  // Terminal status
  const [terminalStatus, setTerminalStatus] = useState<'checking' | 'running' | 'not-running'>('checking');
  
  // File-based EA status - when true, we can connect without password
  const [hasFileBasedEA, setHasFileBasedEA] = useState(false);

  // Active tab for the modal content
  const [activeModalTab, setActiveModalTab] = useState<'analytics' | 'config'>('analytics');

  // ── Copier group configuration state ──────────────────────
  const [groupName, setGroupName] = useState('');
  const [leaderSuffixRemove, setLeaderSuffixRemove] = useState('');
  const [followerForms, setFollowerForms] = useState<Record<string, FollowerFormState>>({});
  const [expandedFollower, setExpandedFollower] = useState<string>('');

  // Initialise copier config state when group changes
  useEffect(() => {
    if (!copierGroup) return;
    setGroupName(copierGroup.name);
    setLeaderSuffixRemove(copierGroup.leaderSymbolSuffixRemove || '');
    const forms: Record<string, FollowerFormState> = {};
    copierGroup.followers.forEach(f => {
      forms[f.id] = followerToForm(f);
    });
    setFollowerForms(forms);
    setExpandedFollower(copierGroup.followers[0]?.id || '');
  }, [copierGroup]);

  // Compute suggested lot multiplier from the leader account's costs
  const lotSuggestion = useMemo(() => {
    if (!copierGroup || !allAccounts.length) return null;
    const leaderAccount = allAccounts.find(a => a.id === copierGroup.leaderAccountId);
    if (!leaderAccount) return null;
    const result = getSuggestedLotMultiplier(leaderAccount, allAccounts);
    return result.suggested > 0 ? result : null;
  }, [copierGroup, allAccounts]);

  const updateFollower = useCallback(
    (followerId: string, patch: Partial<FollowerFormState>) => {
      setFollowerForms(prev => ({
        ...prev,
        [followerId]: { ...prev[followerId], ...patch },
      }));
    },
    [],
  );

  const handleSaveCopierConfig = () => {
    if (!copierGroup || !onSaveCopierGroup) return;
    const updatedFollowers = copierGroup.followers.map(f => {
      const form = followerForms[f.id];
      if (!form) return f;
      return { ...f, ...formToFollowerPatch(form) };
    });
    const updated: CopierGroup = {
      ...copierGroup,
      name: groupName.trim() || copierGroup.name,
      leaderSymbolSuffixRemove: leaderSuffixRemove,
      followers: updatedFollowers,
      updatedAt: new Date().toISOString(),
    };
    onSaveCopierGroup(updated);
  };

  // ── Analytics tile calculations ───────────────────────────
  const payouts = useMemo(() => getStoredPayouts(), [open]);

  const activeAccounts = useMemo(() => allAccounts.filter(a => !a.is_archived), [allAccounts]);
  const propAccounts = useMemo(() => activeAccounts.filter(a => a.phase === 'funded' || a.phase === 'evaluation'), [activeAccounts]);
  const hedgeAccounts = useMemo(() => activeAccounts.filter(a => a.phase === 'live'), [activeAccounts]);

  // Copier groups + live snapshots for hedge P/L computation
  const { groups: copierGroups } = useCopierGroupsContext();
  const { getSnapshot } = useConnectionsFeed({ autoStart: true });
  const { getAccountHedgeStats } = useHedgeStats(allAccounts, copierGroups, getSnapshot);

  const accountHedgeStats = useMemo(() => {
    if (!account || account.phase === 'live') {
      return { hedgePnL: 0, expectedHedgePnL: 0, hedgeDiscrepancy: 0 };
    }
    return getAccountHedgeStats(account);
  }, [account, getAccountHedgeStats]);

  const selectedAccountProportionalHedgePnL = accountHedgeStats.hedgePnL;
  const selectedAccountHedgeDiscrepancy = accountHedgeStats.hedgeDiscrepancy;

  const totalChallengeFees = useMemo(() => {
    const allPropAccounts = allAccounts.filter(a => a.phase !== 'live');
    return allPropAccounts
      .filter(a => !a.previous_account_id)
      .reduce((sum, acc) => sum + (Number(acc.evaluation_fee) || 0), 0);
  }, [allAccounts]);

  const selectedAccountChallengeFee = useMemo(() => {
    if (!account || account.phase === 'live') return 0;
    let current = account;
    while (current.previous_account_id) {
      const prev = allAccounts.find(a => a.id === current.previous_account_id);
      if (prev) current = prev;
      else break;
    }
    return Number(current.evaluation_fee) || 0;
  }, [account, allAccounts]);

  const totalReceivedPayouts = useMemo(() => {
    return payouts.filter(p => p.received).reduce((sum, p) => sum + p.amount, 0);
  }, [payouts]);

  const selectedAccountPayouts = useMemo(() => {
    if (!account) return 0;
    return payouts
      .filter(p => p.received && p.accountId === account.id)
      .reduce((sum, p) => sum + p.amount, 0);
  }, [account, payouts]);

  const totalPnLValue = useMemo(() => {
    if (!account) return 0;
    if (account.phase === 'funded') {
      return selectedAccountPayouts - (Math.abs(selectedAccountProportionalHedgePnL) + selectedAccountChallengeFee + selectedAccountHedgeDiscrepancy);
    }
    return 0;
  }, [account, selectedAccountPayouts, selectedAccountProportionalHedgePnL, selectedAccountChallengeFee, selectedAccountHedgeDiscrepancy]);

  const dollarsToTarget = useMemo(() => {
    if (!account || account.phase !== 'evaluation') return 0;
    const profitTarget = (Number(account.profit_target) || 0) / 100 * (Number(account.account_size) || 0);
    const currentPnLVal = Number(account.pnl) || 0;
    return profitTarget - currentPnLVal;
  }, [account]);

  const roiValue = useMemo(() => {
    if (!account || account.phase !== 'funded') return 0;
    const costs = Math.abs(selectedAccountProportionalHedgePnL) + selectedAccountChallengeFee + selectedAccountHedgeDiscrepancy;
    return costs > 0 ? ((selectedAccountPayouts - costs) / costs) * 100 : 0;
  }, [account, selectedAccountProportionalHedgePnL, selectedAccountChallengeFee, selectedAccountHedgeDiscrepancy, selectedAccountPayouts]);

  // Get the appropriate bridge based on platform
  const getBridge = (platform: string | null | undefined) => {
    return platform?.toLowerCase() === 'ctrader' ? ctrader : mt5;
  };

  // Connection state from supervisor (if provided)
  const supervisedStatus: ConnectionStatusType = connectionSnapshot?.session.status || 'disconnected';
  const isSupervisedConnected = supervisedStatus === 'connected';
  const hasSupervisedMetrics = connectionSnapshot?.metrics != null;

  // Check for cached password, terminal status, and file-based EA when modal opens
  useEffect(() => {
    if (open && account?.login && account?.server) {
      // getCachedPassword is async — must await it
      getCachedPassword(account.login, account.server).then((cached) => {
        if (cached) {
          setCachedPassword(cached);
          setNeedsPassword(false);
        } else {
          setCachedPassword(null);
          setNeedsPassword(true);
        }
      });
      
      // Check terminal status via IPC
      if (isBridgeAvailable()) {
        setTerminalStatus('checking');
        setHasFileBasedEA(false);
        const bridge = getBridge(account.platform);
        
        // Check terminal status
        bridge.getStatus()
          .then(async (result) => {
            setTerminalStatus(result.success && result.data?.terminalRunning ? 'running' : 'not-running');
            
            // If terminal is running, check if we can get a snapshot for this specific account
            // This means file-based EA is available for this account (no password needed)
            if (result.success && result.data?.terminalRunning && account.platform?.toLowerCase() === 'mt5') {
              try {
                // Ensure we pass proper strings to IPC
                const snapshotResult = await bridge.getSnapshot({ 
                  login: String(account.login || ''), 
                  password: '', 
                  server: String(account.server || '') 
                });
                if (snapshotResult.success && snapshotResult.data) {
                  // File-based EA has data for this account - no password needed
                  setHasFileBasedEA(true);
                  setNeedsPassword(false);
                }
              } catch {
                // Snapshot failed - may need password for direct connection
              }
            }
          })
          .catch(() => setTerminalStatus('not-running'));
      } else {
        setTerminalStatus('not-running');
      }
    }
  }, [open, account?.login, account?.server, account?.platform]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setPassword("");
      setIsSubmittingPassword(false);
      setHasFileBasedEA(false);
    }
  }, [open]);

  // Use VPS MT5 feed hook - enabled when:
  // 1. Modal is open AND terminal is running AND
  // 2. Either file-based EA is available (no password needed) OR we have cached password
  const {
    snapshot,
    positions,
    isLoading,
    error,
    isConnected,
    lastUpdate,
    refresh,
  } = useVPSMT5Feed({
    login: account?.login || "",
    password: cachedPassword || "",
    server: account?.server || "",
    // NEVER fetch snapshots for archived accounts - they are fully disconnected
    enabled: open && !account?.is_archived && terminalStatus === 'running' && (hasFileBasedEA || (!!cachedPassword && !needsPassword)),
    pollInterval: 3000,
    fullSnapshot: true,
  });

  // Track if we've synced this session
  const hasSynced = useRef(false);

  // Reset sync flag when modal opens
  useEffect(() => {
    if (open) {
      hasSynced.current = false;
    }
  }, [open]);

  // Sync account data when we get MT5 snapshot
  useEffect(() => {
    if (snapshot && account && onSyncAccount && !hasSynced.current) {
      onSyncAccount(account.id, {
        balance: snapshot.balance,
        equity: snapshot.equity,
        profit: snapshot.profit,
      });
      hasSynced.current = true;
    }
  }, [snapshot, account, onSyncAccount]);

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !account?.login || !account?.server) return;
    
    setIsSubmittingPassword(true);
    
    // If we have the connection supervisor callback, use it
    if (onConnect) {
      const result = await onConnect(account, password);
      if (result.success) {
        await cachePassword(account.login, password, account.server);
        setCachedPassword(password);
        setNeedsPassword(false);
      }
    } else {
      // Legacy behavior - just cache the password
      await cachePassword(account.login, password, account.server);
      setCachedPassword(password);
      setNeedsPassword(false);
    }
    
    setIsSubmittingPassword(false);
  };

  if (!account) return null;

  // Calculate actual P&L from MT5 data or account data
  const accountSize = Number(account.account_size) || 0;
  const mt5Balance = snapshot?.balance || 0;
  
  // Calculate P&L based on actual balance vs account size
  const actualPnL = mt5Balance > 0 ? mt5Balance - accountSize : Number(account.pnl) || 0;
  const actualPnLPercent = accountSize > 0 ? calculatePnLPercent(mt5Balance || accountSize, accountSize) : 0;
  const isProfit = actualPnL >= 0;

  const phaseConfig = {
    evaluation: {
      badge: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
      label: "Evaluation",
    },
    funded: {
      badge: "bg-primary/20 text-primary border-primary/30",
      label: "Funded",
    },
    live: {
      badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      label: "Hedge",
    },
  };

  const config = phaseConfig[account.phase];
  
  // Check if account is archived
  const isArchived = account.is_archived;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn(
        "w-full sm:max-w-xl md:max-w-2xl overflow-hidden flex flex-col",
        isArchived && "grayscale opacity-80"
      )}>
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                {account.account_name}
                <Badge variant="outline" className={isArchived ? "bg-muted/30 text-muted-foreground border-muted-foreground/20" : config.badge}>
                  {isArchived ? "Archived" : config.label}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {account.prop_firm || "Personal"} • {account.platform}
              </SheetDescription>
            </div>
          </div>

          {/* Archived Account Notice */}
          {isArchived && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg mt-2 text-sm text-muted-foreground">
              <Archive className="h-4 w-4" />
              <span>This account is archived and fully disconnected. Showing last recorded data.</span>
            </div>
          )}

          {/* VPS and Connection Status - only show for non-archived accounts */}
          {!isArchived && (
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg mt-2">
            <div className="flex items-center gap-2">
              {/* Supervised Connection Status (if using connection supervisor) */}
              {connectionSnapshot && (
                <Badge
                  variant="outline"
                  className={getStatusBadgeClass(supervisedStatus)}
                >
                  {isSupervisedConnected ? (
                    <Wifi className="h-3 w-3 mr-1" />
                  ) : supervisedStatus === 'connecting' || supervisedStatus === 'reconnecting' ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <WifiOff className="h-3 w-3 mr-1" />
                  )}
                  {formatConnectionStatus(supervisedStatus)}
                </Badge>
              )}
              
              {/* Legacy Connection Status (fallback when not using supervisor) */}
              {!connectionSnapshot && !needsPassword && terminalStatus === 'running' && (
                (isConnected || snapshot) ? (
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-primary border-primary/20"
                  >
                    <Wifi className="h-3 w-3 mr-1" />
                    MT5 Connected
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-red-500/10 text-red-500 border-red-500/20"
                  >
                    <WifiOff className="h-3 w-3 mr-1" />
                    Disconnected
                  </Badge>
                )
              )}
              
              {/* Live metrics indicator */}
              {hasSupervisedMetrics && connectionSnapshot?.metrics?.positionCount != null && (
                <Badge variant="secondary" className="text-xs">
                  {connectionSnapshot.metrics.positionCount} position{connectionSnapshot.metrics.positionCount !== 1 ? 's' : ''}
                </Badge>
              )}
              
              {snapshot && !connectionSnapshot && (
                <span className="text-xs text-muted-foreground">
                  #{snapshot.login}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Last update time */}
              {(connectionSnapshot?.timestamp || lastUpdate) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {connectionSnapshot?.timestamp 
                    ? new Date(connectionSnapshot.timestamp).toLocaleTimeString()
                    : lastUpdate?.toLocaleTimeString()}
                </span>
              )}
              
              {/* Connect/Disconnect buttons */}
              {onConnect && onDisconnect && !isSupervisedConnected && supervisedStatus !== 'connecting' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (cachedPassword && account) {
                      onConnect(account, cachedPassword);
                    } else {
                      setNeedsPassword(true);
                    }
                  }}
                  disabled={!cachedPassword && !needsPassword}
                >
                  <Power className="h-3.5 w-3.5 mr-1" />
                  Connect
                </Button>
              )}
              
              {onDisconnect && isSupervisedConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => account && onDisconnect(account)}
                >
                  <PowerOff className="h-3.5 w-3.5 mr-1" />
                  Disconnect
                </Button>
              )}
              
              {/* Refresh button (legacy) */}
              {!connectionSnapshot && !needsPassword && terminalStatus === 'running' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              )}
            </div>
          </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-4 pr-4">

            {/* ── Analytics Tiles + Config Tabs (funded/evaluation only) ── */}
            {account && (account.phase === 'funded' || account.phase === 'evaluation') && allAccounts.length > 0 && (
              <>
                {/* Analytics Tiles */}
                <div className={`grid gap-3 ${account.phase === 'evaluation' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'}`}>
                  {/* Total P/L - funded only */}
                  {account.phase === 'funded' && (
                    <div className={`flex flex-col justify-between p-3 rounded-lg bg-card border ${
                      account.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                    }`}>
                      <h3 className="text-xs font-medium text-muted-foreground mb-1">Total P/L</h3>
                      <span className={`text-lg font-semibold ${totalPnLValue >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatCurrency(totalPnLValue)}
                      </span>
                    </div>
                  )}

                  {/* Hedge P/L */}
                  <div className={`flex flex-col justify-between p-3 rounded-lg bg-card border ${
                    account.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                  }`}>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1">Hedge P/L</h3>
                    <span className={`text-lg font-semibold ${selectedAccountProportionalHedgePnL >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(selectedAccountProportionalHedgePnL)}
                    </span>
                  </div>

                  {/* Prop balance */}
                  <div className={`flex flex-col justify-between p-3 rounded-lg bg-card border ${
                    account.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                  }`}>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1">Prop balance</h3>
                    <span className={`text-lg font-semibold ${(Number(account.pnl) || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {formatCurrency(Number(account.pnl) || 0)}
                    </span>
                  </div>

                  {/* $ to Target / ROI */}
                  <div className={`flex flex-col justify-between p-3 rounded-lg bg-card border ${
                    account.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                  }`}>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1">
                      {account.phase === 'evaluation' ? '$ to Target' : 'ROI'}
                    </h3>
                    {account.phase === 'evaluation' ? (
                      <span className={`text-lg font-semibold ${dollarsToTarget <= 0 ? 'text-primary' : 'text-yellow-400'}`}>
                        {dollarsToTarget <= 0 ? 'Target Reached!' : formatCurrency(dollarsToTarget)}
                      </span>
                    ) : (
                      <span className={`text-lg font-semibold ${roiValue >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {roiValue.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  {/* Hedge Discrepancy */}
                  <div className={`flex flex-col justify-between p-3 rounded-lg bg-card border ${
                    account.phase === 'funded' ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]'
                  }`}>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1">Hedge Discrepancy</h3>
                    <span className={`text-lg font-semibold ${Math.abs(selectedAccountHedgeDiscrepancy) < 100 ? 'text-primary' : 'text-secondary'}`}>
                      {formatCurrency(selectedAccountHedgeDiscrepancy)}
                    </span>
                  </div>
                </div>

                {/* Tab switcher: Account Details vs Link Configuration */}
                {copierGroup && (
                  <Tabs value={activeModalTab} onValueChange={(v) => setActiveModalTab(v as 'analytics' | 'config')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                      <TabsTrigger value="analytics" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <Activity className="h-3.5 w-3.5 mr-1" />
                        Account Details
                      </TabsTrigger>
                      <TabsTrigger value="config" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <Settings className="h-3.5 w-3.5 mr-1" />
                        Link Configuration
                      </TabsTrigger>
                    </TabsList>

                    {/* ── Link Configuration Tab (embedded copier settings) ── */}
                    <TabsContent value="config" className="mt-3 space-y-4">
                      {/* Group Name */}
                      <div className="space-y-2">
                        <Label className="font-semibold text-sm">Group Name</Label>
                        <Input
                          value={groupName}
                          onChange={e => setGroupName(e.target.value)}
                          placeholder="e.g. FTMO 100k → IC Markets Hedge"
                          className="text-sm"
                        />
                      </div>

                      <Separator />

                      {/* Leader Info (read-only) */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <Label className="font-semibold text-sm">Leader Account (Master)</Label>
                        </div>
                        <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                          <div className="flex items-center gap-2">
                            <CircleDot className="h-4 w-4 text-green-500" />
                            <span className="font-medium text-foreground text-sm">{copierGroup.leaderAccountName}</span>
                            <Badge variant="outline" className={`text-[10px] ${
                              copierGroup.leaderPhase === 'evaluation' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' :
                              copierGroup.leaderPhase === 'funded' ? 'bg-primary/20 text-primary border-primary/30' :
                              'bg-blue-500/20 text-blue-500 border-blue-500/30'
                            }`}>
                              {copierGroup.leaderPhase === 'evaluation' ? 'EVAL' : copierGroup.leaderPhase === 'funded' ? 'FUNDED' : 'HEDGE'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">({copierGroup.leaderPlatform})</span>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Leader Symbol Suffix Remove */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="font-semibold text-sm">Remove Symbol Suffix (Leader)</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>If the leader account has symbol suffixes (e.g. EURUSD_x), enter the suffix here to remove it before sending to followers.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Input
                          value={leaderSuffixRemove}
                          onChange={e => setLeaderSuffixRemove(e.target.value)}
                          placeholder="e.g. _x or .raw (leave blank if none)"
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Strips this suffix from all leader symbols before processing on followers.
                        </p>
                      </div>

                      <Separator />

                      {/* Per-follower settings */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          <Label className="font-semibold text-sm">Follower Settings</Label>
                        </div>

                        <Accordion
                          type="single"
                          collapsible
                          value={expandedFollower}
                          onValueChange={setExpandedFollower}
                        >
                          {copierGroup.followers.map(follower => {
                            const form = followerForms[follower.id];
                            if (!form) return null;

                            return (
                              <AccordionItem key={follower.id} value={follower.id} className="border border-border/40 rounded-lg mb-2 overflow-hidden">
                                <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/20">
                                  <div className="flex items-center gap-2 text-left">
                                    <CircleDot className="h-3.5 w-3.5 text-green-500" />
                                    <span className="font-medium text-sm">{follower.accountName}</span>
                                    <Badge variant="outline" className={`text-[10px] ${
                                      follower.phase === 'evaluation' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' :
                                      follower.phase === 'funded' ? 'bg-primary/20 text-primary border-primary/30' :
                                      'bg-blue-500/20 text-blue-500 border-blue-500/30'
                                    }`}>
                                      {follower.phase === 'evaluation' ? 'EVAL' : follower.phase === 'funded' ? 'FUNDED' : 'HEDGE'}
                                    </Badge>
                                    {form.reverseMode && (
                                      <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-500 border-purple-500/30">
                                        <Repeat2 className="h-3 w-3 mr-0.5" />
                                        Reverse
                                      </Badge>
                                    )}
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-3 pb-3 pt-1">
                                  <InlineFollowerConfigPanel
                                    follower={follower}
                                    form={form}
                                    onUpdate={(patch) => updateFollower(follower.id, patch)}
                                    lotSuggestion={lotSuggestion}
                                  />
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>

                      {/* Save Button */}
                      <Button onClick={handleSaveCopierConfig} className="w-full">
                        <Save className="h-4 w-4 mr-1" />
                        Save Configuration
                      </Button>
                    </TabsContent>

                    <TabsContent value="analytics" className="mt-0" />
                  </Tabs>
                )}
              </>
            )}
            
            {/* ── Original Account Details Content (hidden when config tab active) ── */}
            {!(account && (account.phase === 'funded' || account.phase === 'evaluation') && copierGroup && activeModalTab === 'config') && (
            <>
            {/* Password Required - only show if no file-based EA available */}
            {needsPassword && !hasFileBasedEA && (terminalStatus === 'running' || connectionSnapshot) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4" />
                    Enter MT5 Password
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      To view live account data, please enter your MT5 password.
                      It will be cached securely for this session.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="mt5-password">MT5 Password</Label>
                      <Input
                        id="mt5-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-muted/30 border-border/50"
                      />
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>Login: {account.login}</span>
                      <span>•</span>
                      <span>Server: {account.server}</span>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={!password || isSubmittingPassword}
                    >
                      {isSubmittingPassword ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Power className="h-4 w-4 mr-2" />
                      )}
                      Connect to Account
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {terminalStatus === 'not-running' && (
              <Card className="border-orange-500/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-500 text-sm">
                    <Server className="h-4 w-4" />
                    Connection Unavailable
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Unable to connect to your trading terminal. Make sure it's running locally.
                  </p>
                  <Button 
                    onClick={() => {
                      setTerminalStatus('checking');
                      const bridge = getBridge(account?.platform);
                      bridge.getStatus()
                        .then(result => setTerminalStatus(result.success && result.data?.terminalRunning ? 'running' : 'not-running'))
                        .catch(() => setTerminalStatus('not-running'));
                    }} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Connection
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Checking Connection */}
            {terminalStatus === 'checking' && (
              <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  Checking connection...
                </p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !snapshot && !needsPassword && terminalStatus === 'running' && (
              <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  Connecting to MT5...
                </p>
              </div>
            )}

            {/* Error State */}
            {error && !snapshot && !needsPassword && terminalStatus === 'running' && (
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    Connection Error
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <div className="flex gap-2">
                    <Button onClick={refresh} variant="outline" size="sm" className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                    <Button 
                      onClick={() => {
                        setNeedsPassword(true);
                        setCachedPassword(null);
                      }} 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                    >
                      <Lock className="h-4 w-4 mr-2" />
                      Re-enter Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Account Info - shown for both supervised connections and legacy */}
            {(hasSupervisedMetrics || (snapshot || (!needsPassword && !error)) && terminalStatus === 'running') && (
              <>
                {/* Account Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Account Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Account Size</span>
                      <span className="font-medium">{formatCurrency(accountSize)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Login</span>
                      <span className="font-mono">{account.login || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Server</span>
                      <span className="font-mono">{account.server || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform</span>
                      <span>{account.platform || "MT5"}</span>
                    </div>
                    {hasSupervisedMetrics && connectionSnapshot?.metrics && (
                      <>
                        <Separator />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Balance</span>
                          <span className="font-medium">{formatCurrency(connectionSnapshot.metrics.balance)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Equity</span>
                          <span className="font-medium">{formatCurrency(connectionSnapshot.metrics.equity)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Profit</span>
                          <span className={`font-medium ${connectionSnapshot.metrics.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {formatCurrency(connectionSnapshot.metrics.profit)}
                          </span>
                        </div>
                      </>
                    )}
                    {snapshot && (
                      <>
                        <Separator />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Broker</span>
                          <span>{snapshot.broker}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Account Name</span>
                          <span>{snapshot.name}</span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

              </>
            )}
            </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Position Row Component (for Connection Supervisor positions)
 */
function ConnectionPositionRow({
  position,
}: {
  position: {
    ticket: number;
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
  };
}) {
  const isBuy = position.type === 'buy';
  const isProfit = position.profit >= 0;

  return (
    <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        <div
          className={`p-1.5 rounded-full ${
            isBuy ? "bg-primary/10" : "bg-red-500/10"
          }`}
        >
          {isBuy ? (
            <ArrowUpRight className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-red-500" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium flex items-center gap-1">
            {position.symbol}
            <Badge
              variant={isBuy ? "default" : "destructive"}
              className="text-[10px] px-1 py-0"
            >
              {position.type.toUpperCase()}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatLots(position.volume)} lots @ {formatPrice(position.openPrice)}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-medium">
          {formatPrice(position.currentPrice)}
        </div>
        <div
          className={`text-xs font-medium ${
            isProfit ? "text-primary" : "text-red-500"
          }`}
        >
          {isProfit ? "+" : ""}
          {formatCurrency(position.profit)}
        </div>
      </div>
    </div>
  );
}

/**
 * Position Row Component
 */
function PositionRow({
  position,
  currency,
}: {
  position: MT5Position;
  currency: string;
}) {
  const isBuy = position.type === "BUY";
  const isProfit = position.profit >= 0;

  return (
    <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        <div
          className={`p-1.5 rounded-full ${
            isBuy ? "bg-primary/10" : "bg-red-500/10"
          }`}
        >
          {isBuy ? (
            <ArrowUpRight className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-red-500" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium flex items-center gap-1">
            {position.symbol}
            <Badge
              variant={isBuy ? "default" : "destructive"}
              className="text-[10px] px-1 py-0"
            >
              {position.type}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatLots(position.volume)} lots @ {formatPrice(position.price_open)}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-medium">
          {formatPrice(position.price_current)}
        </div>
        <div
          className={`text-xs font-medium ${
            isProfit ? "text-primary" : "text-red-500"
          }`}
        >
          {isProfit ? "+" : ""}
          {formatCurrency(position.profit, currency)}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline Follower Config Panel (embedded in AccountDetailsModal)
 * Same settings as ConfigureCopierGroupModal's FollowerConfigPanel
 */
function InlineFollowerConfigPanel({
  follower,
  form,
  onUpdate,
  lotSuggestion,
}: {
  follower: FollowerConfig;
  form: FollowerFormState;
  onUpdate: (patch: Partial<FollowerFormState>) => void;
  lotSuggestion?: { suggested: number; costToRecover: number; evalFee: number; archivedHedgePnL: number; maxDrawdownDecimal: number; accountSize: number } | null;
}) {
  return (
    <div className="space-y-4">
      {/* Volume Sizing — always Lot Multiplier */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          <Label className="font-semibold text-xs">Volume Sizing</Label>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Lot Multiplier</Label>
            {lotSuggestion && lotSuggestion.suggested > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onUpdate({ lotMultiplier: String(lotSuggestion.suggested) })}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors cursor-pointer"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      Suggested: {lotSuggestion.suggested}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Cost to recover: ${lotSuggestion.costToRecover.toLocaleString()}<br />
                      (Fee: ${lotSuggestion.evalFee.toLocaleString()}
                      {lotSuggestion.archivedHedgePnL > 0 && <> + Hedge losses: ${lotSuggestion.archivedHedgePnL.toLocaleString()}</>})<br />
                      ÷ ({(lotSuggestion.maxDrawdownDecimal * 100).toFixed(0)}% × ${lotSuggestion.accountSize.toLocaleString()})
                      = {lotSuggestion.suggested}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Input type="number" step="0.01" className="text-xs" value={form.lotMultiplier} onChange={e => onUpdate({ lotMultiplier: e.target.value })} />
          {lotSuggestion && lotSuggestion.suggested > 0 && (
            <p className="text-[10px] text-muted-foreground">Auto-sized to recover ${lotSuggestion.costToRecover.toLocaleString()} in costs</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Trade Copy Settings */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
          <Label className="font-semibold text-xs">Trade Copy Settings</Label>
        </div>
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg border border-purple-500/30 bg-purple-500/10">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-3.5 w-3.5 text-purple-500" />
            <div>
              <Label className="text-xs font-medium">Reverse Mode (Always On)</Label>
              <p className="text-[10px] text-muted-foreground">All trades reversed for hedging. Cannot be disabled.</p>
            </div>
          </div>
          <Switch checked={true} disabled className="data-[state=checked]:bg-purple-500 opacity-100" />
        </div>
      </div>

      <Separator />

      {/* Symbol Configuration */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-primary" />
          <Label className="font-semibold text-xs">Symbol Configuration</Label>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Add Symbol Suffix</Label>
          <Input className="text-xs" value={form.symbolSuffix} onChange={e => onUpdate({ symbolSuffix: e.target.value })} placeholder="e.g. _x or .raw" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Symbol Aliases</Label>
          <Textarea
            className="text-xs min-h-[50px] font-mono"
            value={form.symbolAliases}
            onChange={e => onUpdate({ symbolAliases: e.target.value })}
            placeholder="DJ30.cash=US30|0.1;SpotCrude=WTI"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Symbol Black/Whitelist</Label>
          <Input
            className="text-xs font-mono"
            value={form.symbolBlacklist}
            onChange={e => onUpdate({ symbolBlacklist: e.target.value })}
            placeholder="+BTCUSD;+ETHUSD or -DJ30;-USDJPY"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Magic Number Filter</Label>
          <Input
            className="text-xs font-mono"
            value={form.magicNumberFilter}
            onChange={e => onUpdate({ magicNumberFilter: e.target.value })}
            placeholder="+111111;+222222;-333333"
          />
        </div>
      </div>
    </div>
  );
}

export default AccountDetailsModal;

