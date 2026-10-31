ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ticket_email_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_email_sent_at timestamptz;