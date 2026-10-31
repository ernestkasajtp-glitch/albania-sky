-- If applied as postgres, grant SELECT/INSERT/UPDATE/DELETE on this table to
-- the existing application database role before deploying the API bundle.
CREATE TABLE IF NOT EXISTS booking_column_preferences (
  user_id integer PRIMARY KEY REFERENCES booking_users(id) ON DELETE CASCADE,
  visible_columns text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);