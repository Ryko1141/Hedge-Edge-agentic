/**
 * Lot Multiplier Automation
 *
 * Computes the suggested lot multiplier for a hedge copier group
 * based on the cost that must be recovered through the hedge.
 *
 * ══════════════════════════════════════════════════════════════
 *  COST TO RECOVER
 *
 *    C = F + Σ|H_archived,i|
 *
 *  Where:
 *    F                = The evaluation / challenge fee (singular per chain)
 *    Σ|H_archived,i|  = Cumulative |hedge P/L| from all archived predecessor
 *                       accounts in the progression chain
 *
 * ══════════════════════════════════════════════════════════════
 *  SUGGESTED LOT MULTIPLIER
 *
 *    M = C / (D × S)
 *
 *  Where:
 *    D = Max drawdown limit (decimal, e.g. 0.10 for 10%)
 *    S = Account size in dollars
 *
 *  Interpretation: The multiplier ensures that when the prop
 *  account hits its profit target (or drawdown limit), the hedge
 *  side has generated enough to offset the cumulative costs.
 * ══════════════════════════════════════════════════════════════
 */

import type { TradingAccount } from '@/hooks/useTradingAccounts';

// ─── Chain utilities ────────────────────────────────────────────────────────

/**
 * Walk the `previous_account_id` chain and return the root (earliest) account.
 * The root is the one that carries the original evaluation fee.
 */
export function getChainRoot(
  account: TradingAccount,
  allAccounts: TradingAccount[],
): TradingAccount {
  let current = account;
  const visited = new Set<string>();

  while (current.previous_account_id) {
    if (visited.has(current.id)) break; // guard against cycles
    visited.add(current.id);
    const prev = allAccounts.find(a => a.id === current.previous_account_id);
    if (!prev) break;
    current = prev;
  }

  return current;
}

/**
 * Get the single challenge fee for the account chain.
 *
 * The fee is singular for the whole chain — it's the eval fee on the root
 * account (the one that started this evaluation journey).
 */
export function getChainEvalFee(
  account: TradingAccount,
  allAccounts: TradingAccount[],
): number {
  const root = getChainRoot(account, allAccounts);
  return Number(root.evaluation_fee) || 0;
}

/**
 * Sum the absolute hedge P/L from all archived predecessor accounts
 * in the progression chain.
 *
 * Each archived account stores its `archived_hedge_pnl` at the time
 * it was archived. We accumulate those absolute values because each
 * represents a real cost incurred.
 */
export function getCumulativeArchivedHedgePnL(
  account: TradingAccount,
  allAccounts: TradingAccount[],
): number {
  let total = 0;
  let current = account;
  const visited = new Set<string>();

  while (current.previous_account_id) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const prev = allAccounts.find(a => a.id === current.previous_account_id);
    if (!prev) break;
    // Add the absolute hedge P/L from this archived predecessor
    total += Math.abs(Number(prev.archived_hedge_pnl) || 0);
    current = prev;
  }

  return total;
}

/**
 * Compute the total cost to recover for an account's hedge.
 *
 *   C = F + Σ|H_archived|
 *
 * Where F is the chain's single challenge fee and Σ|H_archived| is
 * the cumulative absolute hedge P/L from all linked archived accounts.
 */
export function getCostToRecover(
  account: TradingAccount,
  allAccounts: TradingAccount[],
): number {
  const evalFee = getChainEvalFee(account, allAccounts);
  const archivedHedgePnL = getCumulativeArchivedHedgePnL(account, allAccounts);
  return evalFee + archivedHedgePnL;
}

// ─── Lot multiplier computation ─────────────────────────────────────────────

/**
 * Compute the suggested lot multiplier for hedging a prop account.
 *
 *   M = C / (D × S)
 *
 * @param costToRecover   Total costs to recover (eval fee + archived hedge losses)
 * @param maxDrawdownDecimal  Max loss as decimal (e.g. 0.10 for 10%)
 * @param accountSize     Account size in dollars
 * @returns Suggested lot multiplier (rounded to 2 decimal places), minimum 0.01
 */
export function computeSuggestedLotMultiplier(
  costToRecover: number,
  maxDrawdownDecimal: number,
  accountSize: number,
): number {
  const denom = maxDrawdownDecimal * accountSize;
  if (denom === 0 || costToRecover === 0) return 0;
  const raw = costToRecover / denom;
  return Math.max(0.01, Math.ceil(raw * 100) / 100);
}

/**
 * All-in-one: compute the suggested lot multiplier for a leader account
 * given the full accounts list.
 *
 * @returns `{ suggested, costToRecover, evalFee, archivedHedgePnL }`
 */
export function getSuggestedLotMultiplier(
  leaderAccount: TradingAccount,
  allAccounts: TradingAccount[],
): {
  suggested: number;
  costToRecover: number;
  evalFee: number;
  archivedHedgePnL: number;
  maxDrawdownDecimal: number;
  accountSize: number;
} {
  const evalFee = getChainEvalFee(leaderAccount, allAccounts);
  const archivedHedgePnL = getCumulativeArchivedHedgePnL(leaderAccount, allAccounts);
  const costToRecover = evalFee + archivedHedgePnL;
  const maxDrawdownDecimal = (Number(leaderAccount.max_loss) || 0) / 100;
  const accountSize = Number(leaderAccount.account_size) || 0;
  const suggested = computeSuggestedLotMultiplier(costToRecover, maxDrawdownDecimal, accountSize);

  return { suggested, costToRecover, evalFee, archivedHedgePnL, maxDrawdownDecimal, accountSize };
}
