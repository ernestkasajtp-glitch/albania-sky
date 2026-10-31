import { pgTable, serial, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Credentials for a POK merchant.  keySecretEncrypted is always an
 * application-encrypted AES-GCM envelope; plaintext provider credentials must
 * never be persisted.
 */
export const pokAccountsTable = pgTable("pok_accounts", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  merchantId: text("merchant_id").notNull(),
  keyId: text("key_id").notNull(),
  keySecretEncrypted: text("key_secret_encrypted").notNull(),
  active: boolean("active").notNull().default(false),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pok_accounts_merchant_key_uniq").on(t.merchantId, t.keyId),
  // The database, rather than process memory, enforces the single-active
  // invariant across all API instances.
  uniqueIndex("pok_accounts_single_active_uniq").on(t.active).where(sql`${t.active} = true`),
  index("idx_pok_accounts_active").on(t.active),
]);

export type PokAccount = typeof pokAccountsTable.$inferSelect;
