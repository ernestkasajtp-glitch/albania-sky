CREATE TABLE IF NOT EXISTS "pok_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "merchant_id" text NOT NULL,
  "key_id" text NOT NULL,
  "key_secret_encrypted" text NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pok_accounts_merchant_key_uniq" ON "pok_accounts" ("merchant_id", "key_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pok_accounts_single_active_uniq" ON "pok_accounts" ("active") WHERE "active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pok_accounts_active" ON "pok_accounts" ("active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pok_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE cascade,
  "account_id" integer NOT NULL REFERENCES "pok_accounts"("id") ON DELETE restrict,
  "provider_order_id" text,
  "confirm_url" text,
  "amount" numeric(10, 2) NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pok_orders_provider_order_uniq" ON "pok_orders" ("provider_order_id");
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pok_orders_booking_status" ON "pok_orders" ("booking_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pok_orders_account" ON "pok_orders" ("account_id");