CREATE TABLE IF NOT EXISTS "booking_splits" (
        "id" serial PRIMARY KEY NOT NULL,
        "booking_id" integer NOT NULL,
        "split_index" integer NOT NULL,
        "pnr" text,
        "net_price" numeric(10, 2),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "source" text DEFAULT 'external' NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "booking_id" integer,
        "booking_ref" text,
        "raw_payload" text NOT NULL,
        "error_message" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
        "sid" text PRIMARY KEY NOT NULL,
        "sess" text NOT NULL,
        "expired_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "destinations" (
        "id" serial PRIMARY KEY NOT NULL,
        "itinerary" text NOT NULL,
        "display_name" text NOT NULL,
        "price_mode" text DEFAULT 'auto' NOT NULL,
        "manual_date" date,
        "photo_url" text,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_flight_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "agent_id" integer NOT NULL,
        "type" text DEFAULT 'exclude' NOT NULL,
        "flight_id" integer,
        "route" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flights" ADD COLUMN IF NOT EXISTS "show_in_booking_engine" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "discount_type" text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "discount_fixed" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "booking_user_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "passengers" ADD COLUMN IF NOT EXISTS "ticket_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "passengers" ADD COLUMN IF NOT EXISTS "split_group" integer;--> statement-breakpoint
ALTER TABLE "price_change_requests" ADD COLUMN IF NOT EXISTS "split_index" integer;--> statement-breakpoint
ALTER TABLE "group_ticket_sales" ADD COLUMN IF NOT EXISTS "departure_airport" text;--> statement-breakpoint
ALTER TABLE "group_ticket_sales" ADD COLUMN IF NOT EXISTS "arrival_airport" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'booking_splits_booking_id_bookings_id_fk'
  ) THEN
    ALTER TABLE "booking_splits" ADD CONSTRAINT "booking_splits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_flight_rules_agent_id_agents_id_fk'
  ) THEN
    ALTER TABLE "agent_flight_rules" ADD CONSTRAINT "agent_flight_rules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_flight_rules_flight_id_flights_id_fk'
  ) THEN
    ALTER TABLE "agent_flight_rules" ADD CONSTRAINT "agent_flight_rules_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
