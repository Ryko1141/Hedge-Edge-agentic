/**
 * Shared Types — Canonical data structures used across the Electron main process.
 *
 * RATIONALE: ZmqPosition (zmq-bridge.ts) and AgentPosition (agent-channel-reader.ts)
 * were byte-identical interfaces, requiring redundant field-by-field mapping in every
 * conversion function. This module defines ONE canonical Position type that both
 * modules re-export, eliminating ~80 lines of dead identity-mappings.
 */

// ============================================================================
// Position — The canonical trade-position shape sent by MT5/cTrader EAs
// ============================================================================

export interface Position {
  id: string;
  symbol: string;
  volume: number;
  volumeLots: number;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
  comment: string;
  /**
   * Number of decimal digits for the symbol's price (from SymbolInfoInteger SYMBOL_DIGITS).
   * Used to compute per-symbol pip value instead of a hardcoded 0.0001.
   * Optional for backwards compatibility with legacy EAs that don't send it.
   */
  digits?: number;
}

/**
 * Compute the pip value for a given symbol based on its digit precision.
 *
 * Convention:
 *   5 or 4 digits → 1 pip = 0.0001  (standard forex)
 *   3 or 2 digits → 1 pip = 0.01    (JPY pairs, metals)
 *   1 digit       → 1 pip = 0.1
 *   0 digits      → 1 pip = 1       (exotic / crypto)
 *
 * Falls back to 0.0001 when digits is unavailable (legacy EA).
 */
export function pipValueFromDigits(digits: number | undefined): number {
  if (digits === undefined || digits === null) return 0.0001; // legacy fallback
  if (digits >= 4) return 0.0001;
  if (digits >= 2) return 0.01;
  if (digits >= 1) return 0.1;
  return 1;
}
