ALTER TABLE "agency_group_rules"
  ADD COLUMN "date_from" date,
  ADD COLUMN "date_to" date;
--> statement-breakpoint
ALTER TABLE "agency_group_rules"
  ADD CONSTRAINT "agency_group_rules_dates_check"
  CHECK (("date_from" IS NULL AND "date_to" IS NULL)
    OR ("date_from" IS NOT NULL AND "date_to" IS NOT NULL AND "date_from" <= "date_to"));
--> statement-breakpoint
DROP INDEX "agency_group_rules_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "agency_group_rules_unique" ON "agency_group_rules"
  ("group_id", "airport", "direction", coalesce("date_from", '-infinity'::date), coalesce("date_to", 'infinity'::date));