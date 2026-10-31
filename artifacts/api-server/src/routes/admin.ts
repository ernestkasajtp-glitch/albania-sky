import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, pool, bookingUsersTable, agentsTable, agencyGroupsTable, bookingsTable, sessionsTable } from "@workspace/db";
import { and, eq, inArray, ne, count, sql } from "drizzle-orm";
import { runCitizenPlaneImport } from "../lib/pnlImport.js";
import { checkRateLimit, recordFailure, recordSuccess, getIp } from "../lib/rateLimit.js";
import { sendLoginNotifyEmail } from "../lib/loginNotify.js";
import { recordFmsDevice, recordFmsLoginAttempt, trackFmsSession, trustedFmsIp, validFmsDeviceId } from "../lib/fmsIpAccess.js";
import { AccessRequestLimited, consumeFmsAccessCode, requestFmsAccessCode } from "../lib/fmsAccessApproval.js";

const router: IRouter = Router();

const FMS_ROLES = ["admin", "manager", "agent_staff"];

async function finishFmsLogin(
  req: Request, res: Response, user: typeof bookingUsersTable.$inferSelect, ip: string,
  verifiedGeneration?: string,
): Promise<void> {
  const deviceId = validFmsDeviceId(req.body?.deviceId);
  const verified = verifiedGeneration !== undefined;
  if (!verified) await recordFmsLoginAttempt(ip, "success", user.id, deviceId);
  recordSuccess(ip);
  req.session.userId = user.id;
  req.session.role = user.role;
  (req.session as any).userName = user.name ?? user.email;
  (req.session as any).source = "fms";
  (req.session as any).fmsLoginIp = ip;
  (req.session as any).fmsCurrentIp = ip;
  (req.session as any).lastActivity = Date.now();
  if (verified) {
    (req.session as any).fmsIpVerified = ip;
    (req.session as any).fmsIpVerifiedGeneration = verifiedGeneration;
    await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    // A concurrent re-block may revoke the session between code consumption and
    // save. The rotated generation prevents reuse and avoids holding a pooled DB
    // connection across session-store operations.
    const current = await pool.query<{ access_generation: string }>(
      "SELECT access_generation FROM fms_ip_blocks WHERE ip = $1", [ip],
    );
    if (current.rows[0]?.access_generation !== verifiedGeneration) {
      await new Promise<void>(resolve => req.session.destroy(() => resolve()));
      res.clearCookie("fms_sid", { path: "/" });
      res.status(409).json({ error: "Gjendja e IP-së ndryshoi. Kërko një kod të ri." });
      return;
    }
    await recordFmsLoginAttempt(ip, "verified", user.id, deviceId);
  }
  trackFmsSession(req, ip);
  if (deviceId) {
    try {
      await recordFmsDevice(req, deviceId, ip, true);
    } catch (error) {
      req.log.error({ err: error }, "FMS device could not be recorded");
    }
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  sendLoginNotifyEmail({
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
    source: "fms",
    ip,
    userAgent: req.headers["user-agent"] as string | undefined,
    company: user.company,
    verifiedIp: verified,
  });
}

// POST /admin/setup — krijon admin-in e parë (vetëm nëse nuk ekziston asnjë admin)
router.post("/admin/setup", async (req, res): Promise<void> => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password dhe name janë të nevojshme" });
    return;
  }
  const existing = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.role, "admin"));
  if (existing.length > 0) {
    res.status(409).json({ error: "Admin ekziston tashmë" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(bookingUsersTable).values({
    email, passwordHash, name, role: "admin", isApproved: true,
  }).returning();
  req.session.userId = user.id;
  req.session.role = user.role;
  (req.session as any).source = "fms";
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// POST /admin/login — hyrje për admin / manager / agent_staff
router.post("/admin/login", async (req, res): Promise<void> => {
  const ip = trustedFmsIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    await recordFmsLoginAttempt(ip, "blocked");
    res.status(429).json({
      error: `Shumë tentativa të gabuara. Provo përsëri pas ${Math.ceil((rl.retryAfterSec ?? 900) / 60)} minutash.`,
    });
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(400).json({ error: "email dhe password janë të nevojshme" });
    return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.email, email));
  if (!user || !FMS_ROLES.includes(user.role)) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(401).json({ error: "Kredencialet nuk janë të sakta" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(401).json({ error: "Kredencialet nuk janë të sakta" });
    return;
  }
  // Do not let an earlier verified browser session authorize a new account.
  await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  await finishFmsLogin(req, res, user, ip);
});

// These two endpoints remain reachable from a blocked IP. Both demand valid
// FMS credentials, and the verification also consumes a single-use, IP-bound code.
router.post("/admin/access/request", async (req, res): Promise<void> => {
  const ip = trustedFmsIp(req);
  const blocked = await pool.query("SELECT 1 FROM fms_ip_blocks WHERE ip = $1", [ip]);
  if (!blocked.rowCount) { res.status(400).json({ error: "Kjo IP nuk është e bllokuar." }); return; }
  if (!checkRateLimit(ip).allowed) {
    res.status(429).json({ error: "Shumë tentativa. Provo përsëri më vonë." }); return;
  }
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 200) {
    res.status(400).json({ error: "Shkruaj emailin dhe fjalëkalimin." }); return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.email, email));
  if (!user || !FMS_ROLES.includes(user.role) || !await bcrypt.compare(password, user.passwordHash)) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(401).json({ error: "Kredencialet nuk janë të sakta." }); return;
  }
  try {
    const expiresAt = await requestFmsAccessCode(ip, user.id);
    recordSuccess(ip);
    res.setHeader("Cache-Control", "no-store");
    res.json({ expiresAt });
  } catch (error) {
    if (error instanceof AccessRequestLimited) {
      res.status(429).json({ error: error.message }); return;
    }
    req.log.error({ err: error }, "FMS access code could not be sent");
    res.status(503).json({ error: "Kodi nuk u dërgua. Provo përsëri më vonë." });
  }
});

router.post("/admin/access/verify", async (req, res): Promise<void> => {
  const ip = trustedFmsIp(req);
  const blocked = await pool.query<{ access_generation: string }>(
    "SELECT access_generation FROM fms_ip_blocks WHERE ip = $1", [ip],
  );
  if (!blocked.rowCount) { res.status(400).json({ error: "Kjo IP nuk është e bllokuar; hyr normalisht." }); return; }
  if (!checkRateLimit(ip).allowed) {
    res.status(429).json({ error: "Shumë tentativa. Provo përsëri më vonë." }); return;
  }
  const { email, password, code } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" ||
      email.length > 254 || password.length > 200 || typeof code !== "string" || !/^\d{8}$/.test(code)) {
    res.status(400).json({ error: "Shkruaj emailin, fjalëkalimin dhe kodin 8-shifror." }); return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.email, email));
  if (!user || !FMS_ROLES.includes(user.role) || !await bcrypt.compare(password, user.passwordHash)) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(401).json({ error: "Kredencialet ose kodi nuk janë të sakta, ose kodi ka skaduar." }); return;
  }
  if (!await consumeFmsAccessCode(ip, user.id, code)) {
    recordFailure(ip);
    await recordFmsLoginAttempt(ip, "failed");
    res.status(401).json({ error: "Kredencialet ose kodi nuk janë të sakta, ose kodi ka skaduar." }); return;
  }
  // A new session prevents any prior anonymous cookie from inheriting the bypass.
  await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  await finishFmsLogin(req, res, user, ip, blocked.rows[0].access_generation);
});

// Register an already-authenticated browser after an app reload, without
// counting another login or affecting booking-engine sessions.
router.post("/admin/device", async (req, res): Promise<void> => {
  if (!req.session.userId || !FMS_ROLES.includes(req.session.role ?? "") || (req.session as any).source !== "fms") {
    res.status(401).json({ error: "Jo i autentikuar" }); return;
  }
  const deviceId = validFmsDeviceId(req.body?.deviceId);
  if (!deviceId) { res.status(400).json({ error: "Pajisje e pavlefshme" }); return; }
  await recordFmsDevice(req, deviceId, trustedFmsIp(req), false);
  res.json({ ok: true });
});

// GET /admin/me
router.get("/admin/me", async (req, res): Promise<void> => {
  if (!req.session.userId || !FMS_ROLES.includes(req.session.role || "") || (req.session as any).source !== "fms") {
    res.status(401).json({ error: "Jo i autentikuar" });
    return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId));
  if (!user || !FMS_ROLES.includes(user.role)) {
    res.status(401).json({ error: "Jo i autentikuar" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// POST /admin/logout
router.post("/admin/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// GET /admin/has-admin
router.get("/admin/has-admin", async (_req, res): Promise<void> => {
  const existing = await db.select({ id: bookingUsersTable.id }).from(bookingUsersTable).where(eq(bookingUsersTable.role, "admin"));
  res.json({ exists: existing.length > 0 });
});

// ─── User Management ───────────────────────────────────────────────────────────

// helper: kontrollon nëse useri ka leje për të menaxhuar përdoruesit
async function canManageUsers(req: any): Promise<boolean> {
  if (!req.session?.userId) return false;
  if (req.session.role === "admin") return true;
  if (!["manager", "agent_staff"].includes(req.session.role)) return false;
  try {
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(req.session.role, req.session.userId);
    return perms.can_manage_users === true;
  } catch { return false; }
}

// helper: kontrollon nëse aktori mund të ndryshojë përdoruesin objektiv.
// Vetëm admini mund të prekë llogari admin — parandalon marrjen e llogarisë
// admin nga një manager me leje can_manage_users (email/fjalëkalim reset).
async function canMutateTargetUser(req: any, targetId: number): Promise<{ ok: boolean; status: number; error: string }> {
  const [target] = await db.select({ id: bookingUsersTable.id, role: bookingUsersTable.role })
    .from(bookingUsersTable).where(eq(bookingUsersTable.id, targetId));
  if (!target) return { ok: false, status: 404, error: "Përdoruesi nuk u gjet" };
  if (target.role === "admin" && req.session?.role !== "admin") {
    return { ok: false, status: 403, error: "Vetëm administratori mund të ndryshojë llogari administratori" };
  }
  return { ok: true, status: 200, error: "" };
}

// GET /admin/users — lista e të gjithë përdoruesve (jo admin-in aktual)
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await canManageUsers(req))) {
    res.status(403).json({ error: "Nuk keni leje për të parë përdoruesit" });
    return;
  }
  const users = await db
    .select({
      id: bookingUsersTable.id,
      email: bookingUsersTable.email,
      name: bookingUsersTable.name,
      role: bookingUsersTable.role,
      company: bookingUsersTable.company,
      ...(req.session?.role === "admin" ? {
        agentId: bookingUsersTable.agentId,
        agentName: agentsTable.name,
      } : {}),
      phone: bookingUsersTable.phone,
      isApproved: bookingUsersTable.isApproved,
      createdAt: bookingUsersTable.createdAt,
    })
    .from(bookingUsersTable)
    .leftJoin(agentsTable, eq(agentsTable.id, bookingUsersTable.agentId))
    .where(ne(bookingUsersTable.id, req.session.userId!))
    .orderBy(bookingUsersTable.createdAt);
  res.json(users);
});

// POST /admin/users — krijon përdorues të ri
router.get("/admin/user-agent-options", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të lidhë përdorues me agjentë" }); return;
  }
  const agents = await db.select({ id: agentsTable.id, name: agentsTable.name, company: agentsTable.company })
    .from(agentsTable).where(eq(agentsTable.status, "active")).orderBy(agentsTable.name);
  res.json(agents);
});

router.post("/admin/users/:id/agent-link", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të lidhë përdoruesit." }); return;
  }
  const id = Number(req.params.id);
  const { agentId, expectedAgentId, confirmMove } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(agentId) || agentId <= 0 ||
      !(expectedAgentId === null || (Number.isSafeInteger(expectedAgentId) && expectedAgentId > 0))) {
    res.status(400).json({ error: "Përdoruesi ose agjenti është i pavlefshëm." }); return;
  }
  const result = await db.transaction(async tx => {
    const [user] = await tx.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, id)).for("update");
    if (!user) return { status: 404, error: "Përdoruesi nuk u gjet." };
    if (user.role === "admin") return { status: 403, error: "Llogaritë administrator nuk lidhen nga kjo faqe." };
    if (user.agentId !== expectedAgentId) return { status: 409, error: "Lidhja është ndryshuar. Rifreskoni listën." };
    const [agent] = await tx.select({ id: agentsTable.id }).from(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.status, "active"))).for("share");
    if (!agent) return { status: 400, error: "Agjenti duhet të jetë aktiv." };
    if (user.agentId === agentId) return { status: 200 };
    if (user.agentId !== null && confirmMove !== true)
      return { status: 409, error: "Konfirmoni kalimin nga agjencia aktuale." };
    await tx.update(bookingUsersTable).set({ agentId }).where(eq(bookingUsersTable.id, id));
    // Reauthenticate existing sessions; agency data/roles are never copied or changed.
    await tx.delete(sessionsTable).where(sql`${sessionsTable.sess}::jsonb ->> 'userId' = ${String(id)}`);
    return { status: 200 };
  });
  res.status(result.status).json(result.error ? { error: result.error } : { ok: true });
});

router.post("/admin/users", async (req, res): Promise<void> => {
  if (!(await canManageUsers(req))) {
    res.status(403).json({ error: "Nuk keni leje për të krijuar përdorues" });
    return;
  }
  const { email, password, name, role, company, phone, groupId, agentId: selectedAgentId } = req.body;
  if (selectedAgentId != null && (req.session?.role !== "admin" ||
      !Number.isSafeInteger(selectedAgentId) || selectedAgentId <= 0)) {
    res.status(req.session?.role !== "admin" ? 403 : 400).json({ error: "Lidhja me agjentin kërkon administrator dhe një agjent të vlefshëm" }); return;
  }
  const validRoles = ["manager", "agent_staff", "agent"];
  if (role === "agent" && req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të krijojë hyrje për agjenci" }); return;
  }
  if (!email || !password || !name || !validRoles.includes(role)) {
    res.status(400).json({ error: "Të dhënat janë jo të plota ose roli është i pavlefshëm" });
    return;
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Emri, emaili ose fjalëkalimi janë të pavlefshëm" }); return;
  }
  const existing = await db.select({ id: bookingUsersTable.id }).from(bookingUsersTable).where(sql`lower(${bookingUsersTable.email}) = lower(${email})`);
  if (existing.length > 0) {
    res.status(409).json({ error: "Ky email është i regjistruar tashmë" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
  const user = await db.transaction(async (db) => {
  // Serialize this creation flow; agent creation rolls back if user insertion fails.
  await db.execute(sql`SELECT pg_advisory_xact_lock(707002)`);
  const [duplicate] = await db.select({ id: bookingUsersTable.id }).from(bookingUsersTable)
    .where(sql`lower(${bookingUsersTable.email}) = lower(${email})`);
  if (duplicate) throw Object.assign(new Error("Ky email është i regjistruar tashmë"), { status: 409 });

  // Nëse është agency (agent), lidhe me një agjent ekzistues ose krijo një të ri.
  // agents.email ka constraint UNIQUE: nëse ekziston tashmë një agjent me këtë
  // email, ripërdore atë — përndryshe INSERT-i dështon me duplicate key dhe
  // përdoruesi merr një 500 (HTML) "is not valid JSON".
  let agentId: number | null = null;
  if (selectedAgentId != null) {
    const [selected] = await db.select({ id: agentsTable.id, status: agentsTable.status })
      .from(agentsTable).where(eq(agentsTable.id, selectedAgentId)).for("update");
    if (!selected || selected.status !== "active") {
      throw Object.assign(new Error("Agjenti nuk ekziston ose është joaktiv. Zgjidhni një agjent aktiv."), { status: 400 });
    }
    agentId = selected.id;
  } else if (role === "agent" && (company || name)) {
    const [existingAgent] = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.email, email));
    if (existingAgent) {
      agentId = existingAgent.id;
    } else {
      if (req.session?.role !== "admin") {
        throw Object.assign(new Error("Only an admin can create an agency and assign its group"), { status: 403 });
      }
      if (typeof groupId !== "number" || !Number.isSafeInteger(groupId) || groupId <= 0) {
        throw Object.assign(new Error("Group assignment is required for a new agency"), { status: 400 });
      }
      const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable)
        .where(eq(agencyGroupsTable.id, groupId));
      if (!group) throw Object.assign(new Error("Group not found"), { status: 400 });
      const [agent] = await db.insert(agentsTable).values({
        name,
        company: company || name,
        email,
        phone: phone || null,
        commission: "0",
        markup: "0",
        status: "active",
        groupId: group.id,
      }).returning();
      agentId = agent.id;
    }
  }

  const [user] = await db.insert(bookingUsersTable).values({
    email,
    passwordHash,
    name,
    role,
    company: company || null,
    phone: phone || null,
    agentId,
    isApproved: true,
  }).returning();
  return user;
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company,
    phone: user.phone,
    isApproved: user.isApproved,
    agentId: user.agentId,
    createdAt: user.createdAt,
  });
  } catch (error: any) {
    const uniqueConflict = error?.code === "23505" || error?.cause?.code === "23505";
    if (uniqueConflict || error?.status) {
      res.status(uniqueConflict ? 409 : error.status).json({ error: uniqueConflict ? "Ky email është i regjistruar tashmë" : error.message });
      return;
    }
    throw error;
  }
});

// DELETE /admin/users/:id — fshi përdoruesin
// Vetëm admin mund të fshijë (managerit i ndalohet gjithmonë).
// Nëse përdoruesi ka shitje (bookings me bookingUserId), fshirja bllokohet.
router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të fshijë përdorues" });
    return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id) || id === req.session.userId) {
    res.status(400).json({ error: "Nuk mund të fshini llogarinë tuaj" });
    return;
  }
  const deletion = await db.transaction(async (tx) => {
    // Serialize admin deletion/demotion decisions. Without this lock, two
    // admins could concurrently delete each other after both counted two.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(707001)`);

    const [target] = await tx.select({ role: bookingUsersTable.role })
      .from(bookingUsersTable)
      .where(eq(bookingUsersTable.id, id));
    if (!target) return { status: 404, error: "Përdoruesi nuk u gjet" };

    if (target.role === "admin") {
      const [{ adminCount }] = await tx.select({ adminCount: count() })
        .from(bookingUsersTable)
        .where(eq(bookingUsersTable.role, "admin"));
      if (Number(adminCount) <= 1) {
        return { status: 409, error: "Administratori i fundit nuk mund të fshihet" };
      }
    }

    const [{ salesCount }] = await tx
      .select({ salesCount: count() })
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingUserId, id));
    if (Number(salesCount) > 0) {
      return { status: 409, error: `Ky përdorues ka ${salesCount} shitje të regjistruara dhe nuk mund të fshihet.` };
    }
    await tx.delete(bookingUsersTable).where(eq(bookingUsersTable.id, id));
    return { status: 200, error: "" };
  });
  if (deletion.status !== 200) {
    res.status(deletion.status).json({ error: deletion.error });
    return;
  }
  res.json({ ok: true });
});

// PATCH /admin/users/:id — ndryshim i të dhënave të login-it (email, emër, kompani, telefon).
// Prek VETËM booking_users (llogaria e login-it); profili i agjencisë te "Agjentët"
// (agents.email etj., i përdorur për njoftime) mbetet i paprekur dhe ndryshohet aty.
router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  if (!(await canManageUsers(req))) {
    res.status(403).json({ error: "Nuk keni leje për këtë veprim" });
    return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID i pavlefshëm" }); return; }
  const { email, name, company, phone } = req.body ?? {};
  const newEmail = typeof email === "string" ? email.trim() : "";
  const newName = typeof name === "string" ? name.trim() : "";
  if (!newEmail || !newName) {
    res.status(400).json({ error: "Emri dhe emaili janë të detyrueshëm" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    res.status(400).json({ error: "Emaili nuk është i vlefshëm" });
    return;
  }
  const guard = await canMutateTargetUser(req, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
  // Emaili duhet të jetë unik (përjashto vetë përdoruesin).
  const dup = await db.select({ id: bookingUsersTable.id })
    .from(bookingUsersTable)
    .where(and(eq(bookingUsersTable.email, newEmail), ne(bookingUsersTable.id, id)));
  if (dup.length > 0) {
    res.status(409).json({ error: "Ky email përdoret tashmë nga një përdorues tjetër" });
    return;
  }
  const [updated] = await db.update(bookingUsersTable).set({
    email: newEmail,
    name: newName,
    company: typeof company === "string" && company.trim() !== "" ? company.trim() : null,
    phone: typeof phone === "string" && phone.trim() !== "" ? phone.trim() : null,
  }).where(eq(bookingUsersTable.id, id)).returning();
  res.json({
    id: updated.id, email: updated.email, name: updated.name, role: updated.role,
    company: updated.company, phone: updated.phone,
    isApproved: updated.isApproved, createdAt: updated.createdAt,
  });
});

// PATCH /admin/users/:id/password — ndryshim fjalëkalimi
router.patch("/admin/users/:id/password", async (req, res): Promise<void> => {
  if (!(await canManageUsers(req))) {
    res.status(403).json({ error: "Nuk keni leje për këtë veprim" });
    return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID i pavlefshëm" }); return; }
  const guard = await canMutateTargetUser(req, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Fjalëkalimi duhet të ketë së paku 6 karaktere" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(bookingUsersTable).set({ passwordHash }).where(eq(bookingUsersTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/citizenplane/import", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.role || !["admin", "manager"].includes(session.role)) {
    res.status(403).json({ error: "Nuk keni leje për këtë veprim" });
    return;
  }
  try {
    const result = await runCitizenPlaneImport();
    res.json({
      ok: result.ok,
      filesProcessed: result.filesProcessed,
      bookingsCreated: result.bookingsCreated,
      errors: result.errors,
      message: result.errors.length === 0
        ? `Import u krye me sukses: ${result.bookingsCreated} rezervime nga ${result.filesProcessed} skedarë`
        : `Import u krye me ${result.errors.length} gabime`,
    });
  } catch (err: any) {
    // Connection/auth failures propagate here for accurate error reporting
    res.status(500).json({ ok: false, error: "Gabim gjatë lidhjes SFTP", detail: err?.message ?? String(err) });
  }
});

export default router;
