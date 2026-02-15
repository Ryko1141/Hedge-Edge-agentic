/**
 * Shared hook for managing copier groups across Hedge Map and Trade Copier pages.
 * Uses localStorage as the shared persistence layer with cross-component sync.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CopierGroup, CopierGroupStatus } from '@/types/copier';
import type { TradingAccount } from '@/hooks/useTradingAccounts';
import {
  getStoredCopierGroups,
  saveCopierGroups,
  getGroupsSummary,
  computeGroupStats,
  createCopierGroup,
  createDefaultFollower,
} from '@/lib/copier-groups';

// ─── localStorage keys for hedge map relationships ──────────────────────────

const RELATIONSHIPS_KEY = 'hedge_edge_relationships';

interface HedgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  offsetPercentage: number;
  logic: 'mirror' | 'partial' | 'inverse';
  isActive: boolean;
}

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

// ─── Connection status type ─────────────────────────────────────────────────

export type ConnectionStatus = 'active' | 'paused' | 'error' | 'none';

// ─── Custom event for same-tab sync ─────────────────────────────────────────

const COPIER_GROUPS_CHANGED_EVENT = 'copier-groups-changed';

const dispatchGroupsChanged = () => {
  window.dispatchEvent(new CustomEvent(COPIER_GROUPS_CHANGED_EVENT));
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCopierGroups(accounts: TradingAccount[], loading: boolean) {
  const [groups, setGroups] = useState<CopierGroup[]>([]);
  const [initialized, setInitialized] = useState(false);

  // ── Load groups on mount / when accounts change ────────────────

  useEffect(() => {
    if (loading) return;
    const stored = getStoredCopierGroups();
    if (stored.length > 0) {
      // Migrate legacy groups: backfill leaderBaselinePnL from the
      // leader account's current P/L so hedge discrepancy is scoped
      // to the current copier group going forward.
      let migrated = false;
      const updated = stored.map(g => {
        if (g.leaderBaselinePnL !== undefined) return g;
        const leader = accounts.find(a => a.id === g.leaderAccountId);
        if (!leader) return g;
        const accountSize = Number(leader.account_size) || 0;
        const currentBalance = Number(leader.current_balance) || accountSize;
        migrated = true;
        return { ...g, leaderBaselinePnL: currentBalance - accountSize };
      });
      if (migrated) saveCopierGroups(updated);
      setGroups(updated);
    }
    setInitialized(true);
  }, [accounts, loading]);

  // ── Persist changes ────────────────────────────────────────────

  useEffect(() => {
    if (!initialized) return;
    if (groups.length > 0) {
      saveCopierGroups(groups);
      dispatchGroupsChanged();
    }
  }, [groups, initialized]);

  // ── Listen for same-tab sync events from other components ──────

  useEffect(() => {
    const handleGroupsChanged = () => {
      const stored = getStoredCopierGroups();
      if (stored.length > 0) {
        setGroups(prev => {
          // Only update if actually different (prevent loops)
          const prevJSON = JSON.stringify(prev.map(g => g.id).sort());
          const newJSON = JSON.stringify(stored.map(g => g.id).sort());
          if (prevJSON === newJSON) {
            // Same IDs - check statuses
            const prevStatuses = prev.map(g => `${g.id}:${g.status}`).sort().join(',');
            const newStatuses = stored.map(g => `${g.id}:${g.status}`).sort().join(',');
            if (prevStatuses === newStatuses) return prev;
          }
          return stored;
        });
      }
    };

    window.addEventListener(COPIER_GROUPS_CHANGED_EVENT, handleGroupsChanged);
    return () => window.removeEventListener(COPIER_GROUPS_CHANGED_EVENT, handleGroupsChanged);
  }, []);

  // ── Listen for cross-tab storage events ────────────────────────

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'hedge_edge_copier_groups' && e.newValue) {
        try {
          const stored = JSON.parse(e.newValue) as CopierGroup[];
          setGroups(stored);
        } catch { /* ignore parse errors */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // ── Reload from localStorage ───────────────────────────────────

  const reload = useCallback(() => {
    const stored = getStoredCopierGroups();
    setGroups(stored.length > 0 ? stored : []);
  }, []);

  // ── Summary ────────────────────────────────────────────────────

  const summary = useMemo(() => getGroupsSummary(groups), [groups]);

  // ── CRUD Handlers ──────────────────────────────────────────────

  const addGroup = useCallback((group: CopierGroup) => {
    setGroups(prev => [...prev, group]);
  }, []);

  const updateGroup = useCallback((updated: CopierGroup) => {
    setGroups(prev =>
      prev.map(g =>
        g.id === updated.id
          ? { ...g, ...updated, stats: computeGroupStats(updated.followers) }
          : g
      ),
    );
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      const groupToDelete = prev.find(g => g.id === groupId);
      if (groupToDelete) {
        // Remove matching hedge map relationships
        const currentRels = getStoredRelationships();
        const updatedRels = currentRels.filter(r => {
          return !groupToDelete.followers.some(
            f =>
              (r.sourceId === groupToDelete.leaderAccountId && r.targetId === f.accountId) ||
              (r.sourceId === f.accountId && r.targetId === groupToDelete.leaderAccountId),
          );
        });
        if (updatedRels.length !== currentRels.length) {
          saveRelationships(updatedRels);
          window.dispatchEvent(new CustomEvent('hedge-relationships-changed'));
        }
      }
      return prev.filter(g => g.id !== groupId);
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const newStatus = (g.status === 'active' ? 'paused' : 'active') as CopierGroupStatus;
        return { ...g, status: newStatus, updatedAt: new Date().toISOString() };
      });

      // Sync the isActive flag on matching hedge map relationships
      const toggledGroup = updated.find(g => g.id === groupId);
      if (toggledGroup) {
        const currentRels = getStoredRelationships();
        let relsChanged = false;
        const updatedRels = currentRels.map(r => {
          const matchesFollower = toggledGroup.followers.some(
            f =>
              (r.sourceId === toggledGroup.leaderAccountId && r.targetId === f.accountId) ||
              (r.sourceId === f.accountId && r.targetId === toggledGroup.leaderAccountId),
          );
          if (matchesFollower) {
            const isActive = toggledGroup.status === 'active' &&
              toggledGroup.followers.some(
                f => f.status === 'active' &&
                  (r.targetId === f.accountId || r.sourceId === f.accountId),
              );
            if (r.isActive !== isActive) {
              relsChanged = true;
              return { ...r, isActive };
            }
          }
          return r;
        });
        if (relsChanged) {
          saveRelationships(updatedRels);
          window.dispatchEvent(new CustomEvent('hedge-relationships-changed'));
        }
      }

      return updated;
    });
  }, []);

  const toggleFollower = useCallback((groupId: string, followerId: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.id !== groupId) return g;
        const followers = g.followers.map(f => {
          if (f.id !== followerId) return f;
          return { ...f, status: f.status === 'active' ? 'paused' as const : 'active' as const };
        });
        return {
          ...g,
          followers,
          stats: computeGroupStats(followers),
          updatedAt: new Date().toISOString(),
        };
      });

      // Sync the isActive flag on matching hedge map relationship
      const parentGroup = updated.find(g => g.id === groupId);
      if (parentGroup) {
        const toggledFollower = parentGroup.followers.find(f => f.id === followerId);
        if (toggledFollower) {
          const currentRels = getStoredRelationships();
          let relsChanged = false;
          const updatedRels = currentRels.map(r => {
            const matches =
              (r.sourceId === parentGroup.leaderAccountId && r.targetId === toggledFollower.accountId) ||
              (r.sourceId === toggledFollower.accountId && r.targetId === parentGroup.leaderAccountId);
            if (matches) {
              const isActive = parentGroup.status === 'active' && toggledFollower.status === 'active';
              if (r.isActive !== isActive) {
                relsChanged = true;
                return { ...r, isActive };
              }
            }
            return r;
          });
          if (relsChanged) {
            saveRelationships(updatedRels);
            window.dispatchEvent(new CustomEvent('hedge-relationships-changed'));
          }
        }
      }

      return updated;
    });
  }, []);

  const toggleGlobal = useCallback((enabled: boolean) => {
    if (!enabled) {
      setGroups(prev =>
        prev.map(g => ({
          ...g,
          status: 'paused' as const,
          followers: g.followers.map(f => ({ ...f, status: 'paused' as const })),
          stats: computeGroupStats(
            g.followers.map(f => ({ ...f, status: 'paused' as const })),
          ),
        })),
      );
    }
  }, []);

  // ── Get connection status for a relationship ───────────────────

  const getConnectionStatus = useCallback(
    (sourceId: string, targetId: string): ConnectionStatus => {
      // Find a copier group where one account is the leader and the other is a follower
      for (const group of groups) {
        const leaderIsSource = group.leaderAccountId === sourceId;
        const leaderIsTarget = group.leaderAccountId === targetId;

        if (leaderIsSource || leaderIsTarget) {
          const otherAccountId = leaderIsSource ? targetId : sourceId;
          const follower = group.followers.find(f => f.accountId === otherAccountId);

          if (follower) {
            // Group-level error overrides everything
            if (group.status === 'error') return 'error';
            // Group paused = yellow
            if (group.status === 'paused') return 'paused';
            // Follower-level status
            if (follower.status === 'error') return 'error';
            if (follower.status === 'paused') return 'paused';
            if (follower.status === 'active') return 'active';
            return 'paused'; // pending treated as paused
          }
        }
      }
      return 'none'; // no matching copier group
    },
    [groups],
  );

  // ── Sync: create/update/remove relationships from copier groups ──────────────

  const syncRelationshipsFromGroups = useCallback(() => {
    const currentRelationships = getStoredRelationships();
    let changed = false;

    // Build a set of all valid leader→follower pairs from groups
    const validPairs = new Set<string>();

    for (const group of groups) {
      for (const follower of group.followers) {
        const pairKey1 = `${group.leaderAccountId}::${follower.accountId}`;
        const pairKey2 = `${follower.accountId}::${group.leaderAccountId}`;
        validPairs.add(pairKey1);
        validPairs.add(pairKey2);

        const existingIdx = currentRelationships.findIndex(
          r =>
            (r.sourceId === group.leaderAccountId && r.targetId === follower.accountId) ||
            (r.sourceId === follower.accountId && r.targetId === group.leaderAccountId),
        );

        const isActive = group.status === 'active' && follower.status === 'active';
        const logic = follower.reverseMode ? 'inverse' as const : 'mirror' as const;

        if (existingIdx === -1) {
          // Create new relationship
          currentRelationships.push({
            id: crypto.randomUUID(),
            sourceId: group.leaderAccountId,
            targetId: follower.accountId,
            offsetPercentage: follower.lotMultiplier * 100,
            logic,
            isActive,
          });
          changed = true;
        } else {
          // Update existing relationship to match copier group state
          const existing = currentRelationships[existingIdx];
          if (existing.isActive !== isActive || existing.logic !== logic) {
            currentRelationships[existingIdx] = { ...existing, isActive, logic };
            changed = true;
          }
        }
      }
    }

    // Remove orphaned relationships (those with no matching copier group)
    const beforeLen = currentRelationships.length;
    const cleaned = currentRelationships.filter(r => {
      const key = `${r.sourceId}::${r.targetId}`;
      return validPairs.has(key);
    });
    if (cleaned.length !== beforeLen) {
      changed = true;
    }

    if (changed) {
      saveRelationships(cleaned);
      window.dispatchEvent(new CustomEvent('hedge-relationships-changed'));
    }
  }, [groups]);

  // ── Auto-create copier group from a hedge map relationship ─────

  const createGroupFromRelationship = useCallback(
    (
      sourceId: string,
      targetId: string,
      allAccounts: TradingAccount[],
    ): CopierGroup | null => {
      const sourceAccount = allAccounts.find(a => a.id === sourceId);
      const targetAccount = allAccounts.find(a => a.id === targetId);
      if (!sourceAccount || !targetAccount) return null;

      // Determine leader and follower
      // Convention: the prop/evaluation/funded account is the leader, hedge (live) is the follower
      const isSourceHedge = sourceAccount.phase === 'live';
      const leader = isSourceHedge ? targetAccount : sourceAccount;
      const followerAccount = isSourceHedge ? sourceAccount : targetAccount;

      // Check if a group already exists for this pair
      const exists = groups.some(
        g =>
          g.leaderAccountId === leader.id &&
          g.followers.some(f => f.accountId === followerAccount.id),
      );
      if (exists) return null;

      const group = createCopierGroup(
        `${leader.account_name} → ${followerAccount.account_name}`,
        leader,
        [followerAccount],
      );

      // Set reverse mode for hedging
      group.followers = group.followers.map(f => ({ ...f, reverseMode: true }));

      return group;
    },
    [groups],
  );

  return {
    groups,
    setGroups,
    summary,
    initialized,
    reload,
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroup,
    toggleFollower,
    toggleGlobal,
    getConnectionStatus,
    syncRelationshipsFromGroups,
    createGroupFromRelationship,
  };
}
