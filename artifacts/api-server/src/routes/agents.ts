import { buildAgentActivityPdf, readableActivity, activityDayRange } from "../lib/agentActivityReport";
import { Router, type IRouter } from "express";
import { eq, sql, ilike, or, desc, and, inArray } from "drizzle-orm";
import { db, agentsTable, agencyGroupsTable, bookingsTable, flightsTable, agentCreditTransactionsTable, paymentsTable, passengersTable, agentActivityTable, paymentMethodsTable } from "@workspace/db";
import ExcelJS from "exceljs";
import {
  ListAgentsQueryParams,
  CreateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  UpdateAgentBody,
  DeleteAgentParams,
} from "@workspace/api-zod";
import { getSplitNetTotalsMap, calcCombinedNetAndCommission } from "../lib/getFullBooking.js";
import { nextCreditInvoiceCode, buildCreditInvoicePdf } from "../lib/invoice.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { roundWholeEuro, wholeEuroDue } from "../lib/money.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const paymentsUploadDir = path.join(__dirname, "..", "uploads", "payments");
fs.mkdirSync(paymentsUploadDir, { recursive: true });

const ALLOWED_DOC_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const paymentDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, paymentsUploadDir),
  filename: (_req, file, cb) => {
    // Normalize extension from the validated MIME type — never trust originalname.
    const ext = ALLOWED_DOC_MIME[file.mimetype] || ".bin";
    cb(null, `pay-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const uploadPaymentDoc = multer({
  storage: paymentDocStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME[file.mimetype]) { cb(null, true); return; }
    cb(new Error("Lloji i skedarit nuk lejohet (vetëm PDF, JPG, PNG, WEBP)"));
  },
});

// Wrap multer so upload/validation errors return a clean 400 instead of crashing.
function uploadPaymentDocSafe(req: any, res: any, next: any): void {
  uploadPaymentDoc.single("document")(req, res, (err: any) => {
    if (err) { res.status(400).json({ error: err.message || "Ngarkimi i skedarit dështoi" }); return; }
    next();
  });
}

const router: IRouter = Router();

function formatAgent(a: typeof agentsTable.$inferSelect, totalBookings = 0, totalSales = 0, totalPaid = 0, totalCommission = 0, totalPassengers = 0, groupName: string | null = null) {
  const sales = Number(totalSales);
  const paid = Number(totalPaid);
  const walletBalance = Number(a.walletBalance);
  // Gross debt (before wallet credits)
  const grossDebt = wholeEuroDue(sales, paid);
  // Real/net debt: what agent actually owes us after subtracting their wallet credits
  const netDebt = Math.max(0, grossDebt - walletBalance);
  // If wallet balance exceeds debt, agent has net credit with us
  const netCredit = Math.max(0, walletBalance - grossDebt);
  return {
    ...a,
    groupName,
    commission: Number(a.commission),
    markup: Number(a.markup),
    markupPercent: Number(a.markupPercent ?? 0),
    walletBalance,
    discountPercent: Number(a.discountPercent ?? 0),
    discountType: a.discountType ?? "percent",
    discountFixed: Number(a.discountFixed ?? 0),
    totalBookings,
    totalPassengers,
    totalSales: sales,
    totalPaid: paid,
    totalCommission: Math.round(Number(totalCommission) * 100) / 100,
    grossDebt,
    totalDebt: netDebt,
    netCredit,
    createdAt: a.createdAt.toISOString(),
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
  };
}

async function groupNamesForAgents(agents: (typeof agentsTable.$inferSelect)[]): Promise<Map<number, string>> {
  const ids = [...new Set(agents.map(agent => agent.groupId).filter((id): id is number => id !== null))];
  if (!ids.length) return new Map();
  const rows = await db.select().from(agencyGroupsTable).where(inArray(agencyGroupsTable.id, ids));
  return new Map(rows.map(row => [row.id, row.name]));
}

function touchesAgentProfile(data: Record<string, any>): boolean {
  return ["name", "company", "email", "financeEmail", "phone", "displayColor"].some(field => data[field] !== undefined);
}

function validGroupId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

// Non-admin users can be blocked from seeing an agent's contact info (email/phone)
// via the per-agent `showContactToUsers` toggle. Admins always see it. Enforced
// server-side so a direct API call can't bypass the frontend gate.
function maskAgentContact<T extends { email: string; phone: string | null; financeEmail?: string | null; showContactToUsers?: boolean }>(
  agent: T,
  isAdmin: boolean,
): T {
  let out: any = agent;
  if (!isAdmin && agent.showContactToUsers === false) {
    out = { ...out, email: "", phone: null, financeEmail: null };
  }
  // displayColor is intentionally shared: it is presentation metadata, not contact data.
  // Visit tracking (loginCount / lastLoginAt) and the hidden-flight visibility
  // override (seesHiddenFlights) are admin-only. Strip them for any non-admin
  // caller so managers/staff/agents can't read them via direct API.
  if (!isAdmin) {
    out = { ...out };
    delete out.loginCount;
    delete out.lastLoginAt;
    delete out.seesHiddenFlights;
    delete out.weeklyDebtReport;
  }
  return out;
}

router.get("/agents", async (req, res): Promise<void> => {
  const parsed = ListAgentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let query = db.select().from(agentsTable).$dynamic();

  const isAdmin = (req as any).session?.role === "admin";

  const conditions = [];
  if (parsed.data.status) {
    conditions.push(eq(agentsTable.status, parsed.data.status));
  }
  if (parsed.data.search && parsed.data.search.trim()) {
    const term = `%${parsed.data.search.trim()}%`;
    const searchConds = [
      ilike(agentsTable.name, term),
      ilike(agentsTable.company, term),
    ];
    // Email/phone are contact info: non-admins may only match them on agents
    // whose contact is visible to users. Otherwise search becomes an oracle that
    // leaks a hidden agent's email/phone substring-by-substring.
    if (isAdmin) {
      searchConds.push(ilike(agentsTable.email, term));
      searchConds.push(ilike(agentsTable.phone, term));
    } else {
      searchConds.push(and(ilike(agentsTable.email, term), eq(agentsTable.showContactToUsers, true))!);
      searchConds.push(and(ilike(agentsTable.phone, term), eq(agentsTable.showContactToUsers, true))!);
    }
    conditions.push(or(...searchConds)!);
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const agents = await query.orderBy(agentsTable.name);

  if (agents.length === 0) {
    res.json([]);
    return;
  }

  const agentIds = agents.map(a => a.id);
  const dateType = parsed.data.dateType ?? "created";
  const dateFrom = parsed.data.dateFrom;
  const dateTo = parsed.data.dateTo;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    res.status(400).json({ error: "Data Nga nuk mund të jetë pas datës Deri." });
    return;
  }

  // The same period predicate is applied to every aggregate below so booking,
  // passenger, sales, paid, debt and commission totals always stay aligned.
  const bookingPeriodConditions = [];
  if (dateType === "flight") {
    if (dateFrom) {
      bookingPeriodConditions.push(sql`EXISTS (
        SELECT 1 FROM ${flightsTable} AS period_flight
        WHERE period_flight.id = ${bookingsTable.flightId}
          AND period_flight.departure_date >= ${dateFrom}
      )`);
    }
    if (dateTo) {
      bookingPeriodConditions.push(sql`EXISTS (
        SELECT 1 FROM ${flightsTable} AS period_flight
        WHERE period_flight.id = ${bookingsTable.flightId}
          AND period_flight.departure_date <= ${dateTo}
      )`);
    }
  } else {
    // Booking timestamps are stored with timezone; convert to Albania's calendar
    // date so the inclusive filter matches what users see in the UI.
    if (dateFrom) {
      bookingPeriodConditions.push(
        sql`(${bookingsTable.createdAt} AT TIME ZONE 'Europe/Tirane')::date >= ${dateFrom}::date`,
      );
    }
    if (dateTo) {
      bookingPeriodConditions.push(
        sql`(${bookingsTable.createdAt} AT TIME ZONE 'Europe/Tirane')::date <= ${dateTo}::date`,
      );
    }
  }

  // SQL GROUP BY aggregation — avoids loading all booking rows into memory
  const [bookingStats, paxStats, minimalBookings] = await Promise.all([
    // Booking count + total sales per agent (SQL GROUP BY)
    db.select({
      agentId:     bookingsTable.agentId,
      totalBookings: sql<string>`COUNT(*)::text`,
      totalSales:    sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
      totalPaid:     sql<string>`COALESCE(SUM(LEAST(${bookingsTable.paidAmount}::numeric, ${bookingsTable.totalAmount}::numeric)), 0)::text`,
    })
      .from(bookingsTable)
      .where(and(
        sql`${bookingsTable.status} != 'cancelled'`,
        inArray(bookingsTable.agentId, agentIds),
        ...bookingPeriodConditions,
      ))
      .groupBy(bookingsTable.agentId),

    // Passenger count per agent (join bookings → passengers, GROUP BY agentId)
    db.select({
      agentId: bookingsTable.agentId,
      cnt:     sql<string>`COUNT(${passengersTable.id})::text`,
    })
      .from(bookingsTable)
      .innerJoin(
        passengersTable,
        and(
          eq(passengersTable.bookingId, bookingsTable.id),
          eq(passengersTable.cancelled, false),
        ),
      )
      .where(and(
        sql`${bookingsTable.status} != 'cancelled'`,
        inArray(bookingsTable.agentId, agentIds),
        ...bookingPeriodConditions,
      ))
      .groupBy(bookingsTable.agentId),

    // Minimal booking rows needed for commission calc (only id + netPrice + markup + totalAmount)
    db.select({
      id:          bookingsTable.id,
      agentId:     bookingsTable.agentId,
      totalAmount: bookingsTable.totalAmount,
      netPrice:    bookingsTable.netPrice,
      markup:      bookingsTable.markup,
    })
      .from(bookingsTable)
      .where(and(
        sql`${bookingsTable.status} != 'cancelled'`,
        inArray(bookingsTable.agentId, agentIds),
        ...bookingPeriodConditions,
      )),
  ]);

  // Build lookup maps
  const statsMap  = new Map(bookingStats.map(r => [r.agentId!, r]));
  const paxMap    = new Map(paxStats.map(r => [r.agentId!, Number(r.cnt)]));

  // Commission requires split net prices — fetch once for all relevant bookings
  const allBookingIds = minimalBookings.map(b => b.id);
  const splitNetMap   = await getSplitNetTotalsMap(allBookingIds);

  // Group minimal bookings by agentId for commission reduction
  const bookingsByAgent = new Map<number, typeof minimalBookings>();
  for (const b of minimalBookings) {
    if (b.agentId == null) continue;
    const arr = bookingsByAgent.get(b.agentId) ?? [];
    arr.push(b);
    bookingsByAgent.set(b.agentId, arr);
  }

  const groupNames = await groupNamesForAgents(agents);
  const result = agents.map(agent => {
    const stats        = statsMap.get(agent.id);
    const totalBookings   = stats ? Number(stats.totalBookings) : 0;
    const totalSales      = stats ? Number(stats.totalSales) : 0;
    const totalPaid       = stats ? Number(stats.totalPaid) : 0;
    const totalPassengers = paxMap.get(agent.id) ?? 0;

    const agentBookings = bookingsByAgent.get(agent.id) ?? [];
    const totalCommission = agentBookings.reduce((s, b) => {
      const { commission } = calcCombinedNetAndCommission(
        Number(b.totalAmount),
        b.netPrice != null ? Number(b.netPrice) : null,
        splitNetMap.get(b.id) ?? 0,
        Number(b.markup),
      );
      return s + commission;
    }, 0);

    return formatAgent(agent, totalBookings, totalSales, totalPaid, totalCommission, totalPassengers, groupNames.get(agent.groupId ?? -1) ?? null);
  });

  res.json(result.map(a => maskAgentContact(a, isAdmin)));
});

router.post("/agents", async (req, res): Promise<void> => {
  if ((req as any).session?.role !== "admin") {
    res.status(403).json({ error: "Only an admin can create an agency and assign its group" }); return;
  }
  if (!validGroupId(req.body?.groupId)) {
    res.status(400).json({ error: "Group assignment is required for a new agency" }); return;
  }
  const [group] = await db.select().from(agencyGroupsTable).where(eq(agencyGroupsTable.id, req.body.groupId));
  if (!group) { res.status(400).json({ error: "Group not found" }); return; }
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const extra: Record<string, any> = {};
  if (req.body.discountPercent !== undefined) extra.discountPercent = String(req.body.discountPercent);
  if (req.body.discountType !== undefined) extra.discountType = req.body.discountType;
  if (req.body.discountFixed !== undefined) extra.discountFixed = String(req.body.discountFixed);
  if (req.body.markupPercent !== undefined) extra.markupPercent = String(req.body.markupPercent);

  const [agent] = await db.insert(agentsTable).values({ ...parsed.data, ...extra, groupId: group.id } as any).returning();
  const isAdmin = (req as any).session?.role === "admin";
  res.status(201).json(maskAgentContact(formatAgent(agent, 0, 0, 0, 0, 0, group.name), isAdmin));
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, params.data.id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const agentBookings = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.agentId, agent.id), sql`status != 'cancelled'`));
  const agentBookingIds = agentBookings.map(b => b.id);
  const agentSplitNetMap = await getSplitNetTotalsMap(agentBookingIds);
  const totalBookings = agentBookings.length;
  const totalPassengers = agentBookingIds.length
    ? Number((await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(passengersTable)
        .where(and(
          sql`${passengersTable.bookingId} IN (${sql.join(agentBookingIds.map(id => sql`${id}`), sql`, `)})`,
          eq(passengersTable.cancelled, false),
        )))[0]?.cnt ?? 0)
    : 0;
  const totalSales = agentBookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalPaid = agentBookings.reduce((s, b) => s + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
  const totalCommission = agentBookings.reduce((s, b) => {
    const { commission } = calcCombinedNetAndCommission(
      Number(b.totalAmount),
      b.netPrice != null ? Number(b.netPrice) : null,
      agentSplitNetMap.get(b.id) ?? 0,
      Number(b.markup)
    );
    return s + commission;
  }, 0);

  const isAdmin = (req as any).session?.role === "admin";
  const groupNames = await groupNamesForAgents([agent]);
  res.json(maskAgentContact(formatAgent(agent, totalBookings, totalSales, totalPaid, totalCommission, totalPassengers, groupNames.get(agent.groupId ?? -1) ?? null), isAdmin));
});

router.patch("/agents/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Accept both validated body + extra fields (discountType, discountFixed, discountPercent)
  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const isAdmin = (req as any).session?.role === "admin";
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "groupId") && !isAdmin) {
    res.status(403).json({ error: "Only an admin may reassign an agency group" }); return;
  }
  const profileEdit = touchesAgentProfile(parsed.data);
  let groupId: number | undefined;
  if (isAdmin && (profileEdit || Object.prototype.hasOwnProperty.call(req.body ?? {}, "groupId"))) {
    if (!validGroupId(req.body?.groupId)) {
      res.status(400).json({ error: "Group assignment is required for profile edits" }); return;
    }
    const [group] = await db.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable)
      .where(eq(agencyGroupsTable.id, req.body.groupId));
    if (!group) { res.status(400).json({ error: "Group not found" }); return; }
    groupId = group.id;
  }

  const extra: Record<string, any> = {};
  if (req.body.discountPercent !== undefined) extra.discountPercent = String(req.body.discountPercent);
  if (req.body.discountType !== undefined) extra.discountType = req.body.discountType;
  if (req.body.discountFixed !== undefined) extra.discountFixed = String(req.body.discountFixed);
  if (req.body.markupPercent !== undefined) extra.markupPercent = String(req.body.markupPercent);

  // `showInReports` / `showContactToUsers` / `managerCanEdit` are admin-only
  // controls, so strip them for any non-admin caller (managers included).
  const data: Record<string, any> = { ...parsed.data };
  if (!isAdmin) {
    delete data.showInReports;
    delete data.showContactToUsers;
    delete data.managerCanEdit;
    delete data.seesHiddenFlights;
    // Raporti javor i detyrimeve — selektohet vetëm nga admini.
    delete data.weeklyDebtReport;
    // Aktivizimi / çaktivizimi i agjentit (status) është vetëm për adminët.
    delete data.status;

    // Per-agent edit lock: when an admin has turned OFF "manager can edit" for
    // this agent, non-admin callers may not modify its profile fields (the
    // "Modifiko" dialog: name / company / email / phone). Enforced server-side
    // so a direct API call can't bypass the hidden button on the frontend.
    if (profileEdit) {
      const [current] = await db
        .select({ managerCanEdit: agentsTable.managerCanEdit, groupId: agentsTable.groupId })
        .from(agentsTable)
        .where(eq(agentsTable.id, params.data.id));
      if (current && current.managerCanEdit === false) {
        res.status(403).json({ error: "Nuk keni leje të editoni të dhënat e këtij agjenti." });
        return;
      }
      if (current && current.groupId === null) {
        res.status(403).json({ error: "This agency needs an admin to assign a group before profile edits." }); return;
      }
    }
  }

  const [agent] = await db
    .update(agentsTable)
    .set({ ...data, ...extra, ...(groupId !== undefined ? { groupId } : {}) })
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const groupNames = await groupNamesForAgents([agent]);
  res.json(maskAgentContact(formatAgent(agent, 0, 0, 0, 0, 0, groupNames.get(agent.groupId ?? -1) ?? null), isAdmin));
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(agentsTable).where(eq(agentsTable.id, params.data.id));
  res.sendStatus(204);
});

// ── Agent activity log (admin only) ───────────────────────────────────────────
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  login: "Hyrje",
  pageview: "Faqe",
  action: "API historike",
  api: "Kërkesë API",
  click: "Klikim",
  search: "Kërkim",
};

function fmtTirane(d: Date): string {
  const dt = new Date(d);
  // Data si më parë; ora shfaqet 12-orëshe me AM/PM (vetëm paraqitje).
  return dt.toLocaleDateString("sq-AL", {
    timeZone: "Europe/Tirane",
    day: "2-digit", month: "2-digit", year: "numeric",
  }) + ", " + dt.toLocaleTimeString("en-US", {
    timeZone: "Europe/Tirane",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// Paginated activity for the in-app dialog.
router.get("/agents/:id/activity", async (req, res): Promise<void> => {
  if ((req as any).session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const typeFilter = typeof req.query.type === "string" && req.query.type !== "all" ? req.query.type : null;

  const where = typeFilter
    ? and(eq(agentActivityTable.agentId, id), eq(agentActivityTable.type, typeFilter))
    : eq(agentActivityTable.agentId, id);

  const [rows, [{ cnt }]] = await Promise.all([
    db.select().from(agentActivityTable).where(where).orderBy(desc(agentActivityTable.createdAt)).limit(limit).offset(offset),
    db.select({ cnt: sql<number>`count(*)::int` }).from(agentActivityTable).where(where),
  ]);

  res.json({ rows: rows.map(row => ({ ...row, description: readableActivity(row) })), total: Number(cnt) });
});

let activityPdfDownloads = 0;
router.get("/agents/:id/activity/pdf", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Agjent i pavlefshëm" }); return; }
  const day = typeof req.query.day === "string" ? req.query.day : undefined;
  try { if (day) activityDayRange(day); } catch { res.status(400).json({ error: "Datë e pavlefshme" }); return; }
  const type = typeof req.query.type === "string" ? req.query.type : "all";
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agjenti nuk u gjet" }); return; }
  if (activityPdfDownloads >= 2) { res.status(429).json({ error: "Raporte duke u përgatitur; provoni pak më vonë." }); return; }
  activityPdfDownloads++;
  try {
    const pdf = await buildAgentActivityPdf(id, agent.name, day, type);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="aktiviteti-${id}${day ? `-${day}` : ""}.pdf"`);
    res.send(pdf);
  } finally { activityPdfDownloads--; }
});

// Excel export of the full activity log for one agent.
router.get("/agents/:id/activity/export", async (req, res): Promise<void> => {
  if ((req as any).session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const rows = await db.select().from(agentActivityTable)
    .where(eq(agentActivityTable.agentId, id))
    .orderBy(desc(agentActivityTable.createdAt))
    .limit(20000);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aktiviteti");
  ws.columns = [
    { header: "Data & Ora", key: "ts", width: 20 },
    { header: "Lloji", key: "type", width: 12 },
    { header: "Veprimi", key: "desc", width: 38 },
    { header: "Metoda", key: "method", width: 10 },
    { header: "Rruga", key: "path", width: 34 },
    { header: "Statusi", key: "status", width: 10 },
    { header: "IP", key: "ip", width: 20 },
    { header: "Pajisja / Shfletuesi", key: "ua", width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const r of rows) {
    ws.addRow({
      ts: fmtTirane(r.createdAt),
      type: ACTIVITY_TYPE_LABEL[r.type] ?? r.type,
      desc: readableActivity(r),
      method: r.method ?? "",
      path: r.path ?? "",
      status: r.statusCode ?? "",
      ip: r.ip ?? "",
      ua: r.userAgent ?? "",
    });
  }

  const safeName = (agent.company || agent.name || `agent_${id}`).replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="aktiviteti_${safeName}_${date}.xlsx"`);
  await wb.xlsx.write(res);
});

// Download the credit invoice PDF for a deposit / surplus (tepricë) transaction.
router.get("/agents/credits/:txnId/invoice", async (req, res): Promise<void> => {
  const txnId = parseInt(req.params.txnId, 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid txnId" }); return; }

  const result = await buildCreditInvoicePdf(txnId);
  if (!result) {
    res.status(404).json({ error: "Nuk u gjet fatura e kreditit për këtë veprim" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.buffer);
});

router.get("/agents/:id/credits", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const creditTxns = await db.select().from(agentCreditTransactionsTable)
    .where(eq(agentCreditTransactionsTable.agentId, id))
    .orderBy(desc(agentCreditTransactionsTable.createdAt));

  // Also fetch direct booking payments (cash/bank/card) for this agent's bookings
  const agentBookings = await db.select({ id: bookingsTable.id, bookingRef: bookingsTable.bookingRef })
    .from(bookingsTable).where(eq(bookingsTable.agentId, id));

  const bookingPayments: any[] = [];
  for (const b of agentBookings) {
    const pmts = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, b.id));
    for (const p of pmts) {
      if (!p.status || p.status !== "completed") continue;
      // Skip credit-method payments — they are already represented as agentCreditTransactions (type=payment)
      if (p.method === "credit") continue;
      // Skip internal KREDIT-AUTO refund entries — they are already in agentCreditTransactions (type=credit)
      if (p.isRefund && p.reference === "KREDIT-AUTO") continue;
      bookingPayments.push({
        id: `pay_${p.id}`,
        agentId: id,
        type: p.isRefund ? "refund" : "payment",
        amount: Number(p.amount),
        bookingId: b.id,
        bookingRef: b.bookingRef,
        reference: p.reference ?? null,
        notes: `${p.isRefund ? "Rimbursim" : "Pagesë"} direkte (${p.method})${p.notes ? " — " + p.notes : ""}`,
        createdAt: p.createdAt.toISOString(),
        source: "payment",
        method: p.method,
        invoiceCode: p.invoiceCode ?? null,
        batchId: p.batchId ?? null,
        payerType: p.payerType ?? null,
        confirmed: p.confirmed,
        _rawNotes: p.notes ?? null,
      });
    }
  }

  // Order by createdAt so the first member of each batch is the earliest → its
  // invoiceCode/timestamp is the stable representative (matches the ledger page).
  bookingPayments.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  // Collapse mass payments (same batchId) into one total line with the per-ticket
  // breakdown (already in the summary note) + a batch-invoice download.
  const groupedPayments: any[] = [];
  const batchSeen = new Map<string, number>();
  for (const r of bookingPayments) {
    if (r.batchId) {
      const idx = batchSeen.get(r.batchId);
      if (idx === undefined) {
        batchSeen.set(r.batchId, groupedPayments.length);
        groupedPayments.push({
          id: `batch_${r.batchId}`,
          agentId: id,
          type: "payment",
          amount: r.amount,
          bookingId: null,
          bookingRef: null,
          reference: r.reference,
          notes: r._rawNotes || r.notes, // summary note carries the KTF.. €X split
          createdAt: r.createdAt,
          source: "payment",
          method: r.method,
          invoiceCode: r.invoiceCode,
          batchId: r.batchId,
          _batch: true,
          _count: 1,
          _members: [r],
        });
      } else {
        const agg = groupedPayments[idx];
        agg.amount += r.amount;
        agg._count += 1;
        agg._members.push(r);
      }
    } else {
      groupedPayments.push(r);
    }
  }
  for (const g of groupedPayments) {
    if (g._batch) g.bookingRef = `${g._count} bileta`;
  }

  const creditTxnsMapped = creditTxns.map(t => ({
    ...t,
    amount: Number(t.amount),
    createdAt: t.createdAt.toISOString(),
    source: "wallet",
    method: t.paymentMethod ?? null,
  }));

  // Merge and sort by date descending
  const allTxns = [...creditTxnsMapped, ...groupedPayments]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    balance: Number(agent.walletBalance),
    transactions: allTxns,
  });
});

router.post("/agents/:id/credits/deposit", uploadPaymentDocSafe, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { amount, reference, notes } = req.body;
  const paymentMethod = typeof req.body?.paymentMethod === "string"
    ? req.body.paymentMethod.trim()
    : "";
  const amt = roundWholeEuro(Number(amount));
  if (!Number.isFinite(amt) || amt === 0) { res.status(400).json({ error: "Shuma duhet të jetë një numër jo zero." }); return; }
  if (!paymentMethod) { res.status(400).json({ error: "Mënyra e pagesës është e detyrueshme." }); return; }

  const [validPaymentMethod] = await db.select({ name: paymentMethodsTable.name })
    .from(paymentMethodsTable)
    .where(and(
      eq(paymentMethodsTable.name, paymentMethod),
      eq(paymentMethodsTable.active, true),
    ))
    .limit(1);
  if (!validPaymentMethod) {
    res.status(400).json({ error: "Mënyra e pagesës nuk është aktive ose nuk ekziston." });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const documentUrl = req.file ? `/api/uploads/payments/${req.file.filename}` : null;

  const invoiceCode = await nextCreditInvoiceCode();
  const [updated] = await db.transaction(async (tx) => {
    await tx.insert(agentCreditTransactionsTable).values({
      agentId: id,
      type: "deposit",
      amount: String(amt),
      paymentMethod,
      reference: reference || null,
      notes: notes || null,
      documentUrl,
      invoiceCode,
    });

    return tx.update(agentsTable)
      .set({ walletBalance: sql`${agentsTable.walletBalance} + ${amt}::numeric` })
      .where(eq(agentsTable.id, id))
      .returning();
  });

  const isAdmin = (req as any).session?.role === "admin";
  res.json({ balance: Number(updated.walletBalance), agent: maskAgentContact(formatAgent(updated), isAdmin) });
});

export default router;
