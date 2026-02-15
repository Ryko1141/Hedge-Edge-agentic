-- ============================================================================
-- Trade Copier Notification Preferences & Activity Log
-- ============================================================================

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Email notifications
  email_enabled BOOLEAN DEFAULT true,
  email_address TEXT, -- override profile email if desired
  
  -- Notification triggers
  notify_on_copy_success BOOLEAN DEFAULT false,
  notify_on_copy_failure BOOLEAN DEFAULT true,
  notify_on_protection_triggered BOOLEAN DEFAULT true,
  notify_on_circuit_breaker BOOLEAN DEFAULT true,
  notify_on_daily_summary BOOLEAN DEFAULT true,
  
  -- Throttling
  min_interval_seconds INTEGER DEFAULT 60, -- min seconds between emails
  daily_summary_hour INTEGER DEFAULT 17,   -- hour (UTC) for daily summary
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Copier activity log (persisted for history / email digests)
CREATE TABLE IF NOT EXISTS copier_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  follower_id TEXT NOT NULL,
  
  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'close', 'modify', 'error', 'protection-triggered')),
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  volume NUMERIC(12,4) NOT NULL DEFAULT 0,
  price NUMERIC(16,6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  
  -- Metadata
  leader_ticket BIGINT,
  follower_ticket BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_copier_activity_user_time ON copier_activity_log(user_id, created_at DESC);
CREATE INDEX idx_copier_activity_group ON copier_activity_log(group_id, created_at DESC);
CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

-- Email send log (for throttling)
CREATE TABLE IF NOT EXISTS notification_send_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_send_user_time ON notification_send_log(user_id, sent_at DESC);

-- RLS Policies
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE copier_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_send_log ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own notification preferences
CREATE POLICY "Users manage own notification prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Users can only read/insert their own activity log
CREATE POLICY "Users read own copier activity" ON copier_activity_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own copier activity" ON copier_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can read send log for throttling
CREATE POLICY "Users read own send log" ON notification_send_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service inserts send log" ON notification_send_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger for notification_preferences
CREATE OR REPLACE FUNCTION update_notification_prefs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_prefs_timestamp
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_prefs_timestamp();
