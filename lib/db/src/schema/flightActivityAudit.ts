import { pgTable, bigserial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Deliberately no cascading FK: deleted/moved entities keep their audit trail.
export const flightActivityAuditTable = pgTable("flight_activity_audit", {
  id: bigserial("id", {mode:"number"}).primaryKey(),
  flightId: integer("flight_id").notNull(),
  entityTable: text("entity_table").notNull(),
  entityId: text("entity_id"),
  operation: text("operation").notNull(),
  changes: jsonb("changes").notNull().default([]),
  reference: text("reference"),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  origin: text("origin").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t=>[index("flight_activity_audit_flight_time").on(t.flightId,t.createdAt,t.id)]);
export const flightActivityAuditConfigTable = pgTable("flight_activity_audit_config", {
  key: text("key").primaryKey(),
  activatedAt: timestamp("activated_at",{withTimezone:true}).notNull().defaultNow(),
});
