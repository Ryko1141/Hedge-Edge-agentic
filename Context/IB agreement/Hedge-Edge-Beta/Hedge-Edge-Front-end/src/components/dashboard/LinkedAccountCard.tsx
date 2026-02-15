import { TradingAccount } from '@/hooks/useTradingAccounts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Target,
  Shield,
  Link2,
  LinkIcon,
  Zap
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LinkedAccountCardProps {
  account: TradingAccount;
  hedgeAccounts: TradingAccount[];
  linkedHedgeId: string | null;
  onLinkChange: (hedgeId: string | null) => void;
}

export const LinkedAccountCard = ({ 
  account, 
  hedgeAccounts,
  linkedHedgeId,
  onLinkChange 
}: LinkedAccountCardProps) => {
  const pnl = Number(account.pnl) || 0;
  const pnlPercent = Number(account.pnl_percent) || 0;
  const isProfit = pnl >= 0;
  
  const profitTarget = Number(account.profit_target) || 0;
  const maxLoss = Number(account.max_loss) || 0;
  const maxDailyLoss = Number(account.max_daily_loss) || 0;
  const accountSize = Number(account.account_size) || 0;
  
  // Calculate progress towards profit target
  const progressPercent = profitTarget > 0 ? Math.min((pnlPercent / profitTarget) * 100, 100) : 0;
  
  // Calculate remaining drawdown
  const drawdownUsed = pnl < 0 ? Math.abs(pnlPercent) : 0;
  const drawdownRemaining = maxLoss > 0 ? Math.max(maxLoss - drawdownUsed, 0) : maxLoss;

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
      badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      glow: 'shadow-[0_0_20px_rgba(234,179,8,0.2)]',
      hoverGlow: 'hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]',
      border: 'border-yellow-500/40 hover:border-yellow-500/60',
      label: 'Evaluation',
      icon: Target,
    },
    funded: {
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
      hoverGlow: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]',
      border: 'border-emerald-500/40 hover:border-emerald-500/60',
      label: 'Funded',
      icon: Shield,
    },
    live: {
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.2)]',
      hoverGlow: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]',
      border: 'border-blue-500/40 hover:border-blue-500/60',
      label: 'Hedge',
      icon: Link2,
    },
  };

  const config = phaseConfig[account.phase];
  const PhaseIcon = config.icon;
  const linkedHedge = hedgeAccounts.find(h => h.id === linkedHedgeId);

  return (
    <div className={cn(
      'relative p-4 rounded-xl border-2 bg-card/80 backdrop-blur-sm transition-all duration-300',
      config.border,
      config.glow,
      config.hoverGlow
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center border',
            config.badge
          )}>
            <PhaseIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{account.account_name}</h3>
            <p className="text-xs text-muted-foreground">{account.prop_firm || 'Personal'}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', config.badge)}>
          {config.label}
        </Badge>
      </div>

      {/* Size & P&L */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-2 rounded-md bg-muted/30">
          <p className="text-[10px] text-muted-foreground uppercase">Size</p>
          <p className="text-sm font-semibold text-foreground">{formatCurrency(accountSize)}</p>
        </div>
        <div className="p-2 rounded-md bg-muted/30">
          <p className="text-[10px] text-muted-foreground uppercase">P&L</p>
          <div className="flex items-center gap-1">
            {isProfit ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            )}
            <span className={cn(
              'text-sm font-semibold',
              isProfit ? 'text-emerald-400' : 'text-red-400'
            )}>
              {formatCurrency(pnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Rule Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-muted/20 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Daily DD</p>
          <p className="text-xs font-medium text-foreground">{maxDailyLoss || '—'}%</p>
        </div>
        <div className="p-1.5 rounded-md bg-muted/20 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Max DD</p>
          <p className="text-xs font-medium text-foreground">{maxLoss || '—'}%</p>
        </div>
        <div className="p-1.5 rounded-md bg-muted/20 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Target</p>
          <p className="text-xs font-medium text-foreground">{profitTarget || '—'}%</p>
        </div>
      </div>

      {/* Progress Bars */}
      {(profitTarget > 0 || maxLoss > 0) && (
        <div className="space-y-2 mb-3">
          {profitTarget > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-foreground">{pnlPercent.toFixed(1)}% / {profitTarget}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-muted/50" />
            </div>
          )}
          {maxLoss > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">DD Remaining</span>
                <span className="text-foreground">{drawdownRemaining.toFixed(1)}%</span>
              </div>
              <Progress 
                value={(drawdownRemaining / maxLoss) * 100} 
                className="h-1.5 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-orange-500" 
              />
            </div>
          )}
        </div>
      )}

      {/* Linked To Section */}
      <div className="pt-3 border-t border-border/30">
        <div className="flex items-center gap-2">
          <LinkIcon className={cn(
            'w-3.5 h-3.5',
            linkedHedgeId ? 'text-blue-400' : 'text-muted-foreground'
          )} />
          <span className="text-xs text-muted-foreground">Linked to:</span>
          <Select
            value={linkedHedgeId || 'none'}
            onValueChange={(value) => onLinkChange(value === 'none' ? null : value)}
            disabled={hedgeAccounts.length === 0}
          >
            <SelectTrigger className="h-7 text-xs flex-1 bg-muted/30 border-border/50">
              <SelectValue placeholder="Select hedge..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">
                <span className="text-muted-foreground">Not linked</span>
              </SelectItem>
              {hedgeAccounts.map((hedge) => (
                <SelectItem key={hedge.id} value={hedge.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-blue-400" />
                    {hedge.account_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
