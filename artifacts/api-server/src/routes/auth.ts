import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, bookingUsersTable, agentsTable, agentActivityTable, publicEnrollmentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit, recordFailure, recordSuccess, getIp } from "../lib/rateLimit.js";
import { sendLoginNotifyEmail } from "../lib/loginNotify.js";
import { getPublicEnrollment, pendingApproval, sendEnrollmentEmail } from "../lib/publicEnrollment.js";
import { notifyDataChanged } from "../lib/liveEvents.js";

const router: IRouter = Router();

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
    agentId?: number;
  }
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password, name, company, phone, role } = req.body ?? {};
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 6 || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "email, password, name are required" });
    return;
  }
  const userRole = role === "agent" ? "agent" : "client";
  if ((company != null && typeof company !== "string") || (phone != null && typeof phone !== "string") ||
      (userRole === "agent" && (typeof company !== "string" || !company.trim()))) {
    res.status(400).json({ error: "Agjentët duhet të plotësojnë kompaninë/NIPT; të dhënat e kontaktit duhet të jenë tekst." });
    return;
  }

  const existing = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user: typeof bookingUsersTable.$inferSelect;
  try {
    user = await db.transaction(async tx => {
      let agentId: number | null = null;
      if (userRole === "agent" && company) {
        const [agent] = await tx.insert(agentsTable).values({
          name, company: company || name, email, phone: phone || null,
          commission: "0", markup: "0", status: "inactive",
        }).returning();
        agentId = agent.id;
      }
      const [created] = await tx.insert(bookingUsersTable).values({
        email, passwordHash, name, company: company || null, phone: phone || null,
        role: userRole, agentId, isApproved: false,
      }).returning();
      await tx.insert(publicEnrollmentsTable).values({ userId: created.id });
      return created;
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      res.status(409).json({ error: "Email already registered" }); return;
    }
    throw error;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agentId = user.agentId ?? undefined;
  (req.session as any).source = "be";

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    agentId: user.agentId,
    isApproved: user.isApproved,
    pendingApproval: true,
  });

  notifyDataChanged("enrollments");
  // Persisted pending send can be retried by admin after a configuration failure.
  void sendEnrollmentEmail(user.id, "notification").catch(() => console.error("Enrollment notification state could not be saved", user.id));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const ip = getIp(req as any);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    res.status(429).json({
      error: `Shumë tentativa të gabuara. Provo përsëri pas ${Math.ceil((rl.retryAfterSec ?? 900) / 60)} minutash.`,
    });
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.email, email));
  if (!user) {
    recordFailure(ip);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordFailure(ip);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  recordSuccess(ip);

  // Auto-link to FMS agent by email if not already linked
  const enrollment = await getPublicEnrollment(user.id);
  let effectiveAgentId = user.agentId;
  if (!effectiveAgentId && !enrollment) {
    const [fmsAgent] = await db.select().from(agentsTable).where(eq(agentsTable.email, email));
    if (fmsAgent) {
      effectiveAgentId = fmsAgent.id;
      await db.update(bookingUsersTable)
        // Linking a Booking Engine profile must never change an FMS role.
        // This used to demote admins/managers to "agent" merely because an
        // agent record had the same email address.
        .set({ agentId: fmsAgent.id })
        .where(eq(bookingUsersTable.id, user.id));
    }
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agentId = effectiveAgentId ?? undefined;
  (req.session as any).source = "be";

  let loginDiscountPercent = 0;
  let loginDiscountFixed = 0;
  let loginDiscountType = "percent";
  if (effectiveAgentId) {
    const [agentRec] = await db.select().from(agentsTable).where(eq(agentsTable.id, effectiveAgentId));
    if (agentRec) {
      loginDiscountPercent = Number(agentRec.discountPercent ?? 0);
      loginDiscountFixed = Number(agentRec.discountFixed ?? 0);
      loginDiscountType = agentRec.discountType ?? "percent";
    }
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: enrollment ? user.role : effectiveAgentId ? "agent" : user.role,
    agentId: effectiveAgentId,
    isApproved: user.isApproved,
    pendingApproval: !!enrollment && (!enrollment.approvedAt || !enrollment.groupId),
    discountPercent: loginDiscountPercent,
    discountFixed: loginDiscountFixed,
    discountType: loginDiscountType,
  });

  // Track agent visits: count how many times this agent has logged into the
  // booking page + remember the last visit. Admin-only display in the agents
  // list. Fire-and-forget so it never delays/blocks the login response.
  if (effectiveAgentId) {
    db.update(agentsTable)
      .set({ loginCount: sql`${agentsTable.loginCount} + 1`, lastLoginAt: new Date() })
      .where(eq(agentsTable.id, effectiveAgentId))
      .catch(() => {});
    const loginIp = getIp(req as any);
    const ua = (req.headers["user-agent"] as string | undefined)?.slice(0, 400) ?? null;
    db.insert(agentActivityTable).values({
      agentId: effectiveAgentId,
      userId: user.id,
      type: "login",
      method: "POST",
      path: "/auth/login",
      description: "Hyrje në sistem",
      ip: loginIp,
      userAgent: ua,
      statusCode: 200,
    }).catch(() => {});
  }

  // Email njoftimi për ÇDO hyrje nga faqja e jashtme (çdo rol), me IP + pajisjen.
  sendLoginNotifyEmail({
    name: user.name ?? user.email,
    email: user.email,
    role: effectiveAgentId ? "agent" : user.role,
    source: "be",
    ip: getIp(req as any),
    userAgent: req.headers["user-agent"] as string | undefined,
    company: user.company,
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId || (req.session as any).source === "fms") {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  let discountPercent = 0;
  let discountFixed = 0;
  let discountType = "percent";
  let markup = 0;
  if (user.agentId) {
    const [agentRec] = await db.select({
      discountPercent: agentsTable.discountPercent,
      discountFixed: agentsTable.discountFixed,
      discountType: agentsTable.discountType,
      markup: agentsTable.markup,
    }).from(agentsTable).where(eq(agentsTable.id, user.agentId));
    discountPercent = Number(agentRec?.discountPercent ?? 0);
    discountFixed   = Number(agentRec?.discountFixed   ?? 0);
    discountType    = agentRec?.discountType ?? "percent";
    markup          = Number(agentRec?.markup ?? 0);
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    agentId: user.agentId,
    isApproved: user.isApproved,
    discountPercent,
    discountFixed,
    discountType,
    markup,
    pendingApproval: await pendingApproval(user.id),
  });
});

export default router;
