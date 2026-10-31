BEGIN;
ALTER TABLE pok_orders ADD COLUMN IF NOT EXISTS notification_closed_at timestamptz;
COMMIT;
