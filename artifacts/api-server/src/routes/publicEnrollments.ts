import { Router } from "express";
import { db, publicEnrollmentsTable, bookingUsersTable, agencyGroupsTable, agentsTable } from "@workspace/db";
import { eq, isNull, count, desc } from "drizzle-orm";
import { sendEnrollmentEmail } from "../lib/publicEnrollment.js";
import { notifyDataChanged } from "../lib/liveEvents.js";

export const publicEnrollmentsRouter = Router();
publicEnrollmentsRouter.use("/admin/enrollments", (req, res, next) => {
  if (!req.session?.userId || req.session.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të shqyrtojë regjistrimet." }); return;
  }
  next();
});
publicEnrollmentsRouter.get("/admin/enrollments/count", async (_req, res) => {
  const [row] = await db.select({ count: count() }).from(publicEnrollmentsTable).where(isNull(publicEnrollmentsTable.approvedAt));
  res.json(row);
});
publicEnrollmentsRouter.get("/admin/enrollments", async (_req, res) => {
  const rows = await db.select({
    userId: publicEnrollmentsTable.userId, name: bookingUsersTable.name, email: bookingUsersTable.email,
    role: bookingUsersTable.role, company: bookingUsersTable.company,
    createdAt: publicEnrollmentsTable.createdAt, approvedAt: publicEnrollmentsTable.approvedAt,
    groupId: publicEnrollmentsTable.groupId, notificationStatus: publicEnrollmentsTable.notificationStatus,
    notificationError: publicEnrollmentsTable.notificationError, activationStatus: publicEnrollmentsTable.activationStatus,
    activationError: publicEnrollmentsTable.activationError,
  }).from(publicEnrollmentsTable).innerJoin(bookingUsersTable, eq(bookingUsersTable.id, publicEnrollmentsTable.userId))
    .orderBy(desc(publicEnrollmentsTable.createdAt));
  res.json(rows);
});
publicEnrollmentsRouter.post("/admin/enrollments/:id/approve", async (req, res) => {
  const id = Number(req.params.id), groupId = req.body?.groupId;
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(groupId) || groupId < 1) {
    res.status(400).json({ error: "Zgjidhni një grup të vlefshëm." }); return;
  }
  const result = await db.transaction(async tx => {
    const [entry] = await tx.select().from(publicEnrollmentsTable).where(eq(publicEnrollmentsTable.userId, id)).for("update");
    if (!entry) return 404;
    if (entry.approvedAt) return entry.groupId === groupId ? 200 : 409;
    const [group] = await tx.select().from(agencyGroupsTable).where(eq(agencyGroupsTable.id, groupId)).for("share");
    if (!group) return 400;
    const [user] = await tx.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, id)).for("update");
    if (!user) return 404;
    if (user.agentId) {
      await tx.update(agentsTable).set({ groupId, status: "active" }).where(eq(agentsTable.id, user.agentId));
    }
    await tx.update(publicEnrollmentsTable).set({ groupId, approvedAt: new Date(), approvedBy: req.session.userId })
      .where(eq(publicEnrollmentsTable.userId, id));
    await tx.update(bookingUsersTable).set({ isApproved: true }).where(eq(bookingUsersTable.id, id));
    return 200;
  });
  if (result !== 200) { res.status(result).json({ error: "Regjistrimi/grupi nuk është i vlefshëm ose është miratuar me grup tjetër." }); return; }
  notifyDataChanged("enrollments");
  notifyDataChanged("agents");
  try {
    const email = await sendEnrollmentEmail(id, "activation");
    res.json({ approved: true, ...email });
  } catch {
    // Approval already committed. Never report it as rolled back because an
    // independent delivery-state write failed; a sending claim remains protected.
    res.json({ approved: true, emailStatus: "unknown", emailError: "Miratimi u ruajt, por statusi i emailit nuk u konfirmua. Kontrolloni emailin përpara ridërgimit." });
  }
});
publicEnrollmentsRouter.post("/admin/enrollments/:id/retry-email", async (req, res) => {
  const id = Number(req.params.id), kind = req.body?.kind;
  if (!Number.isSafeInteger(id) || id < 1 || !["notification", "activation"].includes(kind)) {
    res.status(400).json({ error: "Kërkesë e pavlefshme." }); return;
  }
  try { res.json(await sendEnrollmentEmail(id, kind)); }
  catch { res.status(400).json({ error: "Nuk mund të dërgohet emaili për këtë regjistrim." }); }
});