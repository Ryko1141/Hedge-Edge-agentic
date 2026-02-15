-- License System Database Schema
-- Migration: 20260201000000_license_system.sql
-- Description: Creates tables for license management, device tracking, and session tokens

-- ============================================================================
-- LICENSES TABLE
-- Stores all license keys and their associated metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'demo',
    max_devices INTEGER NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '["trade-copying", "hedge-detection"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    -- Metadata
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_plan CHECK (plan IN ('demo', 'professional', 'enterprise')),
    CONSTRAINT valid_max_devices CHECK (max_devices > 0 AND max_devices <= 100)
);

-- Index for license key lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);

-- ============================================================================
-- DEVICES TABLE
-- Tracks all devices registered to each license
-- ============================================================================
CREATE TABLE IF NOT EXISTS license_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL DEFAULT 'unknown',
    account_id VARCHAR(100),
    broker VARCHAR(100),
    version VARCHAR(20),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_platform CHECK (platform IN ('mt4', 'mt5', 'ctrader', 'desktop', 'unknown')),
    CONSTRAINT unique_license_device UNIQUE (license_id, device_id)
);

-- Indexes for device lookups
CREATE INDEX IF NOT EXISTS idx_license_devices_license_id ON license_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_device_id ON license_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_last_seen ON license_devices(last_seen_at);

-- ============================================================================
-- SESSIONS TABLE
-- Tracks active session tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS license_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    status JSONB DEFAULT '{}'::jsonb
);

-- Indexes for session lookups
CREATE INDEX IF NOT EXISTS idx_license_sessions_token ON license_sessions(token);
CREATE INDEX IF NOT EXISTS idx_license_sessions_license_id ON license_sessions(license_id);
CREATE INDEX IF NOT EXISTS idx_license_sessions_expires ON license_sessions(expires_at);

-- ============================================================================
-- VALIDATION LOGS TABLE
-- Audit trail for all license validation attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS license_validation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key VARCHAR(64),
    device_id VARCHAR(255),
    platform VARCHAR(50),
    ip_address INET,
    success BOOLEAN NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    request_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_validation_logs_license_key ON license_validation_logs(license_key);
CREATE INDEX IF NOT EXISTS idx_validation_logs_created_at ON license_validation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_logs_success ON license_validation_logs(success);

-- ============================================================================
-- RATE LIMITING TABLE
-- Tracks requests per IP for rate limiting
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address INET PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to count active devices for a license
CREATE OR REPLACE FUNCTION count_active_devices(p_license_id UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER 
    FROM license_devices 
    WHERE license_id = p_license_id 
    AND is_active = TRUE;
$$ LANGUAGE SQL STABLE;

-- Function to clean up expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM license_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update rate limit window
CREATE OR REPLACE FUNCTION check_rate_limit(p_ip_address INET, p_max_requests INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    window_start_time TIMESTAMPTZ;
BEGIN
    -- Get current rate limit record
    SELECT request_count, window_start INTO current_count, window_start_time
    FROM rate_limits
    WHERE ip_address = p_ip_address;
    
    IF NOT FOUND THEN
        -- First request from this IP
        INSERT INTO rate_limits (ip_address, request_count, window_start)
        VALUES (p_ip_address, 1, NOW());
        RETURN TRUE;
    END IF;
    
    -- Check if window has expired
    IF window_start_time + (p_window_seconds || ' seconds')::INTERVAL < NOW() THEN
        -- Reset window
        UPDATE rate_limits 
        SET request_count = 1, window_start = NOW()
        WHERE ip_address = p_ip_address;
        RETURN TRUE;
    END IF;
    
    -- Check if limit exceeded
    IF current_count >= p_max_requests THEN
        RETURN FALSE;
    END IF;
    
    -- Increment counter
    UPDATE rate_limits 
    SET request_count = request_count + 1
    WHERE ip_address = p_ip_address;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_licenses_updated_at
    BEFORE UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_validation_logs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API server)
CREATE POLICY "Service role full access to licenses"
    ON licenses FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to devices"
    ON license_devices FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to sessions"
    ON license_sessions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to logs"
    ON license_validation_logs FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- NOTE: Test seed data has been removed. Add real licenses via the admin API.
-- ============================================================================

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE licenses IS 'Master table for all license keys';
COMMENT ON TABLE license_devices IS 'Tracks devices registered to each license';
COMMENT ON TABLE license_sessions IS 'Active session tokens for authenticated devices';
COMMENT ON TABLE license_validation_logs IS 'Audit trail for all validation attempts';
COMMENT ON TABLE rate_limits IS 'IP-based rate limiting tracking';
