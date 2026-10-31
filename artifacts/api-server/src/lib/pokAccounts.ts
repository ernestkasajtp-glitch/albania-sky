import { and, asc, eq, sql } from "drizzle-orm";
import { db, pokAccountsTable, type PokAccount } from "@workspace/db";
import { encryptPokSecret, decryptPokSecret } from "./pokCrypto.js";

export { encryptPokSecret, decryptPokSecret };

export type PokCredentials = Pick<PokAccount, "id" | "label" | "merchantId" | "keyId" | "active"> & { keySecret: string };

export async function lockPokAccountConfig(tx: any): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('pok-account-config'))`);
}

export function publicPokAccount(account: PokAccount) {
  const mask = (value: string) => value.length <= 4 ? "••••" : `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return {
    id: account.id,
    label: account.label,
    merchantIdMasked: mask(account.merchantId),
    keyIdMasked: mask(account.keyId),
    active: account.active,
    disabledAt: account.disabledAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    secretConfigured: true,
    secretMasked: "••••••••",
  };
}

function envCredentials(): { label: string; merchantId: string; keyId: string; keySecret: string } | null {
  const merchantId = process.env.POK_MERCHANT_ID?.trim();
  const keyId = process.env.POK_KEY_ID?.trim();
  const keySecret = process.env.POK_KEY_SECRET;
  if (!merchantId || !keyId || !keySecret) return null;
  return { label: "POK (importuar nga konfigurimi)", merchantId, keyId, keySecret };
}

/**
 * One-time, non-destructive bootstrap for installations that used the
 * environment-only integration.  Existing DB accounts always win.
 */
export async function ensurePokAccount(): Promise<PokAccount | null> {
  const env = envCredentials();
  return db.transaction(async (tx) => {
    await lockPokAccountConfig(tx);
    const [existing] = await tx.select().from(pokAccountsTable).orderBy(asc(pokAccountsTable.id)).limit(1);
    if (existing || !env) return existing ?? null;
    const [inserted] = await tx.insert(pokAccountsTable).values({
      label: env.label,
      merchantId: env.merchantId,
      keyId: env.keyId,
      keySecretEncrypted: encryptPokSecret(env.keySecret),
      active: true,
    }).onConflictDoNothing().returning();
    return inserted ?? (await tx.select().from(pokAccountsTable).orderBy(asc(pokAccountsTable.id)).limit(1))[0] ?? null;
  });
}

export async function getActivePokAccount(): Promise<PokCredentials | null> {
  const account = (await db.select().from(pokAccountsTable)
    .where(eq(pokAccountsTable.active, true)).limit(1))[0] ?? await ensurePokAccount();
  if (!account || !account.active) return null;
  return { ...account, keySecret: decryptPokSecret(account.keySecretEncrypted) };
}

export async function getPokAccountById(id: number): Promise<PokCredentials | null> {
  const account = (await db.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1))[0];
  if (!account) return null;
  return { ...account, keySecret: decryptPokSecret(account.keySecretEncrypted) };
}

/** Resolve the account that was bootstrapped from the legacy environment.
 * This is intentionally independent of the current active account so an
 * in-flight legacy provider order can still be reconciled after a switch. */
export async function getLegacyPokAccount(executor: any = db): Promise<PokCredentials | null> {
  const merchantId = process.env.POK_MERCHANT_ID?.trim();
  const keyId = process.env.POK_KEY_ID?.trim();
  if (!merchantId || !keyId) return null;
  const [account] = await executor.select().from(pokAccountsTable)
    .where(and(eq(pokAccountsTable.merchantId, merchantId), eq(pokAccountsTable.keyId, keyId))).limit(1);
  return account ? { ...account, keySecret: decryptPokSecret(account.keySecretEncrypted) } : null;
}

export async function getPokAccountPublicList() {
  await ensurePokAccount();
  return (await db.select().from(pokAccountsTable).orderBy(asc(pokAccountsTable.id))).map(publicPokAccount);
}

export async function hasPendingPokOrders(accountId: number): Promise<boolean> {
  const rows = await db.execute(
    // Keep this query here so all callers use the same definition of pending.
    // Provider orders remain bound to their account until settled/expired.
    sql`SELECT 1 FROM pok_orders WHERE account_id = ${Number(accountId)} AND status IN ('created','pending') AND expires_at > now() LIMIT 1`,
  );
  return rows.rows.length > 0;
}

export async function hasAnyPokOrders(accountId: number): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM pok_orders WHERE account_id = ${Number(accountId)} LIMIT 1`);
  return rows.rows.length > 0;
}
