-- Performance indexes, applied on EVERY container start by
-- scripts/bootstrap-empty-db.mjs (also on databases that already have data).
-- Every statement must stay idempotent (IF NOT EXISTS). The same indexes are
-- declared in the Drizzle schema so a fresh `drizzle-kit push` creates them too
-- and never proposes dropping them.
--
-- They cover foreign keys / filters that the API queries per booking, flight,
-- payment, agent or group, so these lookups stay fast as the tables grow.
CREATE INDEX IF NOT EXISTS idx_agent_flight_rules_agent_id ON agent_flight_rules (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_flight_rules_flight_id ON agent_flight_rules (flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_price_history_flight_id ON flight_price_history (flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_seat_history_flight_id ON flight_seat_history (flight_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_flight_notes_flight_id ON flight_notes (flight_id);
CREATE INDEX IF NOT EXISTS idx_price_change_requests_booking_id ON price_change_requests (booking_id);
CREATE INDEX IF NOT EXISTS idx_price_request_messages_request_id ON price_request_messages (request_id);
CREATE INDEX IF NOT EXISTS idx_payment_change_logs_payment_id ON payment_change_logs (payment_id);
CREATE INDEX IF NOT EXISTS idx_booking_change_logs_booking_id ON booking_change_logs (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_comments_booking_id ON booking_comments (booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expired_at ON sessions (expired_at);
CREATE INDEX IF NOT EXISTS idx_agent_credit_tx_agent_created ON agent_credit_transactions (agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_credit_tx_booking_id ON agent_credit_transactions (booking_id);
CREATE INDEX IF NOT EXISTS idx_group_ticket_sales_group_id ON group_ticket_sales (group_ticket_id);
CREATE INDEX IF NOT EXISTS idx_group_ticket_sales_passenger_id ON group_ticket_sales (booking_passenger_id);
CREATE INDEX IF NOT EXISTS idx_group_ticket_alternatives_group_id ON group_ticket_alternatives (group_ticket_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_user_id ON bookings (booking_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_flight_visibility_flight_id ON agent_flight_visibility (flight_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_task_id ON task_notifications (task_id);
-- Table created by deploy/migrations/flight-low-seat-tasks.sql (not in Drizzle).
DO $$ BEGIN
  IF to_regclass('public.flight_low_seat_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_flight_low_seat_events_flight_id ON flight_low_seat_events (flight_id);
  END IF;
END $$;
