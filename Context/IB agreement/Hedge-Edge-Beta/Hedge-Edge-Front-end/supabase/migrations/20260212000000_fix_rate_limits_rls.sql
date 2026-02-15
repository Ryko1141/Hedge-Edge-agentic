-- ============================================================================
-- FIX-14: Supabase RLS & Database Security
-- ============================================================================
-- 1. Enable RLS on rate_limits (was publicly accessible via anon key)
-- 2. Add login-attempt tracking columns + RPC functions
-- 3. Improve cleanup_expired_sessions to also prune validation logs
-- 4. Document copier_activity_log DELETE policy decision
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON rate_limits
-- ============================================================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the service_role (backend API / edge functions) gets full access.
-- Regular users should never interact with this table directly.
CREATE POLICY "Service role full access on rate_limits"
    ON rate_limits
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 2. LOGIN-ATTEMPT TRACKING (dedicated table)
-- Uses a separate login_attempts table so the rate_limits PK (ip_address)
-- is never overloaded.  The original check_rate_limit() function is untouched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash     TEXT,
    CONSTRAINT uq_login_attempts_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_window
    ON login_attempts (window_start);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Service role (backend / edge functions) gets full access
CREATE POLICY "Service role full access on login_attempts"
    ON login_attempts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read only their own lockout status
CREATE POLICY "Users can read own login attempts"
    ON login_attempts
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND email = auth.email()
    );

-- Record a login attempt (call via supabase.rpc('record_login_attempt', …))
-- On success → resets counter.  On failure → increments (auto-resets after 15-min window).
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_email   TEXT,
    p_success BOOLEAN,
    p_ip_hash TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO login_attempts (email, window_start, attempt_count, last_attempt_at, ip_hash)
    VALUES (
        lower(p_email),
        NOW(),
        CASE WHEN p_success THEN 0 ELSE 1 END,
        NOW(),
        p_ip_hash
    )
    ON CONFLICT ON CONSTRAINT uq_login_attempts_email
    DO UPDATE SET
        attempt_count = CASE
            WHEN p_success THEN 0
            WHEN login_attempts.window_start + INTERVAL '15 minutes' < NOW() THEN 1
            ELSE login_attempts.attempt_count + 1
        END,
        window_start = CASE
            WHEN login_attempts.window_start + INTERVAL '15 minutes' < NOW() THEN NOW()
            ELSE login_attempts.window_start
        END,
        last_attempt_at = NOW(),
        ip_hash = COALESCE(p_ip_hash, login_attempts.ip_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check whether an account is currently locked out (>=5 failures within 15 min)
CREATE OR REPLACE FUNCTION check_account_locked(p_email TEXT) RETURNS BOOLEAN AS $$
DECLARE
    v_attempts     INT;
    v_window_start TIMESTAMPTZ;
BEGIN
    SELECT attempt_count, window_start INTO v_attempts, v_window_start
    FROM login_attempts
    WHERE email = lower(p_email);

    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF v_window_start + INTERVAL '15 minutes' < NOW() THEN RETURN FALSE; END IF;
    RETURN v_attempts >= 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Prevent anonymous callers from probing lockout status or flooding attempts
REVOKE EXECUTE ON FUNCTION record_login_attempt(TEXT, BOOLEAN, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION check_account_locked(TEXT) FROM anon;

-- ============================================================================
-- 3. IMPROVE cleanup_expired_sessions
-- Original version only pruned license_sessions.
-- Now also cleans validation logs (90 d) and stale login attempts (1 d past window).
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    tmp           INTEGER;
BEGIN
    DELETE FROM license_sessions WHERE expires_at < NOW() - INTERVAL '1 day';
    GET DIAGNOSTICS tmp = ROW_COUNT;
    deleted_count := deleted_count + tmp;

    DELETE FROM license_validation_logs WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS tmp = ROW_COUNT;
    deleted_count := deleted_count + tmp;

    -- Prune login-attempt rows whose window expired over a day ago
    DELETE FROM login_attempts
    WHERE window_start + INTERVAL '15 minutes' < NOW() - INTERVAL '1 day';
    GET DIAGNOSTICS tmp = ROW_COUNT;
    deleted_count := deleted_count + tmp;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for cleanup performance
CREATE INDEX IF NOT EXISTS idx_license_sessions_expires
    ON license_sessions (expires_at);

-- Scheduling note:
-- Supabase plans that support pg_cron:
--   1. Enable pg_cron via Dashboard → Database → Extensions
--   2. SELECT cron.schedule(
--        'cleanup-sessions',
--        '0 */6 * * *',
--        'SELECT cleanup_expired_sessions()'
--      );
-- Alternatively invoke via a Supabase Edge Function triggered by an external cron.

-- ============================================================================
-- 4. DOCUMENT copier_activity_log DELETE POLICY DECISION
-- ============================================================================

COMMENT ON TABLE copier_activity_log IS
    'Audit trail for copier events. '
    'Intentionally has no DELETE policy — users must not be able to remove '
    'their own activity records. Retention cleanup is handled by '
    'cleanup_expired_sessions() or an admin process.';
