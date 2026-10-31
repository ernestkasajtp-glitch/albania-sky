-- Do not choose or delete an order when repairing an existing database. An
-- operator must review these deterministic groups before the invariant can be
-- installed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = 'pok_orders_one_active_booking_uniq'
      AND NOT (
        i.indisunique AND i.indisvalid AND i.indnkeyatts = 1
        AND pg_get_indexdef(c.oid) ILIKE '%booking_id%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%status%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%creating%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%unknown%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%created%'
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%pending%'
      )
  ) THEN
    RAISE EXCEPTION 'pok_orders_one_active_booking_uniq exists but has the wrong columns, uniqueness, validity, or predicate';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE duplicate_groups bigint;
BEGIN
  SELECT count(*) INTO duplicate_groups
  FROM (
    SELECT booking_id
    FROM pok_orders
    WHERE status IN ('creating', 'unknown', 'created', 'pending')
    GROUP BY booking_id
    HAVING count(*) > 1
    ORDER BY booking_id
  ) duplicates;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Cannot create pok_orders_one_active_booking_uniq: %s booking groups have multiple active intents', duplicate_groups),
      DETAIL = 'Run SELECT booking_id, array_agg(id ORDER BY id) AS order_ids, array_agg(status ORDER BY id) AS statuses FROM pok_orders WHERE status IN (''creating'', ''unknown'', ''created'', ''pending'') GROUP BY booking_id HAVING count(*) > 1 ORDER BY booking_id;',
      HINT = 'Reconcile each provider order explicitly, then mark only the reviewed rows failed/paid; this migration never deletes financial or provider-order rows.';
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
    WHERE i.indrelid = 'pok_orders'::regclass
      AND i.indisunique AND i.indisvalid AND i.indnkeyatts = 1
      AND pg_get_indexdef(c.oid) ILIKE '%booking_id%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%status%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%creating%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%unknown%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%created%'
      AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%pending%'
  ) INTO equivalent_index;
  IF NOT equivalent_index THEN
    EXECUTE 'CREATE UNIQUE INDEX "pok_orders_one_active_booking_uniq" ON "pok_orders" ("booking_id") WHERE "status" IN (''creating'', ''unknown'', ''created'', ''pending'')';
  END IF;
END $$;