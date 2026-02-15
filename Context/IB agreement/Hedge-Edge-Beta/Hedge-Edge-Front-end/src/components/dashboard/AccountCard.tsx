import { TradingAccount } from '@/hooks/useTradingAccounts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MoreHorizontal, TrendingUp, TrendingDown, RefreshCw, Trash2, Server, User, Zap, ExternalLink, Wifi, WifiOff, Loader2, Power, PowerOff, Key, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ConnectionSnapshot, ConnectionStatus, LicenseStatus } from '@/types/connections';
import { getStatusBadgeClass, formatConnectionStatus } from '@/lib/desktop';
import { Archive, ArchiveRestore } from 'lucide-react';
import { PROP_FIRMS, PLATFORMS } from './AddAccountModal';

interface AccountCardProps {
  account: TradingAccount;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onSync?: (id: string) => void;
  onClick?: (account: TradingAccount) => void;
  /** Connection snapshot for this account (from useConnectionsFeed) */
  connectionSnapshot?: ConnectionSnapshot | null;
  /** Callback to connect the account */
  onConnect?: (account: TradingAccount) => void;
  /** Callback to disconnect the account */
  onDisconnect?: (account: TradingAccount) => void;
  /** Whether a connection operation is in progress */
  isConnecting?: boolean;
}

export const AccountCard = ({ 
  account, 
  onDelete,
  onArchive,
  onRestore,
  onSync, 
  onClick,
  connectionSnapshot,
  onConnect,
  onDisconnect,
  isConnecting = false,
}: AccountCardProps) => {
  const accountSize = Number(account.account_size) || 0;
  
  // Live metrics from connection (if connected)
  const liveBalance = connectionSnapshot?.metrics?.balance;
  const liveEquity = connectionSnapshot?.metrics?.equity;
  const liveProfit = connectionSnapshot?.metrics?.profit;
  const positionCount = connectionSnapshot?.metrics?.positionCount ?? 0;

  // Use live balance for P&L calculation when available, otherwise fall back to stored values
  const effectiveBalance = liveBalance ?? (Number(account.current_balance) || accountSize);
  const pnl = liveBalance != null ? (effectiveBalance - accountSize) : (Number(account.pnl) || 0);
  const pnlPercent = liveBalance != null
    ? (accountSize > 0 ? (pnl / accountSize) * 100 : 0)
    : (Number(account.pnl_percent) || 0);
  const isProfit = pnl >= 0;
  
  const profitTarget = Number(account.profit_target) || 0;
  const maxLoss = Number(account.max_loss) || 0;
  
  const isHedgeAccount = account.phase === 'live';
  const isArchived = account.is_archived;
  
  // Calculate progress towards profit target
  const progressPercent = profitTarget > 0 ? Math.min((pnlPercent / profitTarget) * 100, 100) : 0;
  
  // Calculate remaining drawdown
  const drawdownUsed = pnl < 0 ? Math.abs(pnlPercent) : 0;
  const drawdownRemaining = maxLoss > 0 ? Math.max(maxLoss - drawdownUsed, 0) : maxLoss;

  // Connection state
  const connectionStatus: ConnectionStatus = connectionSnapshot?.session.status || 'disconnected';
  const isConnected = connectionStatus === 'connected';
  const isConnectionActive = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const hasConnectionError = connectionStatus === 'error';
  
  // License state from connection snapshot
  const licenseStatus: LicenseStatus = connectionSnapshot?.license?.status || connectionSnapshot?.session.licenseStatus || 'not-configured';
  const isLicenseValid = licenseStatus === 'valid';
  const isLicenseExpired = licenseStatus === 'expired';
  const hasLicenseError = licenseStatus === 'error' || licenseStatus === 'invalid';
  const licenseErrorMsg = connectionSnapshot?.license?.errorMessage || connectionSnapshot?.session.licenseError;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const phaseConfig = {
    evaluation: {
      badge: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
      border: 'hover:border-yellow-500/50 hover:shadow-yellow-500/10',
      glow: 'group-hover:shadow-yellow-500/20',
      label: 'Evaluation',
    },
    funded: {
      badge: 'bg-primary/20 text-primary border-primary/30',
      border: 'hover:border-primary/50 hover:shadow-primary/10',
      glow: 'group-hover:shadow-primary/20',
      label: 'Funded',
    },
    live: {
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      border: 'hover:border-blue-500/50 hover:shadow-blue-500/10',
      glow: 'group-hover:shadow-blue-500/20',
      label: 'Hedge',
    },
  };

  const config = phaseConfig[account.phase];

  const handleCardClick = () => {
    if (onClick) {
      onClick(account);
    }
  };

  // Archived accounts are greyed out and disconnected
  if (isArchived) {
    return (
      <Card 
        className={cn(
          "border-border/20 bg-gradient-to-br from-muted/30 to-muted/10 backdrop-blur-sm transition-all duration-300 group opacity-60",
          onClick && "cursor-pointer hover:opacity-80"
        )}
        onClick={handleCardClick}
      >
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {(() => {
                const firm = PROP_FIRMS.find(f => f.name === account.prop_firm);
                return firm ? (
                  <img src={firm.logo} alt="" className="w-4 h-4 rounded-sm opacity-60" />
                ) : null;
              })()}
              <h3 className="font-medium text-muted-foreground">{account.account_name}</h3>
              <Badge variant="outline" className="text-xs bg-muted/30 text-muted-foreground border-muted-foreground/20">
                Archived
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground/70">
              {account.prop_firm || 'Personal'} • Phase {account.evaluation_phase || 1}
              {account.evaluation_fee ? ` • $${account.evaluation_fee} fee` : ''}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-xl border-border/30">
              {onRestore && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRestore(account.id); }} className="text-primary">
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Restore Account
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(account.id); }} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground/60">
            <span>{formatCurrency(accountSize)} account</span>
            <span className="flex items-center gap-1">
              <Archive className="h-3 w-3" />
              Disconnected
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine if account should show disconnected state (visual dimming)
  // Applies to ALL account types — hedge, funded, and evaluation
  const isDisconnected = !isConnected && !isConnectionActive;
  
  // Whether we have any connection data at all (for showing status badges on ALL types)
  const hasConnectionData = connectionSnapshot != null;

  return (
    <Card 
      className={cn(
        "border-border/30 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm transition-all duration-300 group hover:shadow-lg",
        config.border,
        config.glow,
        onClick && "cursor-pointer",
        isDisconnected && "opacity-60 border-border/20 hover:opacity-80"
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {(() => {
              // For hedge accounts, show platform logo; for prop accounts, show prop firm logo
              if (isHedgeAccount) {
                const platform = PLATFORMS.find(p => p.id === account.platform);
                return platform ? (
                  <img src={platform.logo} alt="" className="w-4 h-4 rounded-sm" />
                ) : null;
              } else {
                const firm = PROP_FIRMS.find(f => f.name === account.prop_firm);
                return firm ? (
                  <img src={firm.logo} alt="" className="w-4 h-4 rounded-sm" />
                ) : null;
              }
            })()}
            <h3 className={cn("font-semibold group-hover:text-primary transition-colors", isDisconnected ? "text-muted-foreground" : "text-foreground")}>{account.account_name}</h3>
            <Badge variant="outline" className={cn('text-xs transition-all group-hover:scale-105', config.badge)}>
              {config.label}
            </Badge>
            {isDisconnected && (
              <Badge variant="outline" className="text-[10px] bg-muted/30 text-muted-foreground border-muted-foreground/30 flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </Badge>
            )}
            {isConnectionActive && (
              <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30 flex items-center gap-1 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                {connectionStatus === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
              </Badge>
            )}
            {isConnected && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                Connected
              </Badge>
            )}
            {hasConnectionError && (
              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Error
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isHedgeAccount 
              ? `${account.platform} - ${account.server}`
              : `${account.prop_firm || 'Personal'} - ${account.platform}`
            }
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="animate-scale-in">
            {onSync && (
              <DropdownMenuItem onClick={() => onSync(account.id)} className="cursor-pointer">
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Account
              </DropdownMenuItem>
            )}
            {/* Connection controls */}
            {isHedgeAccount && onConnect && !isConnected && !isConnectionActive && (
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onConnect(account); }} 
                className="cursor-pointer"
              >
                <Power className="mr-2 h-4 w-4" />
                Connect
              </DropdownMenuItem>
            )}
            {isHedgeAccount && onDisconnect && isConnected && (
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDisconnect(account); }} 
                className="cursor-pointer"
              >
                <PowerOff className="mr-2 h-4 w-4" />
                Disconnect
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* For archived accounts - show restore option */}
            {isArchived && onRestore && (
              <DropdownMenuItem 
                onClick={() => onRestore(account.id)}
                className="cursor-pointer"
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Restore Account
              </DropdownMenuItem>
            )}
            {/* For non-hedge accounts (evaluation/funded) - show archive instead of delete */}
            {!isHedgeAccount && !isArchived && onArchive && (
              <DropdownMenuItem 
                onClick={() => onArchive(account.id)}
                className="text-yellow-600 focus:text-yellow-600 cursor-pointer"
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive Account
              </DropdownMenuItem>
            )}
            {/* For hedge accounts or archived accounts - show delete option */}
            {(isHedgeAccount || isArchived) && (
              <DropdownMenuItem 
                onClick={() => onDelete(account.id)}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-4">
        {isHedgeAccount ? (
          /* Hedge Account Display */
          <>
            {/* License Status Banner (show only when there's an issue or not valid) */}
            {isConnected && licenseStatus !== 'not-configured' && !isLicenseValid && (
              <div className={cn(
                "flex items-center justify-between p-2 rounded-lg mb-3 transition-colors",
                isLicenseExpired ? "bg-yellow-500/10" :
                hasLicenseError ? "bg-destructive/10" : "bg-muted/30"
              )}>
                <div className="flex items-center gap-2">
                  {isLicenseExpired ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  ) : hasLicenseError ? (
                    <Key className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    isLicenseExpired ? "text-yellow-500" :
                    hasLicenseError ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {isLicenseExpired ? 'License Expired' :
                     hasLicenseError ? 'License Invalid' :
                     licenseStatus === 'checking' ? 'Checking License...' : 'No License'}
                  </span>
                </div>
                {connectionSnapshot?.license?.daysRemaining != null && connectionSnapshot.license.daysRemaining <= 7 && (
                  <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                    {connectionSnapshot.license.daysRemaining}d left
                  </Badge>
                )}
              </div>
            )}

            {/* License Valid Indicator (subtle when valid) */}
            {isConnected && isLicenseValid && connectionSnapshot?.license?.daysRemaining != null && connectionSnapshot.license.daysRemaining <= 30 && (
              <div className="flex items-center justify-between p-2 rounded-lg mb-3 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Licensed</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                  {connectionSnapshot.license.daysRemaining}d remaining
                </Badge>
              </div>
            )}

            {/* Live Metrics (if connected) */}
            {isConnected && liveBalance != null && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted/20">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(liveBalance)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/20">
                  <p className="text-xs text-muted-foreground">Equity</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(liveEquity ?? liveBalance)}
                  </p>
                </div>
              </div>
            )}

            {/* Live P&L (if connected and has floating) */}
            {isConnected && liveProfit != null && liveProfit !== 0 && (
              <div className={cn(
                "p-2 rounded-lg mb-3",
                liveProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Floating P&L</span>
                  <span className={cn(
                    "text-sm font-semibold",
                    liveProfit >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    {liveProfit >= 0 ? '+' : ''}{formatCurrency(liveProfit)}
                  </span>
                </div>
              </div>
            )}

            {/* Account Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 transition-colors hover:bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Login</p>
                  <p className="text-sm font-medium text-foreground">{account.login || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 transition-colors hover:bg-muted/50">
                <Server className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Server</p>
                  <p className="text-sm font-medium text-foreground">{account.server || '—'}</p>
                </div>
              </div>
            </div>

            {/* Quick Connect Button (if not connected) */}
            {!isConnected && !isConnectionActive && onConnect && (
              <div className="pt-3 border-t border-border/30 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => { e.stopPropagation(); onConnect(account); }}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  ) : (
                    <Power className="w-3.5 h-3.5 mr-2" />
                  )}
                  Connect Account
                </Button>
              </div>
            )}

            {/* Connection Error */}
            {hasConnectionError && connectionSnapshot?.session.error && (
              <div className="pt-2 text-xs text-destructive">
                {connectionSnapshot.session.error}
              </div>
            )}
          </>
        ) : (
          /* Evaluation/Funded Account Display */
          <>
            {/* Live connection indicator for funded/eval accounts */}
            {liveBalance != null && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-[10px] text-primary font-medium">Live</span>
              </div>
            )}

            {/* Balance & P&L */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-2 rounded-lg bg-muted/20 transition-all hover:bg-muted/30">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(effectiveBalance)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted/20 transition-all hover:bg-muted/30">
                <p className="text-xs text-muted-foreground">P&L</p>
                <div className="flex items-center gap-1">
                  {isProfit ? (
                    <TrendingUp className="h-4 w-4 text-primary animate-pulse" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  <span className={cn('text-lg font-semibold transition-colors', isProfit ? 'text-primary' : 'text-destructive')}>
                    {formatCurrency(pnl)} ({pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Trading Days */}
            {account.min_trading_days && account.min_trading_days > 0 && (
              <div className="flex justify-between text-sm p-2 rounded-lg bg-muted/20">
                <span className="text-muted-foreground">Trading Days</span>
                <span className="text-foreground font-medium">
                  {account.trading_days_completed || 0} / {account.min_trading_days}
                </span>
              </div>
            )}

            {/* Account Size */}
            <div className="pt-2 border-t border-border/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Account Size</span>
                <span className="text-foreground font-semibold">{formatCurrency(accountSize)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};