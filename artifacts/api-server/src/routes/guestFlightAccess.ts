import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable, agencyGroupsTable } from "@workspace/db";
import { GUEST_ACCESS_KEY, getGuestFlightPolicy, parseGuestFlightPolicy } from "../lib/guestFlightAccess.js";

export const guestFlightAccessRouter: IRouter = Router();
guestFlightAccessRouter.use("/settings/guest-flight-access", (req, res, next) => {
  if (!req.session?.userId || req.session.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të ndryshojë aksesin e vizitorëve." }); return;
  }
  next();
});
guestFlightAccessRouter.get("/settings/guest-flight-access", async (_req, res): Promise<void> => {
  res.json(await getGuestFlightPolicy());
});
guestFlightAccessRouter.put("/settings/guest-flight-access", async (req, res): Promise<void> => {
  let policy;
  try { policy = parseGuestFlightPolicy(req.body); } catch (error) {
    res.status(400).json({ error: (error as Error).message }); return;
  }
  if (policy.groupId !== null) {
    const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable)
      .where(eq(agencyGroupsTable.id, policy.groupId));
    if (!group) {
      res.status(400).json({ error: "Grupi i agjencisë nuk ekziston." }); return;
    }
  }
  await db.insert(settingsTable).values({ key: GUEST_ACCESS_KEY, value: JSON.stringify(policy) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(policy), updatedAt: new Date() } });
  res.json(policy);
});