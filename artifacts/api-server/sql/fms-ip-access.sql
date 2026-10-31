-- Apply to the existing development and external VPS PostgreSQL databases
-- before starting an API build that uses these tables. No existing data is deleted.
CREATE TABLE IF NOT EXISTS fms_login_attempts (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'failed', 'blocked', 'verified')),
  user_id integer,
  source_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fms_login_attempts_ip_created_idx ON fms_login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS fms_login_attempts_created_idx ON fms_login_attempts (created_at);
ALTER TABLE fms_login_attempts ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE fms_login_attempts DROP CONSTRAINT IF EXISTS fms_login_attempts_result_check;
ALTER TABLE fms_login_attempts ADD CONSTRAINT fms_login_attempts_result_check
  CHECK (result IN ('success', 'failed', 'blocked', 'verified'));

CREATE TABLE IF NOT EXISTS fms_ip_blocks (
  ip text PRIMARY KEY,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  blocked_by integer NOT NULL,
  access_generation text NOT NULL DEFAULT ''
);
ALTER TABLE fms_ip_blocks ADD COLUMN IF NOT EXISTS access_generation text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS fms_ip_block_events (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  action text NOT NULL CHECK (action IN ('block', 'unblock')),
  actor_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fms_ip_sessions (
  sid text PRIMARY KEY,
  ip text NOT NULL,
  user_id integer NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fms_ip_sessions_ip_seen_idx ON fms_ip_sessions (ip, last_seen);

-- These names are informational only; browser IDs never authorize access.
CREATE TABLE IF NOT EXISTS fms_ip_labels (
  ip text PRIMARY KEY,
  label text NOT NULL
);
CREATE TABLE IF NOT EXISTS fms_devices (
  device_id text PRIMARY KEY,
  label text,
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fms_device_ips (
  device_id text NOT NULL REFERENCES fms_devices(device_id) ON DELETE CASCADE,
  ip text NOT NULL,
  login_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, ip)
);
CREATE INDEX IF NOT EXISTS fms_device_ips_ip_seen_idx ON fms_device_ips (ip, last_seen_at DESC);

-- A blocked IP stays blocked. These one-time challenges authorize only the
-- password-verified FMS session from the same trusted IP.
CREATE TABLE IF NOT EXISTS fms_ip_access_codes (
  id text PRIMARY KEY,
  ip text NOT NULL,
  user_id integer NOT NULL,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fms_ip_access_codes_user_created_idx ON fms_ip_access_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fms_ip_access_codes_ip_created_idx ON fms_ip_access_codes (ip, created_at DESC);

CREATE TABLE IF NOT EXISTS fms_ip_block_alert_emails (
  ip text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fms_ip_block_alert_sent_idx ON fms_ip_block_alert_emails (last_sent_at);

DO $$
BEGIN
  -- The external VPS database has this runtime role; Replit development does not.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kingsuser') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON fms_login_attempts, fms_ip_blocks, fms_ip_block_events, fms_ip_sessions TO kingsuser';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON fms_ip_labels, fms_devices, fms_device_ips TO kingsuser';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON fms_ip_access_codes, fms_ip_block_alert_emails TO kingsuser';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE fms_login_attempts_id_seq, fms_ip_block_events_id_seq TO kingsuser';
  END IF;
END $$;