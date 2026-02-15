-- Add archived_hedge_pnl column to trading_accounts
-- Stores the hedge P/L at time of archival so subsequent phases
-- can factor it into automatic lot multiplier calculation.
ALTER TABLE trading_accounts
  ADD COLUMN IF NOT EXISTS archived_hedge_pnl DOUBLE PRECISION DEFAULT NULL;

COMMENT ON COLUMN trading_accounts.archived_hedge_pnl IS
  'Hedge P/L at time of archival — used to compute cumulative costs for subsequent phases';
