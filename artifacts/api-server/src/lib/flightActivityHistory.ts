import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function readFlightActivity(flightId: number, offset: number, client = db) {
  // Indexed new audit stream + existing evidence, not invented backfills.
  const result = await client.execute(sql`
    WITH events AS (
      SELECT 'audit-'||id AS id,entity_table AS entity,operation,changes,reference,
        user_name,user_role,origin,created_at FROM flight_activity_audit WHERE flight_id=${flightId}
      UNION ALL
      SELECT 'legacy-'||id,'flights',source,changes,note,user_name,user_role,
        'Historiku i ruajtur — '||source,created_at FROM flight_change_history
        WHERE flight_id=${flightId} AND created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'seat-'||id,'flight_seat_history',event_type,
        jsonb_build_array(jsonb_build_object('field','total_seats','old',old_total,'new',total_seats),
          jsonb_build_object('field','sold_seats','old',null,'new',sold_seats)),note,user_name,user_role,
        'Historiku i vendeve',created_at FROM flight_seat_history
        WHERE flight_id=${flightId} AND created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'price-'||id,'flight_price_history','price',
        jsonb_build_array(jsonb_build_object('field','adult_price','old',old_adult_price,'new',new_adult_price)),
        null,user_name,user_role,'Historiku i çmimeve',created_at FROM flight_price_history
        WHERE flight_id=${flightId} AND created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'note-'||id,'flight_notes','INSERT',
        jsonb_build_array(jsonb_build_object('field','message','old',null,'new',message)),
        null,author_name,author_role,'Shënimet e fluturimit',created_at FROM flight_notes
        WHERE flight_id=${flightId} AND created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'booking-'||l.id,'booking_change_logs',l.action,
        jsonb_build_array(jsonb_build_object('field',coalesce(l.field_name,'note'),'old',l.old_value,'new',coalesce(l.new_value,l.note))),
        b.booking_ref,l.user_name,l.user_role,'Historiku i rezervimit',l.created_at
        FROM booking_change_logs l JOIN bookings b ON b.id=l.booking_id
        WHERE b.flight_id=${flightId} AND l.created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'payment-'||l.id,'payment_change_logs',l.action,
        jsonb_build_array(jsonb_build_object('field',coalesce(l.field_name,'note'),'old',l.old_value,'new',coalesce(l.new_value,l.note))),
        b.booking_ref,l.user_name,l.user_role,'Historiku i pagesës',l.created_at
        FROM payment_change_logs l JOIN payments p ON p.id=l.payment_id JOIN bookings b ON b.id=p.booking_id
        WHERE b.flight_id=${flightId} AND l.created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
      UNION ALL
      SELECT 'task-'||a.id,'task_activity',a.action,
        jsonb_build_array(jsonb_build_object('field','description','old',null,'new',a.meta::text)),
        t.title,a.user_name,null,'Historiku i Task-ut',a.created_at FROM task_activity a JOIN tasks t ON t.id=a.task_id
        WHERE (t.entity_type='flight' AND t.entity_id=${flightId}
          OR t.entity_type='booking' AND t.entity_id IN (SELECT id FROM bookings WHERE flight_id=${flightId}))
        AND a.created_at < (SELECT activated_at FROM flight_activity_audit_config WHERE key='activated')
    ) SELECT * FROM events ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ${offset}
  `);
  const rows = result.rows;
  return { data: rows.slice(0,100), hasMore: rows.length > 100 };
}
