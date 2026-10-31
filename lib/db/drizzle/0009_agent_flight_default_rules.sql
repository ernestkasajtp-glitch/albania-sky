CREATE TABLE IF NOT EXISTS "agent_flight_default_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "from_airport" text,
  "to_airport" text,
  "date_from" date,
  "date_to" date,
  "flight_id" integer REFERENCES "flights"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_flight_default_shape" CHECK (
    ("flight_id" IS NOT NULL AND "from_airport" IS NULL AND "to_airport" IS NULL AND "date_from" IS NULL AND "date_to" IS NULL)
    OR ("flight_id" IS NULL AND ("from_airport" IS NOT NULL OR "to_airport" IS NOT NULL)
        AND "date_from" IS NOT NULL AND "date_to" IS NOT NULL AND "date_from" <= "date_to")
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_flight_default_route_uniq"
  ON "agent_flight_default_rules" (coalesce("from_airport", ''), coalesce("to_airport", ''), "date_from", "date_to")
  WHERE "flight_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_flight_default_flight_uniq"
  ON "agent_flight_default_rules" ("flight_id")
  WHERE "flight_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_flight_default_exclusions" (
  "agent_id" integer PRIMARY KEY REFERENCES "agents"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);