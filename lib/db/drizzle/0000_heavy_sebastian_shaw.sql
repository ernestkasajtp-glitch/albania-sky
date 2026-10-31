CREATE TABLE "flights" (
	"id" serial PRIMARY KEY NOT NULL,
	"airline" text NOT NULL,
	"flight_number" text NOT NULL,
	"from_city" text NOT NULL,
	"to_city" text NOT NULL,
	"departure_date" text NOT NULL,
	"departure_time" text NOT NULL,
	"arrival_date" text NOT NULL,
	"arrival_time" text NOT NULL,
	"adult_price" numeric(10, 2) NOT NULL,
	"child_price" numeric(10, 2) NOT NULL,
	"infant_price" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_seats" integer NOT NULL,
	"sold_seats" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"cabin_baggage_kg" numeric(5, 1),
	"checked_baggage_count" integer,
	"checked_baggage_kg" numeric(5, 1),
	"checked_baggage_price" numeric(10, 2),
	"seat_selection_price" numeric(10, 2),
	"priority_boarding_price" numeric(10, 2),
	"insurance_price" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"booking_id" integer,
	"booking_ref" text,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"commission" numeric(5, 2) DEFAULT '0' NOT NULL,
	"markup" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "booking_extras" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_ref" text NOT NULL,
	"flight_id" integer NOT NULL,
	"agent_id" integer,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"markup" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"pnr" text,
	"net_price" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_ref_unique" UNIQUE("booking_ref")
);
--> statement-breakpoint
CREATE TABLE "passengers" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"type" text DEFAULT 'adult' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text,
	"nationality" text,
	"passport_number" text,
	"passport_expiry" text,
	"seat_number" text,
	"baggage_option" text,
	"has_seat_selection" boolean DEFAULT false NOT NULL,
	"has_priority_boarding" boolean DEFAULT false NOT NULL,
	"has_insurance" boolean DEFAULT false NOT NULL,
	"extra_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"reference" text,
	"notes" text,
	"is_refund" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"phone" text,
	"role" text DEFAULT 'client' NOT NULL,
	"agent_id" integer,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"booking_ref" text NOT NULL,
	"requested_by" integer NOT NULL,
	"requested_by_name" text NOT NULL,
	"current_amount" numeric(10, 2) NOT NULL,
	"suggested_amount" numeric(10, 2) NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"review_note" text,
	"request_type" text DEFAULT 'sell' NOT NULL,
	"unread_by_manager" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_request_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_name" text DEFAULT 'FMS Pro' NOT NULL,
	"tagline" text DEFAULT 'Kings Travel · Panel i Administrimit' NOT NULL,
	"logo_base64" text,
	"background_base64" text,
	"primary_color" text DEFAULT '#3b82f6' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT 'System' NOT NULL,
	"user_role" text,
	"action" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"permission" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_ticket_alternatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_ticket_id" integer NOT NULL,
	"destination" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_ticket_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_ticket_id" integer NOT NULL,
	"pnr_new" text,
	"seats_sold" integer DEFAULT 1 NOT NULL,
	"passenger_name" text,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"confirmed_date" text,
	"shitur_date" text,
	"operator_name" text,
	"price" numeric(10, 2),
	"payment_status" text,
	"commission" numeric(10, 2),
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"pnr_original" text NOT NULL,
	"departure" text NOT NULL,
	"destination" text NOT NULL,
	"flight_date" text NOT NULL,
	"flight_time" text,
	"return_info" text,
	"total_seats" integer DEFAULT 0 NOT NULL,
	"price_per_seat" numeric(10, 2),
	"color" text DEFAULT 'ORANGE' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"airline" text,
	"date_flex_back" integer DEFAULT 14 NOT NULL,
	"date_flex_forward" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"options" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_credit_transactions" ADD CONSTRAINT "agent_credit_transactions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_extras" ADD CONSTRAINT "booking_extras_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_requests" ADD CONSTRAINT "price_change_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_request_messages" ADD CONSTRAINT "price_request_messages_request_id_price_change_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."price_change_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_change_logs" ADD CONSTRAINT "booking_change_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_booking_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."booking_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ticket_alternatives" ADD CONSTRAINT "group_ticket_alternatives_group_ticket_id_group_tickets_id_fk" FOREIGN KEY ("group_ticket_id") REFERENCES "public"."group_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_ticket_sales" ADD CONSTRAINT "group_ticket_sales_group_ticket_id_group_tickets_id_fk" FOREIGN KEY ("group_ticket_id") REFERENCES "public"."group_tickets"("id") ON DELETE cascade ON UPDATE no action;