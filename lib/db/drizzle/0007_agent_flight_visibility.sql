CREATE TABLE IF NOT EXISTS "agent_flight_visibility" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "from_airport" text,
  "to_airport" text,
  "date_from" date,
  "date_to" date,
  "flight_id" integer REFERENCES "flights"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_flight_visibility_shape" CHECK (
    ("flight_id" IS NOT NULL AND "from_airport" IS NULL AND "to_airport" IS NULL AND "date_from" IS NULL AND "date_to" IS NULL)
    OR ("flight_id" IS NULL AND "from_airport" IS NOT NULL AND "to_airport" IS NOT NULL AND "date_from" IS NOT NULL AND "date_to" IS NOT NULL AND "date_from" <= "date_to")
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_flight_visibility_agent_idx" ON "agent_flight_visibility" ("agent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_flight_visibility_route_uniq"
  ON "agent_flight_visibility" ("agent_id", "from_airport", "to_airport", "date_from", "date_to")
  WHERE "flight_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_flight_visibility_flight_uniq"
  ON "agent_flight_visibility" ("agent_id", "flight_id")
  WHERE "flight_id" IS NOT NULL;