import { pgTable, serial, text, numeric, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agencyGroupsTable } from "./agencyGroups";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => agencyGroupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  displayColor: text("display_color"),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  financeEmail: text("finance_email"),
  company: text("company"),
  commission: numeric("commission", { precision: 5, scale: 2 }).notNull().default("0"),
  markup: numeric("markup", { precision: 5, scale: 2 }).notNull().default("0"),
  markupPercent: numeric("markup_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  walletBalance: numeric("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type").notNull().default("percent"),
  discountFixed: numeric("discount_fixed", { precision: 10, scale: 2 }).notNull().default("0"),
  showInReports: boolean("show_in_reports").notNull().default(true),
  showContactToUsers: boolean("show_contact_to_users").notNull().default(true),
  managerCanEdit: boolean("manager_can_edit").notNull().default(true),
  notifyByEmail: boolean("notify_by_email").notNull().default(true),
  // Raporti javor i detyrimeve (çdo të hënë 07:00 Shqipëri): dërgohet me email
  // VETËM te agjentët që admini i ka selektuar me këtë flamur DHE që kanë
  // detyrim real (> 0) në momentin e dërgimit. Vendoset vetëm nga admini.
  weeklyDebtReport: boolean("weekly_debt_report").notNull().default(false),
  // Per-status email toggles (master switch above must also be ON). Decide which
  // booking-status emails (with PDF) this agent receives. Default all ON.
  notifyCreated: boolean("notify_created").notNull().default(true),
  notifyProcessing: boolean("notify_processing").notNull().default(false),
  notifyConfirmed: boolean("notify_confirmed").notNull().default(false),
  notifyTicketed: boolean("notify_ticketed").notNull().default(true),
  notifyCancelled: boolean("notify_cancelled").notNull().default(true),
  // When true, this agent sees flights in the Booking Engine even if they are
  // marked "Fshehur" (show_in_booking_engine = false). Default false = the agent
  // is subject to the hide like the public, i.e. does NOT see hidden flights.
  seesHiddenFlights: boolean("sees_hidden_flights").notNull().default(false),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const agentCreditTransactionsTable = pgTable("agent_credit_transactions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "deposit" | "payment" | "refund"
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  bookingId: integer("booking_id"),
  bookingRef: text("booking_ref"),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  notes: text("notes"),
  documentUrl: text("document_url"),
  invoiceCode: text("invoice_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_agent_credit_tx_agent_created").on(t.agentId, t.createdAt),
  index("idx_agent_credit_tx_booking_id").on(t.bookingId),
]);

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true, apiKey: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
export type AgentCreditTransaction = typeof agentCreditTransactionsTable.$inferSelect;
