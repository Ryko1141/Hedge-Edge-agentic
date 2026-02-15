import { TradingAccount } from '@/hooks/useTradingAccounts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  AlertTriangle, 
  Clock,
  Target,
  Shield,
  Flame,
  ExternalLink,
  WifiOff
} from 'lucide-react';

import type { ConnectionStatus as CopierConnectionStatus } from '@/contexts/CopierGroupsContext';
import type { ConnectionSnapshot } from '@/types/connections';

interface HedgeNodeProps {
  account: TradingAccount;
  isSelected?: boolean;
  isDragging?: boolean;
  isLinkSource?: boolean;
  /** Copier connection status for status-based node coloring */
  copierStatus?: CopierConnectionStatus;
  /** Connection snapshot for real EA connection status */
  connectionSnapshot?: ConnectionSnapshot | null;
  onClick?: () => void;
  onDetailsClick?: () => void;
  onDoubleClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  position?: { x: number; y: number };
}

type ConnectionStatus = 'connected' | 'lagging' | 'risk' | 'disconnected';

export const HedgeNode = ({ account, isSelected, isDragging, isLinkSource, copierStatus = 'none', connectionSnapshot, onClick, onDetailsClick, onDoubleClick, onMouseDown, position }: HedgeNodeProps) => {
  const profitTarget = Number(account.profit_target) || 0;
  const maxLoss = Number(account.max_loss) || 0;
  const maxDailyLoss = Number(account.max_daily_loss) || 0;
  const accountSize = Number(account.account_size) || 0;
  const currentBalance = Number(account.current_balance) || accountSize;
  
  // Calculate P&L from balance - this is more accurate than stored pnl
  const storedPnl = Number(account.pnl) || 0;
  const storedPnlPercent = Number(account.pnl_percent) || 0;
  
  // Use calculated P&L from balance if balance differs from account size
  // This catches cases where the stored pnl hasn't been synced
  const calculatedPnl = currentBalance - accountSize;
  const calculatedPnlPercent = accountSize > 0 ? (calculatedPnl / accountSize) * 100 : 0;
  
  // Use calculated values if they differ from stored (meaning balance was updated)
  const pnl = currentBalance !== accountSize ? calculatedPnl : storedPnl;
  const pnlPercent = currentBalance !== accountSize ? calculatedPnlPercent : storedPnlPercent;
  const isProfit = pnl >= 0;
  
  // Calculate distances using the actual P&L percent
  const equity = currentBalance;
  const distanceToFail = maxLoss > 0 
    ? Math.max(((equity - (accountSize * (1 - maxLoss / 100))) / accountSize) * 100, 0)
    : null;
  const distanceToPass = profitTarget > 0 
    ? Math.max(profitTarget - pnlPercent, 0)
    : null;

  // Determine connection status based on real connection snapshot first, then account health
  const getConnectionStatus = (): ConnectionStatus => {
    // For hedge accounts, check real EA connection status first
    if (account.phase === 'live' && connectionSnapshot !== undefined) {
      const realStatus = connectionSnapshot?.session.status;
      if (!realStatus || realStatus === 'disconnected' || realStatus === 'idle') {
        return 'disconnected';
      }
    }
    if (distanceToFail !== null && distanceToFail < 2) return 'risk';
    if (account.last_sync_at) {
      const lastSync = new Date(account.last_sync_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
      if (diffMinutes > 5) return 'lagging';
    }
    return 'connected';
  };

  const connectionStatus = getConnectionStatus();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '—';
    return `${value.toFixed(1)}%`;
  };

  const typeConfig = {
    evaluation: {
      badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      border: 'border-yellow-500/40',
      glow: 'shadow-[0_0_20px_rgba(234,179,8,0.15)]',
      hoverGlow: 'hover:shadow-[0_0_25px_rgba(234,179,8,0.25)]',
      label: 'EVALUATION',
      icon: TrendingUp,
    },
    funded: {
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      border: 'border-emerald-500/40',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      hoverGlow: 'hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]',
      label: 'FUNDED',
      icon: TrendingUp,
    },
    live: {
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      border: 'border-blue-500/40',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.15)]',
      hoverGlow: 'hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]',
      label: 'HEDGE',
      icon: TrendingUp,
    },
  };

  const statusConfig = {
    connected: {
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      icon: Zap,
      label: 'Connected',
      pulse: true,
    },
    lagging: {
      badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      icon: Clock,
      label: 'Lagging',
      pulse: false,
    },
    risk: {
      badge: 'bg-red-500/20 text-red-400 border-red-500/40',
      icon: AlertTriangle,
      label: 'Risk',
      pulse: true,
    },
    disconnected: {
      badge: 'bg-muted/30 text-muted-foreground border-muted-foreground/30',
      icon: WifiOff,
      label: 'Disconnected',
      pulse: false,
    },
  };

  const config = typeConfig[account.phase];
  const StatusIcon = statusConfig[connectionStatus].icon;
  const TypeIcon = config.icon;
  const isNodeDisconnected = connectionStatus === 'disconnected';

  // Copier status border override
  const copierBorderClass = copierStatus === 'active' ? 'border-green-500/60'
    : copierStatus === 'paused' ? 'border-yellow-500/60'
    : copierStatus === 'error' ? 'border-red-500/60'
    : '';

  // Copier status glow
  const copierGlow = copierStatus === 'active' ? 'shadow-[0_0_20px_rgba(34,197,94,0.25)]'
    : copierStatus === 'paused' ? 'shadow-[0_0_20px_rgba(234,179,8,0.25)]'
    : copierStatus === 'error' ? 'shadow-[0_0_20px_rgba(239,68,68,0.35)]'
    : '';

  // Render simplified version for hedge accounts
  if (account.phase === 'live') {
    return (
      <div
        onClick={onClick}
        onMouseDown={onMouseDown}
        style={position ? { 
          position: 'absolute', 
          left: position.x, 
          top: position.y,
          transform: 'translate(-50%, -50%)',
          willChange: 'transform',
        } : undefined}
        className={cn(
          'w-72 rounded-xl border-2 bg-card cursor-pointer select-none overflow-hidden',
          copierBorderClass || (isNodeDisconnected ? 'border-muted-foreground/30' : config.border),
          !isNodeDisconnected && copierGlow,
          isNodeDisconnected && 'opacity-50',
          isSelected && 'ring-2 ring-offset-2 ring-offset-background ring-primary',
          isLinkSource && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
        )}
      >
        <div className="px-4 py-3">
          {/* Header Row */}
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              config.badge
            )}>
              <TypeIcon className="w-4 h-4" />
            </div>
            <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', config.badge)}>
              {config.label}
            </Badge>
          </div>

          {/* Platform Info */}
          <p className="text-sm text-muted-foreground mb-3 truncate">
            {account.platform || 'MT5'} - {account.login || '—'}
          </p>

          {/* Connection Details */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0">👤</div>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] text-muted-foreground">Login</p>
                <p className="text-xs font-medium text-foreground truncate">{account.login || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0">🖥️</div>
              <div className="min-w-0 overflow-hidden">
                <p className="text-[10px] text-muted-foreground">Server</p>
                <p className="text-xs font-medium text-foreground truncate">{account.server || '—'}</p>
              </div>
            </div>
          </div>

          {/* Footer Status */}
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            <Badge variant="outline" className={cn(
              'text-[10px] px-2 py-0.5 flex items-center gap-1',
              statusConfig[connectionStatus].badge,
              statusConfig[connectionStatus].pulse && 'animate-pulse'
            )}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig[connectionStatus].label}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-primary/20 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onDetailsClick?.();
              }}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Details
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Regular node for evaluation and funded accounts
  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      style={position ? { 
        position: 'absolute', 
        left: position.x, 
        top: position.y,
        transform: 'translate(-50%, -50%)',
        willChange: 'transform',
      } : undefined}
      className={cn(
        'w-72 rounded-xl border-2 bg-card cursor-pointer select-none overflow-hidden',
        copierBorderClass || config.border,
        copierGlow,
        isSelected && 'ring-2 ring-offset-2 ring-offset-background ring-primary',
        isLinkSource && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        connectionStatus === 'risk' && !copierBorderClass && 'border-red-500/60'
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            config.badge
          )}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground truncate">
                {account.account_name}
              </span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', config.badge)}>
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {account.prop_firm || account.platform || 'Personal'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn(
          'text-[10px] px-1.5 py-0.5 flex items-center gap-1 shrink-0',
          statusConfig[connectionStatus].badge,
          statusConfig[connectionStatus].pulse && 'animate-pulse'
        )}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig[connectionStatus].label}
        </Badge>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Account Size & Equity Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(accountSize)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Equity</p>
            <p className="text-sm font-semibold text-foreground">{formatCurrency(equity)}</p>
          </div>
        </div>

        {/* Rule Context */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-1.5 rounded-md bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground">Daily DD</p>
            <p className="text-xs font-medium text-foreground">{formatPercent(maxDailyLoss)}</p>
          </div>
          <div className="p-1.5 rounded-md bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground">Max DD</p>
            <p className="text-xs font-medium text-foreground">{formatPercent(maxLoss)}</p>
          </div>
          <div className="p-1.5 rounded-md bg-muted/30">
            <p className="text-[9px] uppercase text-muted-foreground">Target</p>
            <p className="text-xs font-medium text-foreground">{formatPercent(profitTarget)}</p>
          </div>
        </div>

        {/* Distance Indicators */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              distanceToFail !== null && distanceToFail < 3 
                ? 'bg-red-500/20 text-red-400' 
                : 'bg-muted/30 text-muted-foreground'
            )}>
              <Flame className="w-3 h-3" />
              <span>Fail: {distanceToFail !== null ? `${distanceToFail.toFixed(1)}%` : '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              distanceToPass !== null && distanceToPass < 2 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-muted/30 text-muted-foreground'
            )}>
              <Target className="w-3 h-3" />
              <span>Pass: {distanceToPass !== null ? `${distanceToPass.toFixed(1)}%` : '—'}</span>
            </div>
          </div>
        </div>

        {/* P&L Indicator */}
        <div className={cn(
          'flex items-center justify-center gap-1 py-1.5 rounded-md',
          isProfit ? 'bg-emerald-500/10' : 'bg-red-500/10'
        )}>
          {isProfit ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <span className={cn(
            'text-sm font-bold',
            isProfit ? 'text-emerald-400' : 'text-red-400'
          )}>
            {isProfit ? '+' : ''}{formatCurrency(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
          </span>
        </div>

        {/* View Details Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs hover:bg-primary/20 hover:text-primary hover:border-primary/50 mt-2"
          onClick={(e) => {
            e.stopPropagation();
            onDetailsClick?.();
          }}
        >
          <ExternalLink className="w-3 h-3 mr-1" />
          View Live Details
        </Button>
      </div>
    </div>
  );
};
