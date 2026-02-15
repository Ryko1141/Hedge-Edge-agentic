import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Pause,
  MoreVertical,
  Settings,
  Trash2,
  Copy,
  Zap,
  TrendingUp,
  TrendingDown,
  CircleDot,
  AlertTriangle,
  Clock,
  ArrowRight,
  Users,
  ChevronDown,
  ChevronUp,
  Repeat2,
} from 'lucide-react';
import type { CopierGroup, FollowerConfig } from '@/types/copier';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CircleDot; label: string }> = {
  active: { color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/30', icon: CircleDot, label: 'Active' },
  paused: { color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: Pause, label: 'Paused' },
  error:  { color: 'text-red-500',    bg: 'bg-red-500/10 border-red-500/30',    icon: AlertTriangle, label: 'Error' },
  pending:{ color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/30',  icon: Clock, label: 'Pending' },
};

const phaseConfig: Record<string, { badge: string; label: string }> = {
  evaluation: { badge: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', label: 'EVAL' },
  funded:     { badge: 'bg-primary/20 text-primary border-primary/30',          label: 'FUNDED' },
  live:       { badge: 'bg-blue-500/20 text-blue-500 border-blue-500/30',       label: 'HEDGE' },
};

const volumeLabel: Record<string, string> = {
  'lot-multiplier':   'Lot Multiplier',
};

// ─── Follower Row ───────────────────────────────────────────────────────────

function FollowerRow({
  follower,
  onToggle,
}: {
  follower: FollowerConfig;
  onToggle: (id: string) => void;
}) {
  const sc = statusConfig[follower.status] || statusConfig.pending;
  const StatusIcon = sc.icon;
  const pc = phaseConfig[follower.phase] || phaseConfig.live;
  const profit = follower.stats.totalProfit;

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
      {/* Left: account info */}
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon className={`h-3 w-3 shrink-0 ${sc.color}`} />
        <span className="text-sm font-medium text-foreground truncate max-w-[160px]" title={follower.accountName}>
          {follower.accountName}
        </span>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${pc.badge}`}>
          {pc.label}
        </Badge>
        {follower.reverseMode && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-purple-500/10 text-purple-500 border-purple-500/30">
            <Repeat2 className="h-3 w-3 mr-0.5" />
            Reverse
          </Badge>
        )}
      </div>

      {/* Middle: stats */}
      <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
        <span>{volumeLabel[follower.volumeSizing] || follower.volumeSizing}</span>
        <span className="flex items-center gap-1">
          <Copy className="h-3 w-3" />
          {follower.stats.tradesToday} today
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {follower.stats.failedCopies} missed
        </span>
        <span className={`flex items-center gap-1 ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {fmt(profit)}
        </span>
      </div>


    </div>
  );
}

// ─── Copier Group Card ──────────────────────────────────────────────────────

interface CopierGroupCardProps {
  group: CopierGroup;
  onToggleGroup: (groupId: string) => void;
  onToggleFollower: (groupId: string, followerId: string) => void;
  onEdit: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}

export function CopierGroupCard({
  group,
  onToggleGroup,
  onToggleFollower,
  onEdit,
  onDelete,
}: CopierGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sc = statusConfig[group.status] || statusConfig.active;
  const StatusIcon = sc.icon;
  const lpc = phaseConfig[group.leaderPhase] || phaseConfig.evaluation;
  const profit = group.stats.totalProfit;
  const isProfit = profit >= 0;

  return (
    <Card className="border-border/40 bg-gradient-to-br from-card/80 to-card/40 hover:border-primary/20 transition-all overflow-hidden">
      <CardContent className="p-0">
        {/* ── Header Row ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 p-4">
          {/* Left: status + group name */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${sc.bg}`}>
              <StatusIcon className={`h-4 w-4 ${sc.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate">{group.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className={`text-[10px] ${lpc.badge}`}>
                  {lpc.label}
                </Badge>
                <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={group.leaderAccountName}>
                  {group.leaderAccountName}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {group.stats.activeFollowers}/{group.stats.totalFollowers}
                </span>
              </div>
            </div>
          </div>

          {/* Middle: stats */}
          <div className="hidden lg:flex items-center gap-5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="text-sm font-semibold text-foreground">{group.stats.tradesToday}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Trades copied today</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Missed</p>
                    <p className={`text-sm font-semibold ${group.totalFailedCopies === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                      {group.totalFailedCopies}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Failed hedge copies</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">P&L</p>
                    <p className={`text-sm font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                      {isProfit ? '+' : ''}{fmt(profit)}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total profit/loss from copied trades</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onToggleGroup(group.id)}
                  >
                    {group.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{group.status === 'active' ? 'Pause group' : 'Resume group'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(group.id)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(group.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Expand toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* ── Mobile stat row ───────────────────────────────────────── */}
        <div className="flex lg:hidden items-center gap-4 px-4 pb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Copy className="h-3 w-3" /> {group.stats.tradesToday} trades
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" /> {group.stats.avgLatency}ms
          </span>
          <span className={`flex items-center gap-1 ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {fmt(profit)}
          </span>

        </div>

        {/* ── Expanded Follower List ────────────────────────────────── */}
        {expanded && (
          <div className="border-t border-border/30 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Follower Accounts ({group.followers.length})
            </p>
            {group.followers.map(f => (
              <FollowerRow
                key={f.id}
                follower={f}
                onToggle={(fid) => onToggleFollower(group.id, fid)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
