import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TradingAccount } from '@/hooks/useTradingAccounts';
import { cn } from '@/lib/utils';
import { 
  ChevronRight, 
  DollarSign, 
  Layers,
  Link,
  Archive,
  CheckCircle2,
  Info
} from 'lucide-react';

interface AccountProgressionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProgressionData) => void;
  accountPhase: 'evaluation' | 'funded';
  archivedAccounts: TradingAccount[];
  propFirm?: string;
}

export interface ProgressionData {
  evaluation_fee?: number;
  evaluation_phase?: number;
  previous_account_id?: string;
}

const PHASE_OPTIONS = [
  { value: 1, label: 'Phase 1', description: 'Initial evaluation phase' },
  { value: 2, label: 'Phase 2', description: 'Second evaluation phase' },
  { value: 3, label: 'Phase 3', description: 'Third evaluation phase' },
  { value: 4, label: 'Phase 4', description: 'Fourth evaluation phase' },
];

export const AccountProgressionModal = ({
  open,
  onOpenChange,
  onSubmit,
  accountPhase,
  archivedAccounts,
  propFirm,
}: AccountProgressionModalProps) => {
  const [evaluationFee, setEvaluationFee] = useState<number | undefined>();
  const [selectedPhase, setSelectedPhase] = useState<number | undefined>();
  const [previousAccountId, setPreviousAccountId] = useState<string | undefined>();

  // Filter archived accounts - only show evaluation accounts from the same prop firm
  const eligibleArchivedAccounts = archivedAccounts.filter(acc => 
    acc.is_archived && 
    acc.phase === 'evaluation' &&
    (!propFirm || acc.prop_firm === propFirm)
  );

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setEvaluationFee(undefined);
      setSelectedPhase(accountPhase === 'evaluation' ? 1 : undefined);
      setPreviousAccountId(undefined);
    }
  }, [open, accountPhase]);

  const handleSubmit = () => {
    onSubmit({
      evaluation_fee: evaluationFee,
      evaluation_phase: accountPhase === 'evaluation' ? selectedPhase : undefined,
      previous_account_id: previousAccountId,
    });
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSubmit({});
    onOpenChange(false);
  };

  // Get the linked account details
  const linkedAccount = previousAccountId 
    ? eligibleArchivedAccounts.find(a => a.id === previousAccountId) 
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] border-border/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-semibold">
            Account Progression
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {accountPhase === 'evaluation' 
              ? 'Track your evaluation progress and fees'
              : 'Link this funded account to your evaluation history'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Evaluation Fee */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Evaluation Fee (Optional)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                placeholder="0"
                value={evaluationFee || ''}
                onChange={(e) => setEvaluationFee(e.target.value ? Number(e.target.value) : undefined)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The fee you paid for this {accountPhase === 'evaluation' ? 'evaluation' : 'funded account'}
            </p>
          </div>

          {/* Phase Selection - Only for Evaluation accounts */}
          {accountPhase === 'evaluation' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Evaluation Phase
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {PHASE_OPTIONS.map((phase) => (
                  <button
                    key={phase.value}
                    type="button"
                    onClick={() => setSelectedPhase(phase.value)}
                    className={cn(
                      "p-3 rounded-lg border transition-all text-center",
                      "hover:bg-muted/30",
                      selectedPhase === phase.value
                        ? "border-primary bg-primary/10"
                        : "border-border/30"
                    )}
                  >
                    <span className="text-lg font-semibold">{phase.value}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Phase</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Link to Archived Account */}
          {eligibleArchivedAccounts.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="h-4 w-4 text-muted-foreground" />
                Link to Previous Account (Optional)
              </Label>
              <Select value={previousAccountId || ''} onValueChange={setPreviousAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an archived account..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No link</SelectItem>
                  {eligibleArchivedAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <Archive className="h-3 w-3 text-muted-foreground" />
                        <span>{account.account_name}</span>
                        {account.evaluation_phase && (
                          <span className="text-xs text-muted-foreground">
                            (Phase {account.evaluation_phase})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Info about linking */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Why link accounts?</p>
                  <p>
                    Linking helps track your progression through evaluation phases. 
                    For example, if you passed Phase 1 and are now adding Phase 2, 
                    link to your archived Phase 1 account.
                  </p>
                </div>
              </div>

              {/* Show linked account details */}
              {linkedAccount && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Linked Account</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account</span>
                      <span className="font-medium">{linkedAccount.account_name}</span>
                    </div>
                    {linkedAccount.evaluation_phase && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phase</span>
                        <span className="font-medium">Phase {linkedAccount.evaluation_phase}</span>
                      </div>
                    )}
                    {linkedAccount.pnl !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Final P&L</span>
                        <span className={cn(
                          "font-medium",
                          linkedAccount.pnl >= 0 ? "text-emerald-500" : "text-destructive"
                        )}>
                          {linkedAccount.pnl >= 0 ? '+' : ''}{linkedAccount.pnl_percent?.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleSubmit} className="gap-2">
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
