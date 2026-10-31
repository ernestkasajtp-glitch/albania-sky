CREATE TABLE IF NOT EXISTS "agency_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agency_group_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL REFERENCES "agency_groups"("id") ON DELETE CASCADE,
  "airport" text NOT NULL,
  "direction" text NOT NULL,
  CONSTRAINT "agency_group_rules_airport_check" CHECK ("airport" ~ '^[A-Z]{3}$'),
  CONSTRAINT "agency_group_rules_direction_check" CHECK ("direction" IN ('either', 'from', 'to'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agency_group_rules_unique" ON "agency_group_rules" ("group_id", "airport", "direction");
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "group_id" integer REFERENCES "agency_groups"("id") ON DELETE RESTRICT;
--> statement-breakpoint
INSERT INTO "agency_groups" ("name") VALUES ('Shqipëri') ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "agency_group_rules" ("group_id", "airport", "direction")
SELECT "id", 'TIA', 'either' FROM "agency_groups" WHERE "name" = 'Shqipëri'
ON CONFLICT ("group_id", "airport", "direction") DO NOTHING;