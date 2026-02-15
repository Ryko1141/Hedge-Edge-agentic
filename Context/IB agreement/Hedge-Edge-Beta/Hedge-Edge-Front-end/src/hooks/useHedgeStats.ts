/**
 * useHedgeStats – Computes per-account Hedge P/L and Hedge Discrepancy
 * purely from **live connection snapshots** + copier group configuration.
 *
 * ══════════════════════════════════════════════════════════════
 *  HEDGE P/L  (per prop account i)
 *
 *    P_h,i  =  Σ_j [ (B_j,now − B_j,baseline) + F_j ]
 *
 *  Where j iterates over each follower (hedge account) in every copier
 *  group whose leader is account i:
 *    B_j,now       = follower's current balance (from live snapshot)
 *    B_j,baseline  = follower's balance when the copier group was created
 *    F_j           = follower's current floating (unrealised) P/L
 *
 *  This is the total P/L generated on the hedge side since the copier
 *  group was established.
 *
 * ══════════════════════════════════════════════════════════════
 *  HEDGE DISCREPANCY  (per account i)
 *
 *    HD_i  =  P_h,i  −  P_h,expected,i
 *
 *  Where:
 *    P_h,expected,i  =  −(P_f,i × F_i) / (D_i × S_i)
 *
 *    P_f,i  = Current P/L of prop account i
 *    F_i    = Challenge / evaluation fee for account i
 *    D_i    = Max drawdown limit (decimal, e.g. 0.10)
 *    S_i    = Account size
 * ══════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   Renderer-only.  No IPC to copier engine.
 *   Data sources:
 *     • Copier groups   → CopierGroupsContext (localStorage-backed)
 *     • Live snapshots   → useConnectionsFeed  (IPC polling)
 *     • Account metadata → useTradingAccounts   (Supabase)
 */

import { useCallback, useMemo } from 'react';
import type { TradingAccount } from '@/hooks/useTradingAccounts';
import type { CopierGroup } from '@/types/copier';
import type { ConnectionSnapshot } from '@/types/connections';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AccountHedgeStats {
  /** Actual hedge P/L from follower accounts (realised + floating) */
  hedgePnL: number;
  /** Expected hedge P/L given the prop account's current P/L */
  expectedHedgePnL: number;
  /** Discrepancy: actual - expected (negative = under-hedged) */
  hedgeDiscrepancy: number;
}

export interface AggregateHedgeStats {
  /** Total hedge P/L across all prop accounts */
  totalHedgePnL: number;
  /** Total hedge discrepancy */
  totalHedgeDiscrepancy: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Expected hedge P/L for one prop account.
 *   P_h,expected = -(P_f × F) / (D × S)
 */
function computeExpectedHedgePnL(
  propPnL: number,
  fee: number,
  drawdownDecimal: number,
  accountSize: number,
): number {
  const denom = drawdownDecimal * accountSize;
  if (denom === 0) return 0;
  return -(propPnL * fee) / denom;
}

/**
 * Compute per-follower hedge P/L from a live snapshot.
 *
 *   hedgePnL = (currentBalance - baselineBalance) + floatingPnL
 *
 * `baselineBalance` is the follower's balance when the copier group was created.
 * Falls back to TradingAccount.account_size for legacy groups without it.
 */
function computeFollowerHedgePnL(
  snapshot: ConnectionSnapshot | null,
  baselineBalance: number,
): number {
  if (!snapshot?.metrics) return 0;

  const currentBalance = snapshot.metrics.balance ?? 0;
  const floatingPnL = snapshot.metrics.profit ?? 0;

  // Realised P/L since group creation  +  unrealised floating
  return (currentBalance - baselineBalance) + floatingPnL;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * @param accounts       All trading accounts (from useTradingAccounts)
 * @param copierGroups   All copier groups   (from useCopierGroupsContext)
 * @param getSnapshot    Snapshot lookup fn  (from useConnectionsFeed)
 */
export function useHedgeStats(
  accounts: TradingAccount[],
  copierGroups: CopierGroup[],
  getSnapshot: (accountId: string) => ConnectionSnapshot | null,
) {
  // ── Build a lookup: leaderAccountId → aggregated follower hedge P/L ──

  const hedgePnLByLeader = useMemo(() => {
    const result: Record<string, number> = {};
    if (!copierGroups || !Array.isArray(copierGroups)) return result;

    for (const group of copierGroups) {
      if (group.status === 'active' || group.status === 'paused') {
        const leaderId = group.leaderAccountId;
        if (result[leaderId] === undefined) result[leaderId] = 0;

        for (const follower of group.followers) {
          // Resolve baseline — stored on the follower, or fall back to account_size
          const followerAccount = accounts.find(a => a.id === follower.accountId);
          const baseline =
            follower.baselineBalance ??
            (followerAccount
              ? Number(followerAccount.current_balance) || Number(followerAccount.account_size) || 0
              : 0);

          // Look up live snapshot (by login first, then by id)
          const snap =
            (followerAccount?.login ? getSnapshot(followerAccount.login) : null) ||
            getSnapshot(follower.accountId);

          result[leaderId] += computeFollowerHedgePnL(snap, baseline);
        }
      }
    }

    return result;
  }, [copierGroups, accounts, getSnapshot]);

  // ── Per-account hedge stats (scoped to the current copier group) ──

  const getAccountHedgeStats = useCallback(
    (account: TradingAccount): AccountHedgeStats => {
      // Hedge accounts themselves don't have "hedge P/L"
      if (account.phase === 'live') {
        return { hedgePnL: 0, expectedHedgePnL: 0, hedgeDiscrepancy: 0 };
      }

      const actualHedgePnL = hedgePnLByLeader[account.id] ?? 0;

      const propPnL = Number(account.pnl) || 0;
      const fee = Number(account.evaluation_fee) || 0;
      const drawdownDecimal = (Number(account.max_loss) || 0) / 100;
      const accountSize = Number(account.account_size) || 0;

      // Scope to the current copier group by subtracting the leader's
      // P/L at the time the group was created.  This ensures the
      // discrepancy starts at 0 when a new group is created and only
      // measures the divergence during THIS group's lifetime.
      const activeGroup = copierGroups.find(
        g => g.leaderAccountId === account.id && (g.status === 'active' || g.status === 'paused'),
      );
      const baselinePnL = activeGroup?.leaderBaselinePnL ?? 0;
      const scopedPropPnL = propPnL - baselinePnL;

      const expectedHedgePnL = computeExpectedHedgePnL(scopedPropPnL, fee, drawdownDecimal, accountSize);
      const hedgeDiscrepancy = actualHedgePnL - expectedHedgePnL;

      return { hedgePnL: actualHedgePnL, expectedHedgePnL, hedgeDiscrepancy };
    },
    [hedgePnLByLeader, copierGroups],
  );

  // ── Aggregate across all non-archived prop accounts ──
  //    Uses LIFETIME prop P/L (not scoped to any single copier group)
  //    so the "All Accounts" view is cumulative across hedge history.

  const getAggregateHedgeStats = useCallback((): AggregateHedgeStats => {
    const propAccounts = accounts.filter(
      a => !a.is_archived && (a.phase === 'funded' || a.phase === 'evaluation'),
    );

    let totalHedgePnL = 0;
    let totalHedgeDiscrepancy = 0;

    for (const account of propAccounts) {
      const actualHedgePnL = hedgePnLByLeader[account.id] ?? 0;
      totalHedgePnL += actualHedgePnL;

      // Lifetime prop P/L — NOT scoped to current group
      const propPnL = Number(account.pnl) || 0;
      const fee = Number(account.evaluation_fee) || 0;
      const drawdownDecimal = (Number(account.max_loss) || 0) / 100;
      const accountSize = Number(account.account_size) || 0;

      const expectedHedgePnL = computeExpectedHedgePnL(propPnL, fee, drawdownDecimal, accountSize);
      totalHedgeDiscrepancy += actualHedgePnL - expectedHedgePnL;
    }

    return { totalHedgePnL, totalHedgeDiscrepancy };
  }, [accounts, hedgePnLByLeader]);

  return {
    hedgePnLByLeader,
    getAccountHedgeStats,
    getAggregateHedgeStats,
  };
}
