CREATE TABLE IF NOT EXISTS "kyte_sandbox_booking_attempts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_user_id" integer NOT NULL,
  "offer_id" text NOT NULL,
  "transaction_id" uuid NOT NULL,
  "currency_code" text NOT NULL,
  "currency_decimals" integer NOT NULL,
  "offer_price_minor" numeric(18, 0) NOT NULL,
  "status" text DEFAULT 'creating' NOT NULL,
  "provider_booking_id" text,
  "provider_status" text,
  "provider_total_cost" numeric(18, 4),
  "provider_current_balance" numeric(18, 4),
  "provider_currency" text,
  "ticket_time_limit" timestamp with time zone,
  "safe_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kyte_sandbox_booking_status_check"
    CHECK ("status" IN ('creating', 'created', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kyte_sandbox_booking_intent_uniq"
  ON "kyte_sandbox_booking_attempts" USING btree ("transaction_id", "offer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kyte_sandbox_provider_booking_uniq"
  ON "kyte_sandbox_booking_attempts" USING btree ("provider_booking_id")
  WHERE "provider_booking_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyte_sandbox_booking_created_idx"
  ON "kyte_sandbox_booking_attempts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyte_sandbox_booking_status_idx"
  ON "kyte_sandbox_booking_attempts" USING btree ("status", "created_at");