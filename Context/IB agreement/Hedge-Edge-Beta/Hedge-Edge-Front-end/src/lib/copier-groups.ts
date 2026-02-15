/**
 * Copier Group Utilities
 * Real production helpers for creating, storing, and computing copier groups.
 */

import { z } from 'zod';
import type {
  CopierGroup,
  FollowerConfig,
  FollowerStats,
  GroupStats,
} from '@/types/copier';
import type { TradingAccount } from '@/hooks/useTradingAccounts';

// ─── Local Storage ──────────────────────────────────────────────────────────

const COPIER_GROUPS_KEY = 'hedge_edge_copier_groups';

// ─── Validation Schemas ─────────────────────────────────────────────────────

const FollowerStatsSchema = z.object({
  tradesToday: z.number(),
  tradesTotal: z.number(),
  totalProfit: z.number(),
  avgLatency: z.number(),
  successRate: z.number(),
  failedCopies: z.number(),
  lastCopyTime: z.string().nullable(),
});

const SymbolMappingSchema = z.object({
  masterSymbol: z.string(),
  slaveSymbol: z.string(),
  lotMultiplier: z.number().optional(),
});

const FollowerConfigSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  platform: z.string(),
  phase: z.enum(['evaluation', 'funded', 'live']),
  status: z.enum(['active', 'paused', 'error', 'pending']),
  volumeSizing: z.string(),
  lotMultiplier: z.number().min(0.01).max(100),
  reverseMode: z.boolean(),
  symbolWhitelist: z.array(z.string()),
  symbolBlacklist: z.array(z.string()),
  symbolSuffix: z.string(),
  symbolAliases: z.array(SymbolMappingSchema),
  magicNumberWhitelist: z.array(z.number()),
  magicNumberBlacklist: z.array(z.number()),
  baselineBalance: z.number().optional(),
  stats: FollowerStatsSchema,
});

const GroupStatsSchema = z.object({
  tradesToday: z.number(),
  tradesTotal: z.number(),
  totalProfit: z.number(),
  avgLatency: z.number(),
  activeFollowers: z.number(),
  totalFollowers: z.number(),
});

const CopierGroupSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  status: z.enum(['active', 'paused', 'error']),
  leaderAccountId: z.string(),
  leaderAccountName: z.string(),
  leaderPlatform: z.string(),
  leaderPhase: z.enum(['evaluation', 'funded', 'live']),
  leaderSymbolSuffixRemove: z.string(),
  leaderBaselinePnL: z.number().optional(),
  followers: z.array(FollowerConfigSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: GroupStatsSchema,
  totalFailedCopies: z.number().optional(),
});

const CopierGroupsArraySchema = z.array(CopierGroupSchema);

// ─── Storage Access ─────────────────────────────────────────────────────────

export const getStoredCopierGroups = (): CopierGroup[] => {
  try {
    const stored = localStorage.getItem(COPIER_GROUPS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    const result = CopierGroupsArraySchema.safeParse(parsed);

    if (!result.success) {
      console.warn('[CopierGroups] Invalid stored data, resetting:', result.error.message);
      localStorage.removeItem(COPIER_GROUPS_KEY);
      return [];
    }

    return result.data as CopierGroup[];
  } catch {
    localStorage.removeItem(COPIER_GROUPS_KEY);
    return [];
  }
};

export const saveCopierGroups = (groups: CopierGroup[]) => {
  localStorage.setItem(COPIER_GROUPS_KEY, JSON.stringify(groups));
};

// ─── Default Follower Config ────────────────────────────────────────────────

export const createDefaultFollower = (
  account: TradingAccount,
): FollowerConfig => ({
  id: `follower-${account.id}`,
  accountId: account.id,
  accountName: account.account_name,
  platform: account.platform || 'MT5',
  phase: account.phase,
  status: 'active',
  volumeSizing: 'lot-multiplier',
  lotMultiplier: 1.0,
  reverseMode: true,
  symbolWhitelist: [],
  symbolBlacklist: [],
  symbolSuffix: '',
  symbolAliases: [],
  magicNumberWhitelist: [],
  magicNumberBlacklist: [],
  // Capture the account balance right now as the baseline for Hedge P/L
  baselineBalance: Number(account.current_balance) || Number(account.account_size) || 0,
  stats: emptyFollowerStats(),
});

const emptyFollowerStats = (): FollowerStats => ({
  tradesToday: 0,
  tradesTotal: 0,
  totalProfit: 0,
  avgLatency: 0,
  successRate: 100,
  failedCopies: 0,
  lastCopyTime: null,
});

// ─── Compute Group Stats ────────────────────────────────────────────────────

export const computeGroupStats = (followers: FollowerConfig[]): GroupStats => {
  const active = followers.filter(f => f.status === 'active');
  const tradesToday = followers.reduce((s, f) => s + f.stats.tradesToday, 0);
  const tradesTotal = followers.reduce((s, f) => s + f.stats.tradesTotal, 0);
  const totalProfit = followers.reduce((s, f) => s + f.stats.totalProfit, 0);
  const avgLatency =
    active.length > 0
      ? Math.round(active.reduce((s, f) => s + f.stats.avgLatency, 0) / active.length)
      : 0;

  return {
    tradesToday,
    tradesTotal,
    totalProfit: Math.round(totalProfit * 100) / 100,
    avgLatency,
    activeFollowers: active.length,
    totalFollowers: followers.length,
  };
};

// ─── Create a New Copier Group ──────────────────────────────────────────────

export const createCopierGroup = (
  name: string,
  leader: TradingAccount,
  followerAccounts: TradingAccount[],
): CopierGroup => {
  const now = new Date().toISOString();
  const followers = followerAccounts.map(createDefaultFollower);

  // Capture the leader's current P/L so hedge discrepancy is scoped
  // to this group's lifetime (not the account's entire history).
  const accountSize = Number(leader.account_size) || 0;
  const currentBalance = Number(leader.current_balance) || accountSize;
  const leaderBaselinePnL = currentBalance - accountSize;

  return {
    id: `group-${crypto.randomUUID()}`,
    name,
    status: 'active',
    leaderAccountId: leader.id,
    leaderAccountName: leader.account_name,
    leaderPlatform: leader.platform || 'MT5',
    leaderPhase: leader.phase,
    leaderSymbolSuffixRemove: '',
    leaderBaselinePnL,
    followers,
    createdAt: now,
    updatedAt: now,
    stats: computeGroupStats(followers),
  };
};

// ─── Summary Across All Groups ──────────────────────────────────────────────

export const getGroupsSummary = (groups: CopierGroup[]) => {
  const activeGroups = groups.filter(g => g.status === 'active');
  const allFollowers = groups.flatMap(g => g.followers);
  const activeFollowers = allFollowers.filter(f => f.status === 'active');

  return {
    totalGroups: groups.length,
    activeGroups: activeGroups.length,
    totalFollowers: allFollowers.length,
    activeFollowers: activeFollowers.length,
    tradesToday: groups.reduce((s, g) => s + g.stats.tradesToday, 0),
    totalProfit: Math.round(groups.reduce((s, g) => s + g.stats.totalProfit, 0) * 100) / 100,
    avgLatency:
      activeGroups.length > 0
        ? Math.round(activeGroups.reduce((s, g) => s + g.stats.avgLatency, 0) / activeGroups.length)
        : 0,
  };
};
