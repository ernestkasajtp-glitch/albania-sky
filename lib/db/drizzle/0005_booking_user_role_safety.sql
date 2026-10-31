CREATE TABLE IF NOT EXISTS "booking_user_role_change_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "target_user_id" integer NOT NULL,
  "actor_user_id" integer,
  "actor_name" text DEFAULT 'System' NOT NULL,
  "actor_role" text,
  "old_role" text NOT NULL,
  "new_role" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_user_role_logs_target_created_idx"
  ON "booking_user_role_change_logs" USING btree ("target_user_id", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_and_audit_booking_user_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_admins integer;
  audit_actor_id integer;
BEGIN
  -- Lock one transaction-wide key so concurrent demotions/deletions cannot
  -- both observe another administrator and leave the system with none.
  PERFORM pg_advisory_xact_lock(707001);

  IF TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') THEN
      SELECT count(*) INTO remaining_admins
      FROM booking_users
      WHERE role = 'admin' AND id <> OLD.id;

      IF remaining_admins = 0 THEN
        RAISE EXCEPTION 'Administratori i fundit nuk mund të fshihet ose t''i ndryshohet roli'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    BEGIN
      audit_actor_id := nullif(current_setting('app.actor_user_id', true), '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      audit_actor_id := NULL;
    END;

    INSERT INTO booking_user_role_change_logs (
      target_user_id,
      actor_user_id,
      actor_name,
      actor_role,
      old_role,
      new_role,
      source
    ) VALUES (
      OLD.id,
      audit_actor_id,
      coalesce(nullif(current_setting('app.actor_name', true), ''), 'System'),
      nullif(current_setting('app.actor_role', true), ''),
      OLD.role,
      NEW.role,
      coalesce(nullif(current_setting('app.role_change_source', true), ''), 'database')
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_users_role_safety ON booking_users;
--> statement-breakpoint
CREATE TRIGGER booking_users_role_safety
BEFORE UPDATE OF role OR DELETE ON booking_users
FOR EACH ROW
EXECUTE FUNCTION protect_and_audit_booking_user_role();