-- Financial rows are never deleted or rewritten by this migration.  Refuse to
-- proceed until an operator has reviewed every duplicate external card
-- reference; the query in the error is deterministic and read-only.
DO $$
DECLARE
  duplicate_groups bigint;
BEGIN
  SELECT count(*) INTO duplicate_groups
  FROM (
    SELECT booking_id, reference
    FROM payments
    WHERE method = 'card' AND reference IS NOT NULL
    GROUP BY booking_id, reference
    HAVING count(*) > 1
    ORDER BY booking_id, reference
  ) duplicates;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Cannot create payments_booking_card_ref_uniq: %s duplicate groups require read-only financial review', duplicate_groups),
      DETAIL = 'Run SELECT booking_id, reference, array_agg(id ORDER BY id) AS payment_ids, sum(amount) AS total FROM payments WHERE method = ''card'' AND reference IS NOT NULL GROUP BY booking_id, reference HAVING count(*) > 1 ORDER BY booking_id, reference;',
      HINT = 'Resolve duplicates with an approved accounting reconciliation; this migration intentionally does not delete or mutate payment rows.';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = 'payments_booking_card_ref_uniq'
      AND NOT (
        i.indisunique AND i.indisvalid AND i.indnkeyatts = 2
        AND pg_get_indexdef(c.oid) ILIKE '%booking_id%reference%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%reference%IS NOT NULL%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%method%card%'
      )
  ) THEN
    RAISE EXCEPTION 'payments_booking_card_ref_uniq exists but is not unique; rename/review it before applying this migration';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE equivalent_index boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE i.indrelid = 'payments'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indnkeyatts = 2
      AND pg_get_indexdef(c.oid) ILIKE '%booking_id%reference%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%reference%IS NOT NULL%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%method%card%'
  ) INTO equivalent_index;
  IF NOT equivalent_index THEN
    EXECUTE 'CREATE UNIQUE INDEX "payments_booking_card_ref_uniq" ON "payments" ("booking_id", "reference") WHERE "reference" IS NOT NULL AND "method" = ''card''';
  END IF;
END $$;