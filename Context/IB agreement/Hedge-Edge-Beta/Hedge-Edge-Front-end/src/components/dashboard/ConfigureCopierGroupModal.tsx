import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Crown,
  Users,
  ArrowRightLeft,
  Settings,
  Repeat2,
  Info,
  CircleDot,
  Pause,
  AlertTriangle,
  Clock,
  Zap,
  Save,
  BarChart3,
  Timer,
  Hash,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import type { CopierGroup, FollowerConfig, VolumeSizingMode } from '@/types/copier';
import type { TradingAccount } from '@/hooks/useTradingAccounts';
import { getSuggestedLotMultiplier } from '@/lib/lot-multiplier';

// ─── Config constants ───────────────────────────────────────────────────────

const volumeOptions: { value: VolumeSizingMode; label: string; hint: string }[] = [
  { value: 'lot-multiplier',      label: 'Lot Multiplier',      hint: 'Multiply leader lot size by a factor' },
];

const statusConfig: Record<string, { color: string; icon: typeof CircleDot; label: string }> = {
  active:  { color: 'text-green-500',  icon: CircleDot,      label: 'Active' },
  paused:  { color: 'text-yellow-500', icon: Pause,          label: 'Paused' },
  error:   { color: 'text-red-500',    icon: AlertTriangle,  label: 'Error' },
  pending: { color: 'text-blue-500',   icon: Clock,          label: 'Pending' },
};

const phaseConfig: Record<string, { className: string; label: string }> = {
  evaluation: { className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', label: 'EVAL' },
  funded:     { className: 'bg-primary/20 text-primary border-primary/30',          label: 'FUNDED' },
  live:       { className: 'bg-blue-500/20 text-blue-500 border-blue-500/30',       label: 'HEDGE' },
};

// ─── Per-follower editable state ────────────────────────────────────────────

interface FollowerFormState {
  volumeSizing: VolumeSizingMode;
  lotMultiplier: string;
  reverseMode: boolean;
  symbolSuffix: string;
  symbolAliases: string;       // "DJ30.cash=US30|0.1;SpotCrude=WTI|10"
  symbolBlacklist: string;     // "-DJ30;-USDJPY" or "+BTCUSD;+ETHUSD"
  magicNumberFilter: string;   // "+111111;+222222;-333333"
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
  // Parse symbol aliases string → SymbolMapping[]
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

  // Parse blacklist/whitelist
  const symbolWhitelist: string[] = [];
  const symbolBlacklist: string[] = [];
  form.symbolBlacklist
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(entry => {
      if (entry.startsWith('+')) symbolWhitelist.push(entry.slice(1));
      else if (entry.startsWith('-')) symbolBlacklist.push(entry.slice(1));
      else symbolBlacklist.push(entry); // default to blacklist
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
        if (!isNaN(num)) magicNumberBlacklist.push(num); // default to blacklist
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

// ─── Props ──────────────────────────────────────────────────────────────────

interface ConfigureCopierGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CopierGroup | null;
  onSave: (updated: CopierGroup) => void;
  /** All trading accounts — used to compute suggested lot multiplier */
  accounts?: TradingAccount[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ConfigureCopierGroupModal({
  open,
  onOpenChange,
  group,
  onSave,
  accounts,
}: ConfigureCopierGroupModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [groupName, setGroupName] = useState('');
  const [leaderSuffixRemove, setLeaderSuffixRemove] = useState('');
  const [followerForms, setFollowerForms] = useState<Record<string, FollowerFormState>>({});
  const [expandedFollower, setExpandedFollower] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // ── Scroll tracking ────────────────────────────────────────────

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setShowScrollDown(false); return; }
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 40;
    setShowScrollDown(hasMore);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    // Recheck on resize or content changes
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    checkScroll();
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, activeTab, expandedFollower]);

  const scrollDown = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: 300, behavior: 'smooth' });
  }, []);

  // ── Initialise state from group ────────────────────────────────

  useEffect(() => {
    if (!group) return;
    setGroupName(group.name);
    setLeaderSuffixRemove(group.leaderSymbolSuffixRemove || '');
    const forms: Record<string, FollowerFormState> = {};
    group.followers.forEach(f => {
      forms[f.id] = followerToForm(f);
    });
    setFollowerForms(forms);
    setExpandedFollower(group.followers[0]?.id || '');
    setActiveTab('general');
  }, [group]);

  // ── Follower form updater ──────────────────────────────────────

  const updateFollower = useCallback(
    (followerId: string, patch: Partial<FollowerFormState>) => {
      setFollowerForms(prev => ({
        ...prev,
        [followerId]: { ...prev[followerId], ...patch },
      }));
    },
    [],
  );

  // ── Save ───────────────────────────────────────────────────────

  const handleSave = () => {
    if (!group) return;

    const updatedFollowers = group.followers.map(f => {
      const form = followerForms[f.id];
      if (!form) return f;
      return { ...f, ...formToFollowerPatch(form) };
    });

    const updated: CopierGroup = {
      ...group,
      name: groupName.trim() || group.name,
      leaderSymbolSuffixRemove: leaderSuffixRemove,
      followers: updatedFollowers,
      updatedAt: new Date().toISOString(),
    };

    onSave(updated);
    onOpenChange(false);
  };

  if (!group) return null;

  // Compute suggested lot multiplier from leader account's costs
  const leaderAccount = accounts?.find(a => a.id === group.leaderAccountId);
  const lotSuggestion = leaderAccount && accounts
    ? getSuggestedLotMultiplier(leaderAccount, accounts)
    : null;

  // ── Render ─────────────────────────────────────────────────────

  const lpc = phaseConfig[group.leaderPhase] || phaseConfig.evaluation;
  const sc = statusConfig[group.status] || statusConfig.active;
  const StatusIcon = sc.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configure Copier Group
          </DialogTitle>
          <DialogDescription>
            Edit group settings and per-follower configuration. Changes are applied to all followers individually.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50">
            <TabsTrigger value="general" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Settings className="h-3.5 w-3.5 mr-1" />
              General
            </TabsTrigger>
            <TabsTrigger value="followers" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Users className="h-3.5 w-3.5 mr-1" />
              Followers ({group.followers.length})
            </TabsTrigger>
            <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <BarChart3 className="h-3.5 w-3.5 mr-1" />
              Overview
            </TabsTrigger>
          </TabsList>

          <div className="relative flex-1 min-h-0 mt-4">
            <div
              ref={scrollRef}
              onScroll={checkScroll}
              className="overflow-y-auto pr-2"
              style={{ maxHeight: 'calc(90vh - 240px)' }}
            >
            {/* ─── TAB: General ─────────────────────────────────── */}
            <TabsContent value="general" className="mt-0 space-y-5">
              {/* Group Name */}
              <div className="space-y-2">
                <Label className="font-semibold">Group Name</Label>
                <Input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. FTMO 100k → IC Markets Hedge"
                />
              </div>

              <Separator />

              {/* Leader Info (read-only) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <Label className="font-semibold">Leader Account (Master)</Label>
                </div>
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`h-4 w-4 ${sc.color}`} />
                    <span className="font-medium text-foreground">{group.leaderAccountName}</span>
                    <Badge variant="outline" className={`text-[10px] ${lpc.className}`}>
                      {lpc.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">({group.leaderPlatform})</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Leader Symbol Suffix Remove */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Remove Symbol Suffix (Leader)</Label>
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
                />
                <p className="text-xs text-muted-foreground">
                  Strips this suffix from all leader symbols before processing on followers.
                </p>
              </div>

              {/* Group Status summary */}
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-center">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className={`text-sm font-semibold ${sc.color}`}>{sc.label}</p>
                </div>
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-center">
                  <p className="text-xs text-muted-foreground">Followers</p>
                  <p className="text-sm font-semibold">{group.stats.activeFollowers}/{group.stats.totalFollowers}</p>
                </div>
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-center">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-semibold">{new Date(group.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </TabsContent>

            {/* ─── TAB: Followers (per-follower config) ───────── */}
            <TabsContent value="followers" className="mt-0 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">
                Each follower has its own independent configuration, matching the{' '}
                <span className="text-primary font-medium">Heron Copier slave account</span> settings model.
              </p>

              <Accordion
                type="single"
                collapsible
                value={expandedFollower}
                onValueChange={setExpandedFollower}
              >
                {group.followers.map(follower => {
                  const form = followerForms[follower.id];
                  if (!form) return null;
                  const fsc = statusConfig[follower.status] || statusConfig.pending;
                  const FStatusIcon = fsc.icon;
                  const fpc = phaseConfig[follower.phase] || phaseConfig.live;

                  return (
                    <AccordionItem key={follower.id} value={follower.id} className="border border-border/40 rounded-lg mb-3 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/20">
                        <div className="flex items-center gap-2 text-left">
                          <FStatusIcon className={`h-3.5 w-3.5 ${fsc.color}`} />
                          <span className="font-medium text-sm">{follower.accountName}</span>
                          <Badge variant="outline" className={`text-[10px] ${fpc.className}`}>
                            {fpc.label}
                          </Badge>
                          {form.reverseMode && (
                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-500 border-purple-500/30">
                              <Repeat2 className="h-3 w-3 mr-0.5" />
                              Reverse
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-1">
                        <FollowerConfigPanel
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
            </TabsContent>

            {/* ─── TAB: Overview ──────────────────────────────── */}
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-border/40 bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-1">Total Trades Today</p>
                  <p className="text-2xl font-bold">{group.stats.tradesToday}</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-1">Total Trades All Time</p>
                  <p className="text-2xl font-bold">{group.stats.tradesTotal}</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-1">Missed Hedges</p>
                  <p className={`text-2xl font-bold ${(group.totalFailedCopies ?? 0) === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                    {group.totalFailedCopies ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
                  <p className={`text-2xl font-bold ${group.stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {group.stats.totalProfit >= 0 ? '+' : ''}${Math.abs(group.stats.totalProfit).toFixed(2)}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Per-follower stats table */}
              <div className="space-y-2">
                <Label className="font-semibold">Per-Follower Statistics</Label>
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <div className="grid grid-cols-6 gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border/30">
                    <span className="col-span-2">Account</span>
                    <span className="text-right">Trades</span>
                    <span className="text-right">Missed</span>
                    <span className="text-right">Success</span>
                    <span className="text-right">P&L</span>
                  </div>
                  {group.followers.map(f => (
                    <div key={f.id} className="grid grid-cols-6 gap-2 px-3 py-2.5 text-xs border-b border-border/20 last:border-0 hover:bg-muted/10">
                      <span className="col-span-2 font-medium truncate">{f.accountName}</span>
                      <span className="text-right text-muted-foreground">{f.stats.tradesTotal}</span>
                    <span className={`text-right ${f.stats.failedCopies === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                      {f.stats.failedCopies}
                      </span>
                      <span className="text-right text-muted-foreground">{Math.round(f.stats.successRate)}%</span>
                      <span className={`text-right font-medium ${f.stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {f.stats.totalProfit >= 0 ? '+' : ''}${Math.abs(f.stats.totalProfit).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            </div>

            {/* Scroll-down indicator with fade */}
            {showScrollDown && (
              <>
                <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-12 bg-gradient-to-t from-background to-transparent z-[5]" />
                <button
                  onClick={scrollDown}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-background/90 backdrop-blur-sm text-primary shadow-lg shadow-primary/10 hover:bg-primary/10 hover:border-primary/60 transition-all duration-200 text-[11px] font-medium"
                >
                  <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
                  Scroll for more
                </button>
              </>
            )}
          </div>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t border-border/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Follower Config Panel ──────────────────────────────────────────────────
// Full per-follower settings matching Heron Copier's slave configuration.

function FollowerConfigPanel({
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
    <div className="space-y-5">
      {/* ── Section 1: Volume Sizing ──────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <Label className="font-semibold text-sm">Volume Sizing</Label>
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
          <p className="text-[10px] text-muted-foreground">
            {lotSuggestion && lotSuggestion.suggested > 0
              ? `Auto-sized to recover $${lotSuggestion.costToRecover.toLocaleString()} in costs`
              : '1.0 = same size, 0.5 = half, 2.0 = double leader lot size'}
          </p>
        </div>
      </div>

      <Separator />

      {/* ── Section 2: Trade Copy Settings ────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <Label className="font-semibold text-sm">Trade Copy Settings</Label>
        </div>

        {/* Reverse Mode — Always ON (hedging only) */}
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-purple-500" />
            <div>
              <Label className="text-xs font-medium">Reverse Mode (Always On)</Label>
              <p className="text-[10px] text-muted-foreground">All trades are automatically reversed for hedging. This cannot be disabled.</p>
            </div>
          </div>
          <Switch checked={true} disabled className="data-[state=checked]:bg-purple-500 opacity-100" />
        </div>
      </div>

      <Separator />

      {/* ── Section 3: Symbol Configuration ───────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <Label className="font-semibold text-sm">Symbol Configuration</Label>
        </div>

        {/* Symbol Suffix */}
        <div className="space-y-1">
          <Label className="text-xs">Add Symbol Suffix</Label>
          <Input className="text-xs" value={form.symbolSuffix} onChange={e => onUpdate({ symbolSuffix: e.target.value })} placeholder="e.g. _x or .raw" />
          <p className="text-[10px] text-muted-foreground">
            Appended to all symbols: EURUSD → EURUSD{form.symbolSuffix || '_x'}
          </p>
        </div>

        {/* Symbol Aliases */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Symbol Aliases</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-xs">
                    Map symbols between brokers with optional lot multiplier overrides.<br />
                    <strong>Format:</strong> MasterSymbol=SlaveSymbol|LotMultiplier<br />
                    <strong>Example:</strong> DJ30.cash=US30|0.1;SpotCrude=WTI|10;BTCUSDT=BTCUSD
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            className="text-xs min-h-[60px] font-mono"
            value={form.symbolAliases}
            onChange={e => onUpdate({ symbolAliases: e.target.value })}
            placeholder="DJ30.cash=US30|0.1;SpotCrude=WTI|10;BTCUSDT=BTCUSD"
          />
          <p className="text-[10px] text-muted-foreground">
            Aliases take priority over the symbol suffix. Separate entries with semicolons.
          </p>
        </div>

        {/* Symbol Black/Whitelist */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Symbol Black/Whitelist</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-xs">
                    <strong>+SYMBOL</strong> = whitelist (only these are copied)<br />
                    <strong>-SYMBOL</strong> = blacklist (these are skipped)<br />
                    <strong>Example:</strong> +BTCUSD;+ETHUSD or -DJ30;-USDJPY
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            className="text-xs font-mono"
            value={form.symbolBlacklist}
            onChange={e => onUpdate({ symbolBlacklist: e.target.value })}
            placeholder="+BTCUSD;+ETHUSD or -DJ30;-USDJPY"
          />
          <p className="text-[10px] text-muted-foreground">
            Prefix with + for whitelist, - for blacklist. Separate with semicolons.
          </p>
        </div>

        {/* Magic Number Filter */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Magic Number Filter</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-xs">
                    Filter which trades to copy by their magic number.<br />
                    <strong>+NUMBER</strong> = only copy these magic numbers<br />
                    <strong>-NUMBER</strong> = skip these magic numbers<br />
                    Leave blank to copy all trades.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            className="text-xs font-mono"
            value={form.magicNumberFilter}
            onChange={e => onUpdate({ magicNumberFilter: e.target.value })}
            placeholder="+111111;+222222;-333333"
          />
        </div>

        {/* Processing order info box */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Symbol Processing Order</p>
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">1. Magic Number Filter</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline" className="text-[10px]">2. Blacklist</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline" className="text-[10px]">3. Whitelist</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline" className="text-[10px]">4. Aliases</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline" className="text-[10px]">5. Suffix</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline" className="text-[10px]">6. Auto-map</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
