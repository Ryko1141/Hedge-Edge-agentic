import { useState, useMemo, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Crown,
  Users,
  Shield,
  ArrowRightLeft,
  Plus,
  Repeat2,
  Info,
  Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TradingAccount } from '@/hooks/useTradingAccounts';
import type { CopierGroup, VolumeSizingMode } from '@/types/copier';
import { createCopierGroup, createDefaultFollower } from '@/lib/copier-groups';
import { getSuggestedLotMultiplier } from '@/lib/lot-multiplier';

// ─── Phase badge config ─────────────────────────────────────────────────────

const phaseBadge: Record<string, { className: string; label: string }> = {
  evaluation: { className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', label: 'Eval' },
  funded:     { className: 'bg-primary/20 text-primary border-primary/30',          label: 'Funded' },
  live:       { className: 'bg-blue-500/20 text-blue-500 border-blue-500/30',       label: 'Hedge' },
};

// ─── Volume sizing options ──────────────────────────────────────────────────

const volumeOptions: { value: VolumeSizingMode; label: string; description: string }[] = [
  { value: 'lot-multiplier',     label: 'Lot Multiplier',         description: 'Multiply leader lot size by a factor' },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface CreateCopierGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: TradingAccount[];
  onCreated: (group: CopierGroup) => void;
  editGroup?: CopierGroup | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CreateCopierGroupModal({
  open,
  onOpenChange,
  accounts,
  onCreated,
  editGroup,
}: CreateCopierGroupModalProps) {
  const activeAccounts = useMemo(
    () => accounts.filter(a => !a.is_archived),
    [accounts],
  );

  // ── State ──────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState('accounts');
  const [groupName, setGroupName] = useState(editGroup?.name || '');
  const [leaderId, setLeaderId] = useState(editGroup?.leaderAccountId || '');
  const [selectedFollowerIds, setSelectedFollowerIds] = useState<string[]>(
    editGroup?.followers.map(f => f.accountId) || [],
  );

  // Risk settings (applied to all new followers as defaults)
  const [volumeSizing] = useState<VolumeSizingMode>('lot-multiplier');

  // ── Reset form state when dialog opens (ensures fresh state each time) ──

  useEffect(() => {
    if (open) {
      if (editGroup) {
        // Populate from the group being edited
        setGroupName(editGroup.name || '');
        setLeaderId(editGroup.leaderAccountId || '');
        setSelectedFollowerIds(editGroup.followers.map(f => f.accountId) || []);
      } else {
        // Fresh create — reset everything
        setGroupName('');
        setLeaderId('');
        setSelectedFollowerIds([]);
        setLotMultiplier('1.0');
        setSymbolSuffix('');
        setSymbolBlacklist('');
        setActiveTab('accounts');
      }
    }
  }, [open, editGroup]);
  const [lotMultiplier, setLotMultiplier] = useState('1.0');
  const [reverseMode] = useState(true); // Always true — hedge copier always reverses

  // Symbol mapping
  const [symbolSuffix, setSymbolSuffix] = useState('');
  const [symbolBlacklist, setSymbolBlacklist] = useState('');

  // ── Derived ────────────────────────────────────────────────────

  const leader = activeAccounts.find(a => a.id === leaderId);
  const availableFollowers = activeAccounts.filter(a => a.id !== leaderId);

  // Auto-calculate suggested lot multiplier from leader account's costs
  const lotSuggestion = useMemo(() => {
    if (!leader) return null;
    const result = getSuggestedLotMultiplier(leader, accounts);
    return result.suggested > 0 ? result : null;
  }, [leader, accounts]);

  // Auto-set lot multiplier when leader changes and a suggestion is available
  useEffect(() => {
    if (lotSuggestion && lotSuggestion.suggested > 0) {
      setLotMultiplier(String(lotSuggestion.suggested));
    }
  }, [lotSuggestion]);

  const toggleFollower = (id: string) => {
    setSelectedFollowerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const canCreate = groupName.trim() && leaderId && selectedFollowerIds.length > 0;

  // ── Submit ─────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!leader) return;
    const followerAccounts = selectedFollowerIds
      .map(id => activeAccounts.find(a => a.id === id)!)
      .filter(Boolean);

    const group = createCopierGroup(groupName.trim(), leader, followerAccounts);

    // Apply risk settings to each follower
    group.followers = group.followers.map(f => ({
      ...f,
      volumeSizing,
      lotMultiplier: parseFloat(lotMultiplier) || 1,
      reverseMode,
      symbolSuffix,
      symbolBlacklist: symbolBlacklist
        .split(';')
        .map(s => s.trim())
        .filter(Boolean),
    }));

    onCreated(group);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setGroupName('');
    setLeaderId('');
    setSelectedFollowerIds([]);
    setLotMultiplier('1.0');
    setSymbolSuffix('');
    setSymbolBlacklist('');
    setActiveTab('accounts');
  };

  // ── Render volume sizing fields ────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            {editGroup ? 'Edit Copier Group' : 'Create Copier Group'}
          </DialogTitle>
          <DialogDescription>
            Set up a leader account and one or more followers with per-group risk settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 shrink-0">
            <TabsTrigger value="accounts" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Users className="h-3.5 w-3.5 mr-1" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="risk" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Shield className="h-3.5 w-3.5 mr-1" />
              Risk
            </TabsTrigger>
            <TabsTrigger value="symbols" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
              Symbols
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-2">
            {/* ─── TAB 1: Accounts ─────────────────────────────── */}
            <TabsContent value="accounts" className="mt-0 space-y-5">
              {/* Group Name */}
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. FTMO 100k → IC Markets Hedge"
                />
              </div>

              <Separator />

              {/* Leader Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <Label className="font-semibold">Leader Account (Master)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>The leader account is the source of trades. All trades on this account will be copied to the follower accounts.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select value={leaderId} onValueChange={setLeaderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select leader account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(acc => {
                      const pb = phaseBadge[acc.phase] || phaseBadge.live;
                      return (
                        <SelectItem key={acc.id} value={acc.id}>
                          <div className="flex items-center gap-2">
                            <span>{acc.account_name}</span>
                            <Badge variant="outline" className={`text-[10px] ${pb.className}`}>
                              {pb.label}
                            </Badge>
                            {acc.prop_firm && (
                              <span className="text-xs text-muted-foreground">({acc.prop_firm})</span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Follower Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <Label className="font-semibold">Follower Accounts</Label>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedFollowerIds.length} selected
                  </Badge>
                </div>

                {availableFollowers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {leaderId
                      ? 'No other accounts available. Add more accounts first.'
                      : 'Select a leader account first.'}
                  </p>
                )}

                <div className="space-y-2">
                  {availableFollowers.map(acc => {
                    const pb = phaseBadge[acc.phase] || phaseBadge.live;
                    const checked = selectedFollowerIds.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/40 hover:border-border/80 bg-muted/20'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleFollower(acc.id)}
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">{acc.account_name}</span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${pb.className}`}>
                            {pb.label}
                          </Badge>
                          {acc.prop_firm && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {acc.prop_firm}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ${Number(acc.account_size).toLocaleString()}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ─── TAB 2: Risk Management ─────────────────────── */}
            <TabsContent value="risk" className="mt-0 space-y-5">
              {/* Volume Sizing — Lot Multiplier only */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Lot Multiplier</Label>
                  {lotSuggestion && lotSuggestion.suggested > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setLotMultiplier(String(lotSuggestion.suggested))}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors cursor-pointer"
                          >
                            <Zap className="h-3 w-3" />
                            Suggested: {lotSuggestion.suggested}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Auto-calculated from cost to recover:<br />
                            Challenge fee: ${lotSuggestion.evalFee.toLocaleString()}<br />
                            {lotSuggestion.archivedHedgePnL > 0 && (<>Archived hedge losses: ${lotSuggestion.archivedHedgePnL.toLocaleString()}<br /></>)}
                            Total: ${lotSuggestion.costToRecover.toLocaleString()}
                            {' / '}({(lotSuggestion.maxDrawdownDecimal * 100).toFixed(0)}% × ${lotSuggestion.accountSize.toLocaleString()})
                            {' = '}{lotSuggestion.suggested}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  value={lotMultiplier}
                  onChange={e => setLotMultiplier(e.target.value)}
                  placeholder="1.0"
                />
                <p className="text-xs text-muted-foreground">
                  {lotSuggestion && lotSuggestion.suggested > 0
                    ? `Auto-sized to recover $${lotSuggestion.costToRecover.toLocaleString()} in costs. Edit freely.`
                    : '1.0 = same size, 0.5 = half, 2.0 = double leader lot size'}
                </p>
              </div>

              <Separator />

              {/* Reverse Mode — Always On */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                <div className="flex items-center gap-2">
                  <Repeat2 className="h-4 w-4 text-green-500" />
                  <div>
                    <Label className="text-sm font-medium">Reverse Mode (Hedging)</Label>
                    <p className="text-xs text-muted-foreground">
                      Always enabled — hedge accounts copy in the opposite direction to directly offset
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  Always On
                </div>
              </div>
            </TabsContent>

            {/* ─── TAB 3: Symbol Mapping ──────────────────────── */}
            <TabsContent value="symbols" className="mt-0 space-y-5">
              <div className="space-y-2">
                <Label className="font-semibold">Symbol Suffix</Label>
                <Input
                  value={symbolSuffix}
                  onChange={e => setSymbolSuffix(e.target.value)}
                  placeholder="e.g. _x or .raw"
                />
                <p className="text-xs text-muted-foreground">
                  Appended to all symbol names on the follower side (e.g. EURUSD → EURUSD_x)
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="font-semibold">Symbol Blacklist</Label>
                <Input
                  value={symbolBlacklist}
                  onChange={e => setSymbolBlacklist(e.target.value)}
                  placeholder="e.g. DJ30;USDJPY;XAUUSD"
                />
                <p className="text-xs text-muted-foreground">
                  Semicolon-separated list of symbols to skip when copying
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-xs text-muted-foreground">
                  <strong>Symbol Aliases</strong> for cross-broker mapping (e.g. DJ30.cash=US30|0.1) 
                  can be configured per-follower after group creation.
                </p>
              </div>
            </TabsContent>

          </div>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t border-border/30 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canCreate} onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {editGroup ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
