import { pgTable, serial, text, integer, timestamp, index, primaryKey } from "drizzle-orm/pg-core";

export const fmsLoginAttemptsTable = pgTable("fms_login_attempts", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  result: text("result").notNull(), // success, failed, blocked, verified
  userId: integer("user_id"),
  deviceId: text("device_id"),
  sourceKey: text("source_key").unique(), // idempotent Apache log import
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fms_login_attempts_ip_created_idx").on(t.ip, t.createdAt),
  index("fms_login_attempts_created_idx").on(t.createdAt),
]);

export const fmsIpBlocksTable = pgTable("fms_ip_blocks", {
  ip: text("ip").primaryKey(),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  blockedBy: integer("blocked_by").notNull(),
  accessGeneration: text("access_generation").notNull().default(""),
});

export const fmsIpBlockEventsTable = pgTable("fms_ip_block_events", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  action: text("action").notNull(),
  actorId: integer("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fmsIpSessionsTable = pgTable("fms_ip_sessions", {
  sid: text("sid").primaryKey(),
  ip: text("ip").notNull(),
  userId: integer("user_id").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fms_ip_sessions_ip_seen_idx").on(t.ip, t.lastSeen)]);

export const fmsIpLabelsTable = pgTable("fms_ip_labels", {
  ip: text("ip").primaryKey(),
  label: text("label").notNull(),
});

export const fmsDevicesTable = pgTable("fms_devices", {
  deviceId: text("device_id").primaryKey(),
  label: text("label"),
  userAgent: text("user_agent"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fmsDeviceIpsTable = pgTable("fms_device_ips", {
  deviceId: text("device_id").notNull(),
  ip: text("ip").notNull(),
  loginCount: integer("login_count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.deviceId, t.ip] }),
  index("fms_device_ips_ip_seen_idx").on(t.ip, t.lastSeenAt),
]);

export const fmsIpAccessCodesTable = pgTable("fms_ip_access_codes", {
  id: text("id").primaryKey(),
  ip: text("ip").notNull(),
  userId: integer("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
}, (t) => [
  index("fms_ip_access_codes_user_created_idx").on(t.userId, t.createdAt),
  index("fms_ip_access_codes_ip_created_idx").on(t.ip, t.createdAt),
]);

export const fmsIpBlockAlertEmailsTable = pgTable("fms_ip_block_alert_emails", {
  ip: text("ip").primaryKey(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fms_ip_block_alert_sent_idx").on(t.lastSentAt)]);