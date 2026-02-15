/**
 * Trade Copier Types
 * Based on Heron Copier configuration model
 * Master (Leader) → Follower(s) with per-follower risk settings
 */

// ─── Volume Sizing ──────────────────────────────────────────────────────────

/** Only lot-multiplier is supported for now */
export type VolumeSizingMode = 'lot-multiplier';

// ─── Copier Group Status ────────────────────────────────────────────────────

export type CopierGroupStatus = 'active' | 'paused' | 'error';
export type FollowerStatus = 'active' | 'paused' | 'error' | 'pending';

// ─── Symbol Mapping Entry ───────────────────────────────────────────────────

export interface SymbolMapping {
  masterSymbol: string;
  slaveSymbol: string;
  /** Optional per-symbol lot multiplier override */
  lotMultiplier?: number;
}

// ─── Follower Config ────────────────────────────────────────────────────────

export interface FollowerConfig {
  id: string;
  accountId: string;
  accountName: string;
  platform: string;
  phase: 'evaluation' | 'funded' | 'live';
  status: FollowerStatus;

  // Volume sizing — always lot-multiplier
  volumeSizing: VolumeSizingMode;
  lotMultiplier: number;       // multiply leader lot size by this factor

  // Reverse mode — always true: this copier only reverses (hedges) trades
  reverseMode: boolean;

  // Symbol filtering
  symbolWhitelist: string[];   // only these symbols copied
  symbolBlacklist: string[];   // these symbols skipped
  symbolSuffix: string;        // append suffix to all symbols
  symbolAliases: SymbolMapping[];

  // Magic number filtering
  magicNumberWhitelist: number[];  // only copy these magic numbers
  magicNumberBlacklist: number[];  // skip these magic numbers

  /** Balance of this follower account at the time the copier group was created.
   *  Used to compute Hedge P/L = (currentBalance - baselineBalance) + floatingPnL.
   *  Falls back to TradingAccount.account_size when not set (legacy groups). */
  baselineBalance?: number;

  // Stats (runtime)
  stats: FollowerStats;
}

export interface FollowerStats {
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  successRate: number;
  failedCopies: number;
  lastCopyTime: string | null;
}

// ─── Copier Group (1 Leader → N Followers) ──────────────────────────────────

export interface CopierGroup {
  id: string;
  name: string;
  status: CopierGroupStatus;

  // Leader account
  leaderAccountId: string;
  leaderAccountName: string;
  leaderPlatform: string;
  leaderPhase: 'evaluation' | 'funded' | 'live';
  /** Symbol suffix to remove from leader symbols before sending */
  leaderSymbolSuffixRemove: string;

  /** Leader's P/L at the time this copier group was created.
   *  Used to scope Hedge Discrepancy to the current group's lifetime.
   *  Formula: expectedHedge uses (currentPnL − baselinePnL) instead of lifetime PnL. */
  leaderBaselinePnL?: number;

  // Followers
  followers: FollowerConfig[];

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Aggregated stats (computed)
  stats: GroupStats;
  /** Total failed copies across all followers **/
  totalFailedCopies?: number;
}

export interface GroupStats {
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  activeFollowers: number;
  totalFollowers: number;
}

// ─── Activity Log ───────────────────────────────────────────────────────────

export interface CopierActivityEntry {
  id: string;
  groupId: string;
  followerId: string;
  timestamp: string;
  type: 'open' | 'close' | 'modify' | 'error';
  symbol: string;
  action: 'buy' | 'sell';
  volume: number;
  price: number;
  latency: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}
