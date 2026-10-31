CREATE TABLE IF NOT EXISTS public_enrollments (
  user_id integer PRIMARY KEY REFERENCES booking_users(id) ON DELETE CASCADE,
  group_id integer REFERENCES agency_groups(id),
  approved_at timestamptz,
  approved_by integer,
  notification_status text NOT NULL DEFAULT 'pending',
  notification_error text,
  activation_status text NOT NULL DEFAULT 'pending',
  activation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_enrollment_approval_group CHECK (approved_at IS NULL OR group_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS public_enrollments_pending_idx ON public_enrollments(created_at) WHERE approved_at IS NULL;