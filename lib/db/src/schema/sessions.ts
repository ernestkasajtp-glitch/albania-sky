import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expiredAt: timestamp("expired_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("idx_sessions_expired_at").on(t.expiredAt),
]);
