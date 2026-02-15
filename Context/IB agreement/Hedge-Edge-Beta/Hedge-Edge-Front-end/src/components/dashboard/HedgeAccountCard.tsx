import { TradingAccount } from '@/hooks/useTradingAccounts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Zap, 
  Server,
  User,
  Settings2
} from 'lucide-react';

interface HedgeAccountCardProps {
  account: TradingAccount;
  linkedCount: number;
  onManageLinks: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
}

export const HedgeAccountCard = ({ 
  account, 
  linkedCount, 
  onManageLinks,
  onSelect,
  isSelected 
}: HedgeAccountCardProps) => {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative p-4 rounded-xl border-2 bg-card/80 backdrop-blur-sm transition-all duration-300 cursor-pointer',
        'border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.2)]',
        'hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:border-blue-500/60',
        isSelected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{account.account_name}</h3>
            <p className="text-xs text-muted-foreground">{account.platform || 'MT5'} - {account.server || 'Unknown'}</p>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 border-blue-500/40"
        >
          Hedge
        </Badge>
      </div>

      {/* Connection Details */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          <div>
            <p className="text-[10px] text-muted-foreground">Login</p>
            <p className="text-xs font-medium text-foreground">{account.login || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
          <Server className="w-3.5 h-3.5 text-muted-foreground" />
          <div>
            <p className="text-[10px] text-muted-foreground">Server</p>
            <p className="text-xs font-medium text-foreground truncate max-w-[80px]">{account.server || '—'}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <span className="text-xs text-blue-400 font-medium">
          {linkedCount} linked
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onManageLinks();
          }}
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Manage
        </Button>
      </div>
    </div>
  );
};
