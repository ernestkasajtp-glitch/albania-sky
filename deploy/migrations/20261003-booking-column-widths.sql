ALTER TABLE booking_column_preferences
  ADD COLUMN IF NOT EXISTS column_widths jsonb NOT NULL DEFAULT '{}'::jsonb;