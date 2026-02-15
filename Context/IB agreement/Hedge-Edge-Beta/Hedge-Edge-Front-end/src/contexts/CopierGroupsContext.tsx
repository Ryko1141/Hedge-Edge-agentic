/**
 * CopierGroupsContext – single source of truth for copier groups.
 *
 * Mounted once at DashboardLayout level so both Hedge Map (Accounts)
 * and Trade Copier share the *same* React state.
 * Persists to localStorage on every change and syncs cross-tab via StorageEvent.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { CopierGroup, CopierGroupStatus, CopierActivityEntry, GroupStats, FollowerStats } from '@/types/copier';
import { useTradingAccounts, type TradingAccount } from '@/hooks/useTradingAccounts';
import {
  getStoredCopierGroups,
  saveCopierGroups,
  getGroupsSummary,
  computeGroupStats,
  createCopierGroup,
  createDefaultFollower,
} from '@/lib/copier-groups';

// ─── Relationship helpers (same localStorage key used by Accounts page) ─────

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

const saveRelationships = (rels: HedgeRelationship[]) => {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(rels));
};

// ─── Connection status type ─────────────────────────────────────────────────

export type ConnectionStatus = 'active' | 'paused' | 'error' | 'none';

// ─── Context shape ──────────────────────────────────────────────────────────

interface CopierGroupsContextValue {
  /** Current copier groups (shared across all pages) */
  groups: CopierGroup[];
  /** Aggregated summary stats */
  summary: ReturnType<typeof getGroupsSummary>;
  /** Whether initial load from localStorage is done */
  initialized: boolean;

  // ── CRUD ──
  addGroup: (group: CopierGroup) => void;
  updateGroup: (updated: CopierGroup) => void;
  deleteGroup: (groupId: string) => void;
  toggleGroup: (groupId: string) => void;
  toggleFollower: (groupId: string, followerId: string) => void;
  toggleGlobal: (enabled: boolean) => void;
  setGroups: React.Dispatch<React.SetStateAction<CopierGroup[]>>;
  reload: () => void;

  // ── Derived helpers ──
  getConnectionStatus: (sourceId: string, targetId: string) => ConnectionStatus;
  syncRelationshipsFromGroups: () => void;
  createGroupFromRelationship: (
    sourceId: string,
    targetId: string,
    allAccounts: TradingAccount[],
  ) => CopierGroup | null;

  // ── Bidirectional sync helpers ──
  /** Delete the copier group that matches a source→target account pair (called when hedge map relationship is deleted) */
  deleteGroupForPair: (sourceId: string, targetId: string) => void;
  /** Update a copier group's settings when the hedge map relationship is edited */
  updateGroupFromRelationship: (
    sourceId: string,
    targetId: string,
    updates: { logic?: 'mirror' | 'partial' | 'inverse'; offsetPercentage?: number; isActive?: boolean },
  ) => void;

  /** Underlying accounts list (avoids duplicating useTradingAccounts) */
  accounts: TradingAccount[];
  accountsLoading: boolean;

  // ── Live engine data ──
  /** Recent activity entries from the copier engine */
  activityLog: CopierActivityEntry[];
  /** Reset circuit breaker for a follower */
  resetCircuitBreaker: (groupId: string, followerId: string) => void;
  /** Whether the copier engine is globally enabled */
  globalCopierEnabled: boolean;
}

const CopierGroupsContext = createContext<CopierGroupsContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function CopierGroupsProvider({ children }: { children: ReactNode }) {
  const { accounts, loading } = useTradingAccounts();
  const [groups, setGroups] = useState<CopierGroup[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Track whether the initial load has been applied so the persist effect
  // never overwrites localStorage with the default empty array.
  const loadAppliedRef = useRef(false);

  // ── Load from localStorage once accounts are ready ──

  useEffect(() => {
    if (loading) return;
    const stored = getStoredCopierGroups();

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

    // Always apply stored groups (even if empty) so state is in sync with localStorage
    setGroups(updated);
    loadAppliedRef.current = true;
    setInitialized(true);
  }, [loading, accounts]);

  // ── Persist every change to localStorage ──
  // Only persist after the initial load has been applied to avoid
  // overwriting localStorage with the default empty state.

  useEffect(() => {
    if (!initialized || !loadAppliedRef.current) return;
    saveCopierGroups(groups);
  }, [groups, initialized]);

  // ── Cross-tab sync via StorageEvent ──

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'hedge_edge_copier_groups' && e.newValue) {
        try {
          const stored = JSON.parse(e.newValue) as CopierGroup[];
          setGroups(stored);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // ── Sync groups to Electron copier engine whenever they change ──

  const [activityLog, setActivityLog] = useState<CopierActivityEntry[]>([]);
  const [globalCopierEnabled, setGlobalCopierEnabled] = useState(true);

  useEffect(() => {
    if (!initialized) return;
    // Push groups to the copier engine in main process
    window.electronAPI?.copier?.updateGroups(groups).catch(() => {});
  }, [groups, initialized]);

  // ── Sync account UUID → MT5 login mapping to copier engine ──
  // The copier engine needs this to match Supabase UUIDs (used to identify
  // accounts in copier groups) with ZMQ terminal IDs (mt5-{login}).

  useEffect(() => {
    if (!initialized || loading) return;
    const api = window.electronAPI?.copier;
    if (!api?.updateAccountMap) return;

    const mapping: Record<string, string> = {};
    for (const acc of accounts) {
      if (acc.id && acc.login) {
        mapping[acc.id] = acc.login;
      }
    }
    if (Object.keys(mapping).length > 0) {
      api.updateAccountMap(mapping).catch(() => {});
    }
  }, [accounts, initialized, loading]);

  // ── Subscribe to copier engine events (stats, activity, errors) ──

  useEffect(() => {
    const api = window.electronAPI?.copier;
    if (!api) return;

    // Restore global enabled state from engine
    api.isGlobalEnabled().then(result => {
      if (result.success && typeof result.data === 'boolean') {
        setGlobalCopierEnabled(result.data);
      }
    }).catch(() => {});

    // Load initial activity log
    api.getActivityLog(100).then(result => {
      if (result.success && result.data) {
        setActivityLog(result.data);
      }
    }).catch(() => {});

    // Subscribe to live events
    const unsubscribe = api.onCopierEvent((event) => {
      switch (event.type) {
        case 'statsUpdate': {
          // Update group stats in place from engine data
          const statsData = event.data as Record<string, {
            groupId: string;
            followers: Record<string, FollowerStats>;
            totalFailedCopies?: number;
          } & GroupStats>;
          if (statsData && typeof statsData === 'object') {
            setGroups(prev => prev.map(g => {
              const engineStats = statsData[g.id];
              if (!engineStats) return g;
              return {
                ...g,
                stats: {
                  tradesToday: engineStats.tradesToday,
                  tradesTotal: engineStats.tradesTotal,
                  totalProfit: engineStats.totalProfit,
                  avgLatency: engineStats.avgLatency,
                  activeFollowers: engineStats.activeFollowers,
                  totalFollowers: engineStats.totalFollowers,
                },
                totalFailedCopies: engineStats.totalFailedCopies ?? g.totalFailedCopies,
                followers: g.followers.map(f => {
                  const fStats = engineStats.followers?.[f.id];
                  if (!fStats) return f;
                  return { ...f, stats: fStats };
                }),
              };
            }));
          }
          break;
        }
        case 'activity': {
          const entry = event.data as CopierActivityEntry;
          if (entry) {
            setActivityLog(prev => [entry, ...prev].slice(0, 500));
          }
          break;
        }
        case 'copyError':
          // Could trigger toast notifications here in the future
          console.warn(`[Copier] ${event.type}:`, event.data);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [initialized]);

  // ── Reload from localStorage (manual) ──

  const reload = useCallback(() => {
    const stored = getStoredCopierGroups();
    setGroups(stored.length > 0 ? stored : []);
  }, []);

  // ── Summary ──

  const summary = useMemo(() => getGroupsSummary(groups), [groups]);

  // ── CRUD handlers ──

  const addGroup = useCallback((group: CopierGroup) => {
    setGroups(prev => [...prev, group]);
  }, []);

  const updateGroup = useCallback((updated: CopierGroup) => {
    setGroups(prev =>
      prev.map(g =>
        g.id === updated.id
          ? { ...g, ...updated, stats: computeGroupStats(updated.followers) }
          : g,
      ),
    );
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    // Find the group so we can clean up its relationships
    setGroups(prev => {
      const groupToDelete = prev.find(g => g.id === groupId);
      if (groupToDelete) {
        // Remove matching hedge map relationships
        const currentRels = getStoredRelationships();
        const updatedRels = currentRels.filter(r => {
          // Remove any relationship that matches leader→follower or follower→leader
          return !groupToDelete.followers.some(
            f =>
              (r.sourceId === groupToDelete.leaderAccountId && r.targetId === f.accountId) ||
              (r.sourceId === f.accountId && r.targetId === groupToDelete.leaderAccountId),
          );
        });
        if (updatedRels.length !== currentRels.length) {
          saveRelationships(updatedRels);
          // Dispatch event so Accounts page picks up the change
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
        // Also toggle all followers to match the group status
        const updatedFollowers = g.followers.map(f => ({
          ...f,
          status: newStatus as typeof f.status,
        }));
        return {
          ...g,
          status: newStatus,
          followers: updatedFollowers,
          stats: computeGroupStats(updatedFollowers),
          updatedAt: new Date().toISOString(),
        };
      });

      // Sync the isActive flag on matching hedge map relationships
      const toggledGroup = updated.find(g => g.id === groupId);
      if (toggledGroup) {
        const currentRels = getStoredRelationships();
        let relsChanged = false;
        const isGroupActive = toggledGroup.status === 'active';
        const updatedRels = currentRels.map(r => {
          const matchesFollower = toggledGroup.followers.some(
            f =>
              (r.sourceId === toggledGroup.leaderAccountId && r.targetId === f.accountId) ||
              (r.sourceId === f.accountId && r.targetId === toggledGroup.leaderAccountId),
          );
          if (matchesFollower) {
            if (r.isActive !== isGroupActive) {
              relsChanged = true;
              return { ...r, isActive: isGroupActive };
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
          return {
            ...f,
            status: f.status === 'active' ? ('paused' as const) : ('active' as const),
          };
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
    setGlobalCopierEnabled(enabled);
    // Sync with copier engine
    window.electronAPI?.copier?.setGlobalEnabled(enabled).catch(() => {});
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

  // ── Get connection status for a relationship ──

  const getConnectionStatus = useCallback(
    (sourceId: string, targetId: string): ConnectionStatus => {
      for (const group of groups) {
        const leaderIsSource = group.leaderAccountId === sourceId;
        const leaderIsTarget = group.leaderAccountId === targetId;

        if (leaderIsSource || leaderIsTarget) {
          const otherAccountId = leaderIsSource ? targetId : sourceId;
          const follower = group.followers.find(f => f.accountId === otherAccountId);

          if (follower) {
            if (group.status === 'error') return 'error';
            if (group.status === 'paused') return 'paused';
            if (follower.status === 'error') return 'error';
            if (follower.status === 'paused') return 'paused';
            if (follower.status === 'active') return 'active';
            return 'paused';
          }
        }
      }
      return 'none';
    },
    [groups],
  );

  // ── Sync: create/update/remove relationships from copier groups ──

  const syncRelationshipsFromGroups = useCallback(() => {
    // Guard: don't clean up orphans if groups haven't loaded from localStorage yet.
    // Without this, the first call with groups=[] would wipe all relationships.
    if (!initialized || !loadAppliedRef.current) return;

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
  }, [groups, initialized]);

  // ── Auto-create copier group from a hedge map relationship ──

  const createGroupFromRelationship = useCallback(
    (
      sourceId: string,
      targetId: string,
      allAccounts: TradingAccount[],
    ): CopierGroup | null => {
      const sourceAccount = allAccounts.find(a => a.id === sourceId);
      const targetAccount = allAccounts.find(a => a.id === targetId);
      if (!sourceAccount || !targetAccount) return null;

      const isSourceHedge = sourceAccount.phase === 'live';
      const leader = isSourceHedge ? targetAccount : sourceAccount;
      const followerAccount = isSourceHedge ? sourceAccount : targetAccount;

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
      group.followers = group.followers.map(f => ({ ...f, reverseMode: true }));

      return group;
    },
    [groups],
  );

  // ── Delete copier group for an account pair (hedge map → copier) ──

  const deleteGroupForPair = useCallback(
    (sourceId: string, targetId: string) => {
      setGroups(prev => {
        const match = prev.find(g => {
          const leaderIsSource = g.leaderAccountId === sourceId;
          const leaderIsTarget = g.leaderAccountId === targetId;
          if (!leaderIsSource && !leaderIsTarget) return false;
          const otherAccountId = leaderIsSource ? targetId : sourceId;
          return g.followers.some(f => f.accountId === otherAccountId);
        });
        if (!match) return prev;
        return prev.filter(g => g.id !== match.id);
      });
    },
    [],
  );

  // ── Update copier group from hedge map relationship changes ──

  const updateGroupFromRelationship = useCallback(
    (
      sourceId: string,
      targetId: string,
      updates: { logic?: 'mirror' | 'partial' | 'inverse'; offsetPercentage?: number; isActive?: boolean },
    ) => {
      setGroups(prev =>
        prev.map(g => {
          const leaderIsSource = g.leaderAccountId === sourceId;
          const leaderIsTarget = g.leaderAccountId === targetId;
          if (!leaderIsSource && !leaderIsTarget) return g;

          const otherAccountId = leaderIsSource ? targetId : sourceId;
          const followerIdx = g.followers.findIndex(f => f.accountId === otherAccountId);
          if (followerIdx === -1) return g;

          const followers = [...g.followers];
          const follower = { ...followers[followerIdx] };

          // Sync logic → reverseMode
          if (updates.logic !== undefined) {
            follower.reverseMode = updates.logic === 'inverse';
          }
          // Sync offsetPercentage → lotMultiplier
          if (updates.offsetPercentage !== undefined) {
            follower.lotMultiplier = updates.offsetPercentage / 100;
          }
          // Sync isActive → follower status + group status
          if (updates.isActive !== undefined) {
            follower.status = updates.isActive ? 'active' : 'paused';
          }

          followers[followerIdx] = follower;

          let newGroupStatus = g.status;
          if (updates.isActive !== undefined) {
            newGroupStatus = updates.isActive ? 'active' : 'paused';
          }

          return {
            ...g,
            status: newGroupStatus,
            followers,
            stats: computeGroupStats(followers),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [],
  );

  // ── Reset circuit breaker via engine ──

  const resetCircuitBreaker = useCallback((groupId: string, followerId: string) => {
    window.electronAPI?.copier?.resetCircuitBreaker(groupId, followerId).catch(() => {});
  }, []);

  // ── Context value ──

  const value = useMemo<CopierGroupsContextValue>(
    () => ({
      groups,
      summary,
      initialized,
      addGroup,
      updateGroup,
      deleteGroup,
      toggleGroup,
      toggleFollower,
      toggleGlobal,
      setGroups,
      reload,
      getConnectionStatus,
      syncRelationshipsFromGroups,
      createGroupFromRelationship,
      deleteGroupForPair,
      updateGroupFromRelationship,
      accounts,
      accountsLoading: loading,
      activityLog,
      resetCircuitBreaker,
      globalCopierEnabled,
    }),
    [
      groups,
      summary,
      initialized,
      addGroup,
      updateGroup,
      deleteGroup,
      toggleGroup,
      toggleFollower,
      toggleGlobal,
      reload,
      getConnectionStatus,
      syncRelationshipsFromGroups,
      createGroupFromRelationship,
      deleteGroupForPair,
      updateGroupFromRelationship,
      accounts,
      loading,
      activityLog,
      resetCircuitBreaker,
      globalCopierEnabled,
    ],
  );

  return (
    <CopierGroupsContext.Provider value={value}>
      {children}
    </CopierGroupsContext.Provider>
  );
}

// ─── Consumer hook ──────────────────────────────────────────────────────────

export function useCopierGroupsContext() {
  const ctx = useContext(CopierGroupsContext);
  if (!ctx) {
    throw new Error(
      'useCopierGroupsContext must be used within a <CopierGroupsProvider>',
    );
  }
  return ctx;
}
