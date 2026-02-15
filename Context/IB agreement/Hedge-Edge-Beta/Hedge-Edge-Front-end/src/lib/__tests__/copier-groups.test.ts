import { describe, it, expect, beforeEach } from 'vitest';
import {
    getStoredCopierGroups,
    saveCopierGroups,
    computeGroupStats,
    createDefaultFollower,
    createCopierGroup,
    getGroupsSummary,
} from '@/lib/copier-groups';
import type { CopierGroup, FollowerConfig } from '@/types/copier';
import type { TradingAccount } from '@/hooks/useTradingAccounts';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const makeMockAccount = (overrides: Partial<TradingAccount> = {}): TradingAccount => ({
    id: 'acc-1',
    user_id: 'user-1',
    account_name: 'Test Account',
    platform: 'MT5',
    phase: 'funded' as const,
    current_balance: '10000',
    account_size: '10000',
    broker: 'TestBroker',
    server: 'TestServer',
    login_id: '12345',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
} as TradingAccount);

const makeMockFollower = (overrides: Partial<FollowerConfig> = {}): FollowerConfig => ({
    id: 'follower-1',
    accountId: 'acc-1',
    accountName: 'Follower Account',
    platform: 'MT5',
    phase: 'funded',
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
    stats: {
        tradesToday: 5,
        tradesTotal: 100,
        totalProfit: 250.50,
        avgLatency: 45,
        successRate: 98,
        failedCopies: 2,
        lastCopyTime: null,
    },
    ...overrides,
});

// ─── localStorage Persistence ───────────────────────────────────────────────

describe('getStoredCopierGroups / saveCopierGroups', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns empty array when nothing is stored', () => {
        expect(getStoredCopierGroups()).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
        localStorage.setItem('hedge_edge_copier_groups', 'not-json');
        expect(getStoredCopierGroups()).toEqual([]);
    });

    it('returns empty array for data that fails schema validation', () => {
        localStorage.setItem('hedge_edge_copier_groups', JSON.stringify([{ bad: 'data' }]));
        expect(getStoredCopierGroups()).toEqual([]);
    });
});

// ─── computeGroupStats ──────────────────────────────────────────────────────

describe('computeGroupStats', () => {
    it('computes stats from an array of followers', () => {
        const followers: FollowerConfig[] = [
            makeMockFollower({ status: 'active', stats: { tradesToday: 3, tradesTotal: 50, totalProfit: 100, avgLatency: 40, successRate: 95, failedCopies: 1, lastCopyTime: null } }),
            makeMockFollower({ id: 'f2', status: 'active', stats: { tradesToday: 7, tradesTotal: 150, totalProfit: 200, avgLatency: 60, successRate: 99, failedCopies: 0, lastCopyTime: null } }),
        ];
        const stats = computeGroupStats(followers);

        expect(stats.tradesToday).toBe(10);
        expect(stats.tradesTotal).toBe(200);
        expect(stats.totalProfit).toBe(300);
        expect(stats.avgLatency).toBe(50); // (40+60)/2
        expect(stats.activeFollowers).toBe(2);
        expect(stats.totalFollowers).toBe(2);
    });

    it('returns zero latency when no active followers', () => {
        const followers: FollowerConfig[] = [
            makeMockFollower({ status: 'paused' }),
        ];
        const stats = computeGroupStats(followers);
        expect(stats.avgLatency).toBe(0);
        expect(stats.activeFollowers).toBe(0);
        expect(stats.totalFollowers).toBe(1);
    });

    it('handles empty followers array', () => {
        const stats = computeGroupStats([]);
        expect(stats.tradesToday).toBe(0);
        expect(stats.totalFollowers).toBe(0);
        expect(stats.activeFollowers).toBe(0);
    });
});

// ─── createDefaultFollower ──────────────────────────────────────────────────

describe('createDefaultFollower', () => {
    it('creates a follower config from a trading account', () => {
        const account = makeMockAccount({ id: 'acc-42', account_name: 'My Funded' });
        const follower = createDefaultFollower(account);

        expect(follower.id).toBe('follower-acc-42');
        expect(follower.accountId).toBe('acc-42');
        expect(follower.accountName).toBe('My Funded');
        expect(follower.status).toBe('active');
        expect(follower.lotMultiplier).toBe(1.0);
        expect(follower.reverseMode).toBe(true);
        expect(follower.stats.tradesToday).toBe(0);
    });

    it('uses current_balance as baselineBalance', () => {
        const account = makeMockAccount({ current_balance: '25000' });
        const follower = createDefaultFollower(account);
        expect(follower.baselineBalance).toBe(25000);
    });
});

// ─── createCopierGroup ──────────────────────────────────────────────────────

describe('createCopierGroup', () => {
    it('creates a group with leader and followers', () => {
        const leader = makeMockAccount({ id: 'leader-1', account_name: 'Leader' });
        const followerAccounts = [
            makeMockAccount({ id: 'f1', account_name: 'Follower 1' }),
            makeMockAccount({ id: 'f2', account_name: 'Follower 2' }),
        ];

        const group = createCopierGroup('Test Group', leader, followerAccounts);

        expect(group.name).toBe('Test Group');
        expect(group.leaderAccountId).toBe('leader-1');
        expect(group.followers.length).toBe(2);
        expect(group.status).toBe('active');
        expect(group.id).toMatch(/^group-/);
        expect(group.createdAt).toBeDefined();
    });
});

// ─── getGroupsSummary ───────────────────────────────────────────────────────

describe('getGroupsSummary', () => {
    it('summarizes across multiple groups', () => {
        const groups: CopierGroup[] = [
            createCopierGroup('G1', makeMockAccount({ id: 'l1' }), [makeMockAccount({ id: 'f1' })]),
            createCopierGroup('G2', makeMockAccount({ id: 'l2' }), [makeMockAccount({ id: 'f2' }), makeMockAccount({ id: 'f3' })]),
        ];
        const summary = getGroupsSummary(groups);

        expect(summary.totalGroups).toBe(2);
        expect(summary.totalFollowers).toBe(3);
        expect(summary.activeGroups).toBe(2);
    });

    it('returns zeros for empty groups', () => {
        const summary = getGroupsSummary([]);
        expect(summary.totalGroups).toBe(0);
        expect(summary.totalFollowers).toBe(0);
        expect(summary.tradesToday).toBe(0);
    });
});
