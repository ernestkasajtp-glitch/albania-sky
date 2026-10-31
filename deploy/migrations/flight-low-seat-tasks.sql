BEGIN;
-- Durable crossings, not a periodic snapshot: captures every writer and rollback.
CREATE TABLE IF NOT EXISTS flight_low_seat_events (
  id bigserial PRIMARY KEY,
  flight_id integer NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  before_available integer NOT NULL,
  after_available integer NOT NULL,
  cause text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  task_id integer
);
CREATE INDEX IF NOT EXISTS flight_low_seat_events_pending
  ON flight_low_seat_events(id) WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION capture_flight_low_seat_crossing()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.total_seats - OLD.sold_seats > 10
     AND NEW.total_seats - NEW.sold_seats <= 10 THEN
    INSERT INTO flight_low_seat_events(flight_id, before_available, after_available, cause)
    VALUES (
      NEW.id, OLD.total_seats - OLD.sold_seats, NEW.total_seats - NEW.sold_seats,
      CASE WHEN NEW.total_seats < OLD.total_seats AND NEW.sold_seats > OLD.sold_seats THEN 'sale_and_reduction'
           WHEN NEW.total_seats < OLD.total_seats THEN 'reduction' ELSE 'sale' END
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS flight_low_seat_crossing ON flights;
CREATE TRIGGER flight_low_seat_crossing
  AFTER UPDATE OF total_seats, sold_seats ON flights
  FOR EACH ROW EXECUTE FUNCTION capture_flight_low_seat_crossing();

-- The existing application role owns/has access to flights; grant matching writers.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = current_schema() AND table_name = 'flights'
      AND privilege_type = 'UPDATE' AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON flight_low_seat_events TO %I', r.grantee);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE flight_low_seat_events_id_seq TO %I', r.grantee);
  END LOOP;
END $$;
COMMIT;
