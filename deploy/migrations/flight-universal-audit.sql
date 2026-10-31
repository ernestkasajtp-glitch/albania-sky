BEGIN;
CREATE TABLE IF NOT EXISTS flight_activity_audit (
  id bigserial PRIMARY KEY,
  flight_id integer NOT NULL,
  entity_table text NOT NULL,
  entity_id text,
  operation text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]',
  reference text,
  user_id integer,
  user_name text,
  user_role text,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS flight_activity_audit_flight_time
  ON flight_activity_audit(flight_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS flight_activity_audit_entity
  ON flight_activity_audit(entity_table, entity_id, id DESC);
CREATE TABLE IF NOT EXISTS flight_activity_audit_config (
  key text PRIMARY KEY, activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO flight_activity_audit_config(key) VALUES ('activated') ON CONFLICT DO NOTHING;

-- Resolve ownership BEFORE deletes/cascades, and capture both flights on moves.
CREATE OR REPLACE FUNCTION flight_audit_owners(t text, r jsonb)
RETURNS integer[] LANGUAGE plpgsql STABLE AS $$
DECLARE ids integer[]; b integer; task_row record;
BEGIN
  IF r IS NULL THEN RETURN '{}'; END IF;
  IF t = 'flights' THEN RETURN ARRAY[(r->>'id')::integer]; END IF;
  IF r ? 'flight_id' THEN RETURN ARRAY[(r->>'flight_id')::integer]; END IF;
  IF r ? 'booking_id' THEN
    SELECT flight_id INTO b FROM bookings WHERE id = (r->>'booking_id')::integer;
    IF b IS NULL THEN
      SELECT coalesce(c->>'new',c->>'old')::integer INTO b
      FROM flight_activity_audit a, jsonb_array_elements(a.changes) c
      WHERE a.entity_table='bookings' AND a.entity_id=r->>'booking_id'
        AND c->>'field'='flight_id'
      ORDER BY a.id DESC LIMIT 1;
    END IF;
    RETURN ARRAY[b];
  END IF;
  IF r ? 'payment_id' THEN
    SELECT b.flight_id INTO b FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.id=(r->>'payment_id')::integer;
    RETURN ARRAY[b];
  END IF;
  IF t = 'tasks' THEN
    IF r->>'entity_type' = 'flight' THEN RETURN ARRAY[(r->>'entity_id')::integer]; END IF;
    IF r->>'entity_type' = 'booking' THEN
      SELECT flight_id INTO b FROM bookings WHERE id = (r->>'entity_id')::integer;
      RETURN ARRAY[b];
    END IF;
    IF r->>'parent_id' IS NOT NULL THEN
      SELECT flight_audit_owners('tasks', to_jsonb(x)) INTO ids FROM tasks x WHERE id = (r->>'parent_id')::integer;
      RETURN coalesce(ids, '{}');
    END IF;
  END IF;
  IF r ? 'task_id' THEN
    SELECT flight_audit_owners('tasks', to_jsonb(x)) INTO ids FROM tasks x WHERE id = (r->>'task_id')::integer;
    RETURN coalesce(ids, '{}');
  END IF;
  IF t = 'claims' THEN
    SELECT array_agg(DISTINCT b.flight_id) INTO ids
      FROM claim_bookings c JOIN bookings b ON b.id = c.booking_id
      WHERE c.claim_id = (r->>'id')::integer;
    RETURN coalesce(ids, '{}');
  END IF;
  IF r ? 'claim_id' THEN
    SELECT array_agg(DISTINCT b.flight_id) INTO ids
      FROM claim_bookings c JOIN bookings b ON b.id = c.booking_id
      WHERE c.claim_id = (r->>'claim_id')::integer;
    RETURN coalesce(ids, '{}');
  END IF;
  IF t = 'agency_group_rules' THEN
    SELECT array_agg(id) INTO ids FROM flights f WHERE
      ((r->>'direction' IN ('either','from') AND upper(trim(f.from_city)) = r->>'airport')
       OR (r->>'direction' IN ('either','to') AND upper(trim(f.to_city)) = r->>'airport'))
      AND (r->>'date_from' IS NULL OR f.departure_date >= r->>'date_from')
      AND (r->>'date_to' IS NULL OR f.departure_date <= r->>'date_to');
    RETURN coalesce(ids, '{}');
  END IF;
  IF t = 'agency_groups' THEN
    SELECT array_agg(DISTINCT f.id) INTO ids FROM flights f
      JOIN agency_group_rules g ON g.group_id = (r->>'id')::integer
      AND ((g.direction IN ('either','from') AND upper(trim(f.from_city)) = g.airport)
        OR (g.direction IN ('either','to') AND upper(trim(f.to_city)) = g.airport))
      AND (g.date_from IS NULL OR f.departure_date >= g.date_from::text)
      AND (g.date_to IS NULL OR f.departure_date <= g.date_to::text);
    RETURN coalesce(ids, '{}');
  END IF;
  -- Flight-specific discounts live in settings, not a flights column.
  IF t = 'settings' AND r->>'key' ~ '^flightDiscount[.][0-9]+$' THEN
    RETURN ARRAY[substring(r->>'key' from '[0-9]+$')::integer];
  END IF;
  RETURN '{}';
END $$;

CREATE OR REPLACE FUNCTION capture_flight_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_row jsonb; new_row jsonb; k text; changes jsonb := '[]';
  owners integer[]; actor jsonb := '{}'; encoded text; ref text; entity text;
  -- Allowlist only: no credentials, contacts, passports, document URLs,
  -- provider payloads, signed links, or arbitrary row snapshots.
  fields text[] := ARRAY[
    'airline','flight_number','from_city','to_city','departure_date','departure_time',
    'arrival_date','arrival_time','adult_price','child_price','infant_price','citizen_price',
    'tax','total_seats','sold_seats','status','is_confirmed','net_price',
    'cabin_baggage_kg','checked_baggage_count','checked_baggage_kg','checked_baggage_price',
    'seat_selection_price','priority_boarding_price','insurance_price','sell_cutoff_hours',
    'show_in_booking_engine','exclude_from_google_rule','external_sales_blocked',
    'schedule_alert','seat_alert','alert_dismissed_at','flight_id','booking_ref','agent_id',
    'booking_id','booking_user_id','total_amount','paid_amount','markup','commission',
    'discount','pnr','source','notes','ticket_search_excluded','ticket_search_note',
    'ticket_email_pending','ticket_email_sent_at','amount','method','is_refund',
    'confirmed','confirm_note','invoice_code','first_name','last_name','type','price',
    'ticket_price','extras_total','checked_baggage','cabin_baggage','seat_selection',
    'priority_boarding','insurance','description','title','body','message','name',
    'priority','assignee_id','creator_id','due_date','completed_at','parent_id',
    'entity_type','entity_id','labels','watchers','auto_generated','auto_rule_key',
    'airport','direction','date_from','date_to','group_id','claim_id','event_type',
    'seats','old_total','user_id','user_name','user_role','author_name','author_role',
    'action','field_name','old_value','new_value','note','changes','old_adult_price',
    'new_adult_price','google_price','notification_closed_at','value','key',
    'customer_name','seat_number','baggage_option','has_seat_selection',
    'has_priority_boarding','has_insurance','extra_cost','split_group'
  ];
BEGIN
  IF TG_OP != 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP != 'DELETE' THEN new_row := to_jsonb(NEW); END IF;
  owners := flight_audit_owners(TG_TABLE_NAME, old_row) || flight_audit_owners(TG_TABLE_NAME, new_row);
  IF array_length(owners,1) IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  FOREACH k IN ARRAY fields LOOP
    -- Never store non-flight settings (which can contain secrets).
    IF TG_TABLE_NAME = 'settings' AND coalesce(new_row,old_row)->>'key' !~ '^flightDiscount[.][0-9]+$' THEN CONTINUE; END IF;
    IF (old_row->k) IS DISTINCT FROM (new_row->k) THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', k,
        'old', old_row->>k, 'new', new_row->>k));
    END IF;
  END LOOP;
  -- Record that protected/unrecognized business fields changed without copying
  -- their data. Routine timestamps are not user actions.
  FOR k IN SELECT jsonb_object_keys(coalesce(old_row,'{}') || coalesce(new_row,'{}')) LOOP
    IF NOT (k = ANY(fields)) AND k NOT IN ('id','created_at','updated_at','version')
      AND (old_row->k) IS DISTINCT FROM (new_row->k) THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field',k,
        'old',CASE WHEN old_row ? k THEN '[E mbrojtur]' END,
        'new',CASE WHEN new_row ? k THEN '[E mbrojtur]' END));
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND changes = '[]'::jsonb THEN RETURN NEW; END IF;
  encoded := substring(current_query() from '/\*fms_audit:([A-Za-z0-9+/=]+)\*/');
  IF encoded IS NOT NULL THEN
    BEGIN actor := convert_from(decode(encoded,'base64'),'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN actor := '{}'; END;
  END IF;
  entity := coalesce(new_row,old_row)->>'id';
  ref := coalesce(new_row,old_row)->>'booking_ref';
  IF ref IS NULL AND coalesce(new_row,old_row)->>'booking_id' IS NOT NULL THEN
    SELECT booking_ref INTO ref FROM bookings WHERE id = (coalesce(new_row,old_row)->>'booking_id')::integer;
  END IF;
  INSERT INTO flight_activity_audit(flight_id,entity_table,entity_id,operation,changes,reference,user_id,user_name,user_role,origin)
  SELECT DISTINCT x,TG_TABLE_NAME,entity,TG_OP,changes,ref,
    CASE WHEN actor->>'userId' ~ '^[0-9]+$' THEN (actor->>'userId')::integer END,
    coalesce(actor->>'userName',coalesce(new_row,old_row)->>'user_name',coalesce(new_row,old_row)->>'author_name'),
    coalesce(actor->>'userRole',coalesce(new_row,old_row)->>'user_role',coalesce(new_row,old_row)->>'author_role'),
    coalesce(actor->>'source','Proces serveri / DB — burimi i paregjistruar')
  FROM unnest(owners) x WHERE x IS NOT NULL;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Covers every current linked business table, including imports and workers.
-- Read-only partner /v1 endpoints execute no mutations and are untouched.
DO $$
DECLARE t record; r record;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (column_name IN ('flight_id','booking_id','payment_id','task_id','claim_id')
        OR table_name IN ('flights','tasks','claims','agency_groups','agency_group_rules','settings'))
      AND table_name NOT IN ('flight_activity_audit','flight_low_seat_events')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS universal_flight_activity ON %I', t.table_name);
    EXECUTE format('CREATE TRIGGER universal_flight_activity BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_flight_activity()', t.table_name);
  END LOOP;
  FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = current_schema() AND table_name = 'flights'
      AND privilege_type = 'UPDATE' AND grantee <> 'PUBLIC'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON flight_activity_audit TO %I',r.grantee);
    EXECUTE format('GRANT SELECT ON flight_activity_audit_config TO %I',r.grantee);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE flight_activity_audit_id_seq TO %I',r.grantee);
  END LOOP;
END $$;
COMMIT;
