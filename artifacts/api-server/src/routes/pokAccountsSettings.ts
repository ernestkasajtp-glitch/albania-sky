import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pokAccountsTable, pokOrdersTable, settingsTable } from "@workspace/db";
import {
  encryptPokSecret,
  getPokAccountPublicList,
  hasPendingPokOrders,
  lockPokAccountConfig,
  publicPokAccount,
} from "../lib/pokAccounts.js";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Exact frontend contract: GET/PUT { createNewLinkEachAttempt: boolean }.
// Missing setting is OFF; a DB failure must not silently enable the policy.
router.get("/settings/pok-link-policy", requireAdmin, async (_req, res): Promise<void> => {
  const [setting] = await db.select({ value: settingsTable.value }).from(settingsTable)
    .where(eq(settingsTable.key, "pok_create_new_link_each_attempt")).limit(1);
  res.json({ createNewLinkEachAttempt: setting?.value === "true" });
});

router.put("/settings/pok-link-policy", requireAdmin, async (req, res): Promise<void> => {
  if (typeof req.body?.createNewLinkEachAttempt !== "boolean") {
    res.status(400).json({ error: "createNewLinkEachAttempt must be a boolean" });
    return;
  }
  await db.insert(settingsTable).values({
    key: "pok_create_new_link_each_attempt",
    value: String(req.body.createNewLinkEachAttempt),
  }).onConflictDoUpdate({
    target: settingsTable.key,
    set: { value: String(req.body.createNewLinkEachAttempt), updatedAt: new Date() },
  });
  res.json({ createNewLinkEachAttempt: req.body.createNewLinkEachAttempt });
});

router.get("/settings/pok-accounts", requireAdmin, async (_req, res): Promise<void> => {
  res.json({ accounts: await getPokAccountPublicList() });
});

router.post("/settings/pok-accounts", requireAdmin, async (req, res): Promise<void> => {
  const label = text(req.body?.label);
  const merchantId = text(req.body?.merchantId);
  const keyId = text(req.body?.keyId);
  const keySecret = typeof req.body?.keySecret === "string" ? req.body.keySecret : "";
  if (!label || !merchantId || !keyId || !keySecret) {
    res.status(400).json({ error: "label, merchantId, keyId dhe keySecret janë të detyrueshme" });
    return;
  }
  try {
    const account = await db.transaction(async (tx) => {
      await lockPokAccountConfig(tx);
      const activeExists = (await tx.select({ id: pokAccountsTable.id }).from(pokAccountsTable)
        .where(eq(pokAccountsTable.active, true)).limit(1)).length > 0;
      const [created] = await tx.insert(pokAccountsTable).values({
        label, merchantId, keyId, keySecretEncrypted: encryptPokSecret(keySecret),
        active: !activeExists,
      }).returning();
      return created;
    });
    res.status(201).json({ account: publicPokAccount(account) });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Një llogari me këto merchantId dhe keyId ekziston" });
      return;
    }
    throw error;
  }
});

router.patch("/settings/pok-accounts/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const account = (await db.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1))[0];
  if (!account) { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }

  const label = req.body?.label === undefined ? account.label : text(req.body.label);
  const merchantId = req.body?.merchantId === undefined ? account.merchantId : text(req.body.merchantId);
  const keyId = req.body?.keyId === undefined ? account.keyId : text(req.body.keyId);
  const hasSecret = req.body?.keySecret !== undefined;
  const keySecret = hasSecret && typeof req.body.keySecret === "string" ? req.body.keySecret : "";
  if (!label || !merchantId || !keyId || (hasSecret && !keySecret)) {
    res.status(400).json({ error: "Të dhënat e llogarisë janë të pavlefshme" });
    return;
  }
  const credentialsChanged = merchantId !== account.merchantId || keyId !== account.keyId || hasSecret;
  try {
    const updated = await db.transaction(async (tx) => {
      await lockPokAccountConfig(tx);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${id}`}))`);
      const [fresh] = await tx.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1);
      if (!fresh) return null;
      if (credentialsChanged && (await tx.select({ id: pokOrdersTable.id }).from(pokOrdersTable)
        .where(eq(pokOrdersTable.accountId, id)).limit(1)).length > 0) {
        throw Object.assign(new Error("POK credentials immutable"), { code: "POK_CREDENTIALS_IMMUTABLE" });
      }
      const [saved] = await tx.update(pokAccountsTable).set({
        label,
        merchantId,
        keyId,
        ...(hasSecret ? { keySecretEncrypted: encryptPokSecret(keySecret) } : {}),
        updatedAt: new Date(),
      }).where(eq(pokAccountsTable.id, id)).returning();
      return saved;
    });
    if (!updated) { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }
    res.json({ account: publicPokAccount(updated) });
  } catch (error: any) {
    if (error?.code === "POK_CREDENTIALS_IMMUTABLE") {
      res.status(409).json({ error: "Kjo llogari ka porosi POK; kredencialet janë të pandryshueshme. Krijoni një llogari të re për rotacion." });
      return;
    }
    if (error?.code === "23505") {
      res.status(409).json({ error: "Një llogari me këto merchantId dhe keyId ekziston" });
      return;
    }
    throw error;
  }
});

router.post("/settings/pok-accounts/:id/activate", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const account = (await db.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1))[0];
  if (!account) { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }
  await db.transaction(async (tx) => {
    await lockPokAccountConfig(tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${id}`}))`);
    await tx.update(pokAccountsTable).set({ active: false, updatedAt: new Date() }).where(eq(pokAccountsTable.active, true));
    await tx.update(pokAccountsTable).set({ active: true, disabledAt: null, updatedAt: new Date() }).where(eq(pokAccountsTable.id, id));
  });
  const [updated] = await db.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id));
  res.json({ account: publicPokAccount(updated) });
});

router.post("/settings/pok-accounts/:id/disable", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const updated = await db.transaction(async (tx) => {
    await lockPokAccountConfig(tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${id}`}))`);
    const [fresh] = await tx.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1);
    if (!fresh) return { kind: "missing" as const };
    if (fresh.active) return { kind: "active" as const };
    if ((await tx.select({ id: pokOrdersTable.id }).from(pokOrdersTable)
       .where(and(eq(pokOrdersTable.accountId, id), inArray(pokOrdersTable.status, ["creating", "unknown", "created", "pending", "superseded", "expired", "review_required"]))).limit(1)).length > 0) {
      return { kind: "pending" as const };
    }
    const [saved] = await tx.update(pokAccountsTable).set({ disabledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pokAccountsTable.id, id), eq(pokAccountsTable.active, false))).returning();
    return { kind: "updated" as const, account: saved };
  });
  if (updated.kind === "missing") { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }
  if (updated.kind === "active") { res.status(409).json({ error: "Aktivizoni fillimisht një llogari tjetër" }); return; }
  if (updated.kind === "pending") { res.status(409).json({ error: "Kjo llogari ka intent POK të pazgjidhur dhe nuk mund të çaktivizohet" }); return; }
  res.json({ account: publicPokAccount(updated.account) });
});

router.delete("/settings/pok-accounts/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const account = (await db.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1))[0];
  if (!account) { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }
  const deleted = await db.transaction(async (tx) => {
    await lockPokAccountConfig(tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${id}`}))`);
    const [fresh] = await tx.select().from(pokAccountsTable).where(eq(pokAccountsTable.id, id)).limit(1);
    if (!fresh) return "missing";
    if (fresh.active) return "active";
    if ((await tx.select({ id: pokOrdersTable.id }).from(pokOrdersTable)
      .where(eq(pokOrdersTable.accountId, id)).limit(1)).length > 0) return "has_orders";
    await tx.delete(pokAccountsTable).where(eq(pokAccountsTable.id, id));
    return "deleted";
  });
  if (deleted === "active") { res.status(409).json({ error: "Llogaria aktive nuk mund të fshihet" }); return; }
  if (deleted === "has_orders") { res.status(409).json({ error: "Llogaria ka porosi POK historike dhe nuk mund të fshihet" }); return; }
  if (deleted === "missing") { res.status(404).json({ error: "Llogaria nuk u gjet" }); return; }
  res.json({ deleted: true });
});

export default router;
