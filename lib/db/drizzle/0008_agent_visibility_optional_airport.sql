ALTER TABLE "agent_flight_visibility" DROP CONSTRAINT "agent_flight_visibility_shape";
--> statement-breakpoint
ALTER TABLE "agent_flight_visibility" ADD CONSTRAINT "agent_flight_visibility_shape" CHECK (
  ("flight_id" IS NOT NULL AND "from_airport" IS NULL AND "to_airport" IS NULL AND "date_from" IS NULL AND "date_to" IS NULL)
  OR ("flight_id" IS NULL AND ("from_airport" IS NOT NULL OR "to_airport" IS NOT NULL)
      AND "date_from" IS NOT NULL AND "date_to" IS NOT NULL AND "date_from" <= "date_to")
);
--> statement-breakpoint
DROP INDEX "agent_flight_visibility_route_uniq";
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_flight_visibility_route_uniq"
  ON "agent_flight_visibility" ("agent_id", coalesce("from_airport", ''), coalesce("to_airport", ''), "date_from", "date_to")
  WHERE "flight_id" IS NULL;