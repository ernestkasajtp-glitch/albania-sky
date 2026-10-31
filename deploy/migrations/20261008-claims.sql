-- Additive only: does not modify bookings, passengers, payments or partner API data.
BEGIN;
CREATE TABLE IF NOT EXISTS claims (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  creator_id integer REFERENCES booking_users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS claims_request_id_unique ON claims(request_id);
CREATE INDEX IF NOT EXISTS claims_created_at_idx ON claims(created_at);
CREATE TABLE IF NOT EXISTS claim_bookings (
  claim_id integer NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY(claim_id, booking_id)
);
CREATE INDEX IF NOT EXISTS claim_bookings_booking_idx ON claim_bookings(booking_id);
-- Grant to the same application role(s) that own bookings (migration runs as postgres).
DO $$
DECLARE app_role text;
BEGIN
  FOR app_role IN
    SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'bookings'::regclass
    UNION
    SELECT grantee FROM information_schema.table_privileges
      WHERE table_schema = current_schema() AND table_name = 'bookings' AND grantee <> 'PUBLIC'
      GROUP BY grantee HAVING bool_or(privilege_type = 'SELECT') AND bool_or(privilege_type = 'INSERT')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON claims, claim_bookings TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE claims_id_seq TO %I', app_role);
  END LOOP;
END $$;
COMMIT;
