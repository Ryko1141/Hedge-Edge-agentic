import { useState, useEffect } from 'react';
import { useTradingAccounts, TradingAccount } from '@/hooks/useTradingAccounts';
import { DraggableHedgeMap, HedgeRelationship } from '@/components/dashboard/DraggableHedgeMap';
import { AddAccountModal } from '@/components/dashboard/AddAccountModal';
import { AccountDetailsModal } from '@/components/dashboard/AccountDetailsModal';
import { ConfigureCopierGroupModal } from '@/components/dashboard/ConfigureCopierGroupModal';
import { useCopierGroupsContext } from '@/contexts/CopierGroupsContext';
import type { CopierGroup } from '@/types/copier';
import { useConnectionsFeed } from '@/hooks/useConnectionsFeed';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// Local storage key for relationships
const RELATIONSHIPS_KEY = 'hedge_edge_relationships';
// Local storage key for accounts displayed in hedge map
const HEDGE_MAP_ACCOUNTS_KEY = 'hedge_edge_map_accounts';

const getStoredRelationships = (): HedgeRelationship[] => {
  try {
    const stored = localStorage.getItem(RELATIONSHIPS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRelationships = (relationships: HedgeRelationship[]) => {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(relationships));
};

const getStoredHedgeMapAccounts = (): string[] => {
  try {
    const stored = localStorage.getItem(HEDGE_MAP_ACCOUNTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveHedgeMapAccounts = (accountIds: string[]) => {
  localStorage.setItem(HEDGE_MAP_ACCOUNTS_KEY, JSON.stringify(accountIds));
};

const Accounts = () => {
  const { createAccount, deleteAccount, syncAccountFromMT5 } = useTradingAccounts();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectAccountModalOpen, setSelectAccountModalOpen] = useState(false);
  const [selectedAccountToAdd, setSelectedAccountToAdd] = useState<string>('');
  const [relationships, setRelationships] = useState<HedgeRelationship[]>(getStoredRelationships);
  const [selectedAccount, setSelectedAccount] = useState<TradingAccount | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [hedgeMapAccountIds, setHedgeMapAccountIds] = useState<string[]>(getStoredHedgeMapAccounts);
  const { toast } = useToast();
  const { getSnapshot } = useConnectionsFeed({ autoStart: true });

  // Copier groups integration for sync + status colors + ConfigureCopierGroupModal
  const {
    groups: copierGroups,
    initialized: copierInitialized,
    addGroup,
    updateGroup,
    getConnectionStatus,
    createGroupFromRelationship,
    syncRelationshipsFromGroups,
    deleteGroupForPair,
    updateGroupFromRelationship,
    accounts,
    accountsLoading: loading,
  } = useCopierGroupsContext();

  // State for the Configure Copier Group Modal (opens after linking accounts)
  const [configuringGroup, setConfiguringGroup] = useState<CopierGroup | null>(null);

  // Clean up invalid hedge map account IDs only after accounts have loaded
  useEffect(() => {
    if (!loading && accounts.length > 0) {
      const validIds = hedgeMapAccountIds.filter(id => accounts.some(acc => acc.id === id));
      if (validIds.length !== hedgeMapAccountIds.length) {
        setHedgeMapAccountIds(validIds);
        saveHedgeMapAccounts(validIds);
      }
    }
  }, [accounts, loading]); // Only run when accounts change or loading finishes

  // Sync: ensure accounts from copier groups appear on the hedge map
  // Gate on copierInitialized to avoid running with stale empty groups
  useEffect(() => {
    if (loading || !copierInitialized || accounts.length === 0) return;
    let changed = false;
    const currentIds = new Set(hedgeMapAccountIds);
    for (const group of copierGroups) {
      // Add leader to map if not already there
      if (!currentIds.has(group.leaderAccountId) && accounts.some(a => a.id === group.leaderAccountId)) {
        currentIds.add(group.leaderAccountId);
        changed = true;
      }
      // Add followers to map if not already there
      for (const follower of group.followers) {
        if (!currentIds.has(follower.accountId) && accounts.some(a => a.id === follower.accountId)) {
          currentIds.add(follower.accountId);
          changed = true;
        }
      }
    }
    if (changed) {
      const updated = Array.from(currentIds);
      setHedgeMapAccountIds(updated);
      saveHedgeMapAccounts(updated);
    }
  }, [copierGroups, accounts, loading, copierInitialized]);

  // Sync: ensure copier group relationships appear in hedge map relationships
  // Gate on copierInitialized to prevent orphan cleanup with empty groups
  useEffect(() => {
    if (loading || !copierInitialized) return;
    syncRelationshipsFromGroups();
    // Re-read relationships after sync so the line renders
    const stored = getStoredRelationships();
    setRelationships(stored);
  }, [copierGroups, loading, copierInitialized]);

  // Listen for relationship changes dispatched by context (e.g. when Trade Copier deletes a group)
  useEffect(() => {
    const handleRelationshipsChanged = () => {
      const stored = getStoredRelationships();
      setRelationships(stored);
    };
    window.addEventListener('hedge-relationships-changed', handleRelationshipsChanged);
    return () => window.removeEventListener('hedge-relationships-changed', handleRelationshipsChanged);
  }, []);

  const handleAccountClick = (account: TradingAccount) => {
    setSelectedAccount(account);
    setDetailsModalOpen(true);
  };

  const handleCreateRelationship = (sourceId: string, targetId: string, logic: HedgeRelationship['logic'] = 'mirror', offsetPercentage: number = 100) => {
    // Check if relationship already exists
    const exists = relationships.some(
      r => (r.sourceId === sourceId && r.targetId === targetId) ||
           (r.sourceId === targetId && r.targetId === sourceId)
    );

    if (exists) {
      toast({
        title: 'Relationship exists ⚠️',
        description: 'These accounts are already linked.',
        variant: 'destructive',
      });
      return;
    }

    // Funded/Evaluation accounts can only connect to ONE hedge account at a time
    const sourceAccount = accounts.find(a => a.id === sourceId);
    const targetAccount = accounts.find(a => a.id === targetId);
    const propAccount = sourceAccount?.phase === 'live' ? targetAccount : sourceAccount;
    if (propAccount && (propAccount.phase === 'evaluation' || propAccount.phase === 'funded')) {
      // Check both local relationships AND copier groups for existing links
      const alreadyLinkedByRelationship = relationships.some(
        r => r.sourceId === propAccount.id || r.targetId === propAccount.id
      );
      const alreadyLinkedByCopierGroup = copierGroups.some(
        g => g.leaderAccountId === propAccount.id ||
             g.followers.some(f => f.accountId === propAccount.id)
      );
      if (alreadyLinkedByRelationship || alreadyLinkedByCopierGroup) {
        toast({
          title: 'Already connected ⛔',
          description: `${propAccount.account_name} is already linked to a hedge account. Remove the existing connection first.`,
          variant: 'destructive',
        });
        return;
      }
    }

    const newRelationship: HedgeRelationship = {
      id: crypto.randomUUID(),
      sourceId,
      targetId,
      offsetPercentage,
      logic,
      isActive: true,
    };

    const updated = [...relationships, newRelationship];
    setRelationships(updated);
    saveRelationships(updated);

    // Auto-create a copier group for this new relationship and open Configure modal
    const newGroup = createGroupFromRelationship(sourceId, targetId, accounts);
    if (newGroup) {
      addGroup(newGroup);
      // Open Configure Copier Group modal so user can customize settings
      setConfiguringGroup(newGroup);
      toast({
        title: 'Copier group created 🔗',
        description: 'Configure the copier settings for this connection.',
      });
    }
  };

  const handleUpdateRelationship = (id: string, updates: Partial<HedgeRelationship>) => {
    const rel = relationships.find(r => r.id === id);
    const updated = relationships.map(r => 
      r.id === id ? { ...r, ...updates } : r
    );
    setRelationships(updated);
    saveRelationships(updated);

    // Propagate changes to the matching copier group
    if (rel) {
      updateGroupFromRelationship(rel.sourceId, rel.targetId, {
        logic: updates.logic ?? rel.logic,
        offsetPercentage: updates.offsetPercentage ?? rel.offsetPercentage,
        isActive: updates.isActive ?? rel.isActive,
      });
    }
  };

  const handleDeleteRelationship = (id: string) => {
    // Find the relationship before removing so we can clean up the copier group
    const rel = relationships.find(r => r.id === id);
    const updated = relationships.filter(r => r.id !== id);
    setRelationships(updated);
    saveRelationships(updated);

    // Delete the matching copier group
    if (rel) {
      deleteGroupForPair(rel.sourceId, rel.targetId);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    // Also remove any relationships and their copier groups involving this account
    const relsToDelete = relationships.filter(r => r.sourceId === id || r.targetId === id);
    for (const rel of relsToDelete) {
      deleteGroupForPair(rel.sourceId, rel.targetId);
    }
    const updatedRelationships = relationships.filter(r => r.sourceId !== id && r.targetId !== id);
    setRelationships(updatedRelationships);
    saveRelationships(updatedRelationships);
    
    // Remove from hedge map accounts list
    const updatedHedgeMapAccounts = hedgeMapAccountIds.filter(accountId => accountId !== id);
    setHedgeMapAccountIds(updatedHedgeMapAccounts);
    saveHedgeMapAccounts(updatedHedgeMapAccounts);
    
    await deleteAccount(id);
  };

  // Filter accounts to only show those added to the hedge map
  // hedgeMapAccountIds are already cleaned up via useEffect above
  const hedgeMapAccounts = accounts.filter(acc => hedgeMapAccountIds.includes(acc.id));
  
  // Available accounts to add (not already in the hedge map)
  const availableAccounts = accounts.filter(acc => !hedgeMapAccountIds.includes(acc.id));

  const handleAddAccountToMap = () => {
    if (selectedAccountToAdd) {
      const updated = [...hedgeMapAccountIds, selectedAccountToAdd];
      setHedgeMapAccountIds(updated);
      saveHedgeMapAccounts(updated);
      setSelectedAccountToAdd('');
      setSelectAccountModalOpen(false);
      toast({
        title: 'Account added ✓',
        description: 'Account has been added to the hedge map.',
      });
    }
  };

  const handleOpenAddAccount = () => {
    // Always show selection dialog to add existing accounts or create new
    // Only open create modal directly if there are NO accounts at all
    if (accounts.length === 0) {
      setAddModalOpen(true);
    } else {
      setSelectAccountModalOpen(true);
    }
  };

  // Handle save from Configure Copier Group modal
  const handleConfigureSave = (updated: CopierGroup) => {
    updateGroup(updated);
    setConfiguringGroup(null);
    toast({
      title: 'Copier group configured ✅',
      description: 'The copier group settings have been saved.',
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <DraggableHedgeMap
        accounts={hedgeMapAccounts}
        relationships={relationships}
        onAddAccount={handleOpenAddAccount}
        onDeleteAccount={handleDeleteAccount}
        onCreateRelationship={handleCreateRelationship}
        onDeleteRelationship={handleDeleteRelationship}
        onUpdateRelationship={handleUpdateRelationship}
        onAccountClick={handleAccountClick}
        getConnectionStatus={getConnectionStatus}
        getAccountSnapshot={getSnapshot}
      />

      {/* Select existing account dialog */}
      <Dialog open={selectAccountModalOpen} onOpenChange={setSelectAccountModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Account to Hedge Map</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {availableAccounts.length > 0 ? (
              <div className="space-y-2">
                <Label>Select an existing account to add</Label>
                <Select value={selectedAccountToAdd} onValueChange={setSelectedAccountToAdd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} ({account.phase === 'live' ? 'Hedge' : account.phase === 'funded' ? 'Funded' : 'Evaluation'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  All your accounts are already on the map.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {availableAccounts.length > 0 ? 'Or ' : ''}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setSelectAccountModalOpen(false);
                  setAddModalOpen(true);
                }}
              >
                Create a new account
              </button>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectAccountModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAccountToMap} disabled={!selectedAccountToAdd}>
              Add to Map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        allAccounts={accounts}
        copierGroup={(() => {
          if (!selectedAccount) return null;
          return copierGroups.find(
            g => g.leaderAccountId === selectedAccount.id ||
                 g.followers.some(f => f.accountId === selectedAccount.id)
          ) || null;
        })()}
        onSaveCopierGroup={(updated) => {
          updateGroup(updated);
          toast({
            title: 'Configuration saved ✅',
            description: 'The copier group settings have been updated.',
          });
        }}
        connectedAccount={(() => {
          if (!selectedAccount) return null;
          const rel = relationships.find(
            r => r.sourceId === selectedAccount.id || r.targetId === selectedAccount.id
          );
          if (!rel) return null;
          const connectedId = rel.sourceId === selectedAccount.id ? rel.targetId : rel.sourceId;
          return accounts.find(a => a.id === connectedId) || null;
        })()}
        connectedAccountSnapshot={(() => {
          if (!selectedAccount) return null;
          const rel = relationships.find(
            r => r.sourceId === selectedAccount.id || r.targetId === selectedAccount.id
          );
          if (!rel) return null;
          const connectedId = rel.sourceId === selectedAccount.id ? rel.targetId : rel.sourceId;
          return getSnapshot(connectedId) || null;
        })()}
      />

      {/* Configure Copier Group Modal - opens after linking accounts on hedge map */}
      <ConfigureCopierGroupModal
        open={configuringGroup !== null}
        onOpenChange={(open) => { if (!open) setConfiguringGroup(null); }}
        group={configuringGroup}
        onSave={handleConfigureSave}
        accounts={accounts}
      />
    </div>
  );
};

export default Accounts;
