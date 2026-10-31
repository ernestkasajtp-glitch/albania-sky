import { Router, type IRouter } from "express";
import { eq, and, or, desc, asc, sql, isNull, inArray, gte, lte, ilike } from "drizzle-orm";
import {
  db, tasksTable, taskCommentsTable, taskActivityTable, taskLabelsTable, taskNotificationsTable,
  bookingUsersTable, bookingsTable, agentsTable, flightsTable, groupTicketsTable,
} from "@workspace/db";

const router: IRouter = Router();

const FMS_ROLES = ["admin", "manager", "agent_staff"];

function requireFMS(req: any, res: any, next: any) {
  if (!req.session?.userId || !FMS_ROLES.includes(req.session.role || "")) {
    res.status(401).json({ error: "Jo i autentikuar" }); return;
  }
  next();
}

// Non-admins may only see/touch tasks they are linked to (assignee, creator or
// watcher). Admin can access every task.
function canAccessTask(session: any, task: any): boolean {
  if (session?.role === "admin") return true;
  const uid = session?.userId;
  const watchers = Array.isArray(task?.watchers) ? task.watchers.map(Number) : [];
  return task?.assigneeId === uid || task?.creatorId === uid || watchers.includes(uid);
}

const VALID_STATUS = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];
const VALID_PRIORITY = ["none", "low", "medium", "high", "urgent"];
const VALID_ENTITY = ["booking", "agent", "flight", "group_ticket"];

function serializeTask(t: any) {
  return {
    ...t,
    dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : t.dueDate,
    completedAt: t.completedAt instanceof Date ? t.completedAt.toISOString() : t.completedAt,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

async function logActivity(taskId: number, userId: number | null, userName: string | null, action: string, meta: any = {}) {
  await db.insert(taskActivityTable).values({ taskId, userId, userName, action, meta });
}

async function notifyUsers(userIds: number[], taskId: number, type: string, title: string, body?: string) {
  if (userIds.length === 0) return;
  const rows = userIds.map(uid => ({ userId: uid, taskId, type, title, body: body || null }));
  await db.insert(taskNotificationsTable).values(rows);
}

async function enrichTaskEntity(task: any) {
  if (!task.entityType || !task.entityId) return { ...task, entity: null };
  const map = await enrichTasksEntities([task]);
  return { ...task, entity: map.get(`${task.entityType}:${task.entityId}`) ?? null };
}

async function enrichTasksEntities(tasks: any[]): Promise<Map<string, any>> {
  const buckets: Record<string, Set<number>> = { booking: new Set(), agent: new Set(), flight: new Set(), group_ticket: new Set() };
  for (const t of tasks) {
    if (t.entityType && t.entityId && buckets[t.entityType]) buckets[t.entityType].add(Number(t.entityId));
  }
  const out = new Map<string, any>();
  await Promise.all([
    (async () => {
      const ids = [...buckets.booking];
      if (ids.length === 0) return;
      const rows = await db.select({ id: bookingsTable.id, ref: bookingsTable.bookingRef, customer: bookingsTable.customerName, status: bookingsTable.status })
        .from(bookingsTable).where(inArray(bookingsTable.id, ids));
      for (const b of rows) out.set(`booking:${b.id}`, { type: "booking", id: b.id, label: b.ref, sublabel: b.customer, status: b.status });
    })(),
    (async () => {
      const ids = [...buckets.agent];
      if (ids.length === 0) return;
      const rows = await db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).where(inArray(agentsTable.id, ids));
      for (const a of rows) out.set(`agent:${a.id}`, { type: "agent", id: a.id, label: a.name });
    })(),
    (async () => {
      const ids = [...buckets.flight];
      if (ids.length === 0) return;
      const rows = await db.select({ id: flightsTable.id, route: sql<string>`concat(${flightsTable.fromCity}, ' → ', ${flightsTable.toCity})`, date: flightsTable.departureDate, airline: flightsTable.airline })
        .from(flightsTable).where(inArray(flightsTable.id, ids));
      for (const f of rows) out.set(`flight:${f.id}`, { type: "flight", id: f.id, label: f.route, sublabel: `${f.airline} • ${f.date}` });
    })(),
    (async () => {
      const ids = [...buckets.group_ticket];
      if (ids.length === 0) return;
      const rows = await db.select({ id: groupTicketsTable.id, dep: groupTicketsTable.departure, dest: groupTicketsTable.destination, date: groupTicketsTable.flightDate })
        .from(groupTicketsTable).where(inArray(groupTicketsTable.id, ids));
      for (const g of rows) out.set(`group_ticket:${g.id}`, { type: "group_ticket", id: g.id, label: `${g.dep} → ${g.dest}`, sublabel: g.date ?? undefined });
    })(),
  ]);
  return out;
}

// ── LIST ─────────────────────────────────────────────────────────────────────
// Lightweight sidebar badge: count assigned open tasks without loading and
// enriching the full task list on every layout poll.
router.get("/tasks/my-count", requireFMS, async (req, res): Promise<void> => {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(tasksTable)
    .where(and(
      eq(tasksTable.assigneeId, req.session.userId!),
      inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"]),
    ));
  res.json({ count: Number(row?.count ?? 0) });
});

router.get("/tasks", requireFMS, async (req, res): Promise<void> => {
  const { status, priority, assignee, mine, label, entityType, entityId, search, dueRange, includeDone } = req.query as any;

  const conds: any[] = [];
  if (mine === "1") {
    conds.push(eq(tasksTable.assigneeId, req.session.userId!));
  } else if (assignee) {
    if (assignee === "unassigned") conds.push(isNull(tasksTable.assigneeId));
    else conds.push(eq(tasksTable.assigneeId, Number(assignee)));
  }
  if (status) {
    const statuses = String(status).split(",").filter(s => VALID_STATUS.includes(s));
    if (statuses.length > 0) conds.push(inArray(tasksTable.status, statuses));
  } else if (includeDone !== "1") {
    conds.push(inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"]));
  }
  if (priority) {
    const prs = String(priority).split(",").filter(p => VALID_PRIORITY.includes(p));
    if (prs.length > 0) conds.push(inArray(tasksTable.priority, prs));
  }
  if (label) {
    conds.push(sql`${tasksTable.labels} @> ${JSON.stringify([label])}::jsonb`);
  }
  if (entityType && entityId) {
    conds.push(and(eq(tasksTable.entityType, String(entityType)), eq(tasksTable.entityId, Number(entityId))));
  }
  if (search) {
    conds.push(ilike(tasksTable.title, `%${search}%`));
  }
  const now = new Date();
  if (dueRange === "overdue") {
    conds.push(and(sql`${tasksTable.dueDate} IS NOT NULL`, lte(tasksTable.dueDate, now), inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"])));
  } else if (dueRange === "today") {
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    conds.push(and(gte(tasksTable.dueDate, new Date(now.toISOString().slice(0,10))), lte(tasksTable.dueDate, end)));
  } else if (dueRange === "week") {
    const wk = new Date(now); wk.setDate(wk.getDate() + 7);
    conds.push(and(gte(tasksTable.dueDate, now), lte(tasksTable.dueDate, wk)));
  } else if (dueRange === "none") {
    conds.push(isNull(tasksTable.dueDate));
  }

  // Visibility: non-admins only see tasks they are linked to (assignee, creator
  // or watcher). Admin sees every task.
  if (req.session.role !== "admin") {
    const uid = req.session.userId!;
    conds.push(or(
      eq(tasksTable.assigneeId, uid),
      eq(tasksTable.creatorId, uid),
      sql`${tasksTable.watchers} @> ${JSON.stringify([uid])}::jsonb`,
    ));
  }

  const rows = await db.select().from(tasksTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      sql`CASE ${tasksTable.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      sql`${tasksTable.dueDate} ASC NULLS LAST`,
      desc(tasksTable.createdAt),
    )
    .limit(500);

  const map = await enrichTasksEntities(rows);
  const enriched = rows.map(r => {
    const s = serializeTask(r);
    const e = (r.entityType && r.entityId) ? (map.get(`${r.entityType}:${r.entityId}`) ?? null) : null;
    return { ...s, entity: e };
  });
  res.json(enriched);
});

// ── GET ONE ──────────────────────────────────────────────────────────────────
router.get("/tasks/:id", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [t] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!t) { res.status(404).json({ error: "Task nuk u gjet" }); return; }
  // Visibility: non-admins can only open tasks they are linked to.
  if (!canAccessTask(req.session, t)) {
    res.status(403).json({ error: "Nuk keni qasje në këtë detyrë" }); return;
  }
  const enriched = await enrichTaskEntity(serializeTask(t));
  const [comments, activity, subtasks] = await Promise.all([
    db.select().from(taskCommentsTable).where(eq(taskCommentsTable.taskId, id)).orderBy(asc(taskCommentsTable.createdAt)),
    db.select().from(taskActivityTable).where(eq(taskActivityTable.taskId, id)).orderBy(desc(taskActivityTable.createdAt)).limit(100),
    db.select().from(tasksTable).where(eq(tasksTable.parentId, id)).orderBy(asc(tasksTable.position)),
  ]);
  res.json({
    ...enriched,
    comments: comments.map(c => ({ ...c, createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt })),
    activity: activity.map(a => ({ ...a, createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt })),
    subtasks: subtasks.filter(st => canAccessTask(req.session, st)).map(serializeTask),
  });
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post("/tasks", requireFMS, async (req, res): Promise<void> => {
  const { title, description, status, priority, assigneeId, dueDate, parentId, entityType, entityId, labels, watchers } = req.body || {};
  if (!title || typeof title !== "string" || !title.trim()) { res.status(400).json({ error: "title nevojitet" }); return; }
  if (status && !VALID_STATUS.includes(status)) { res.status(400).json({ error: "status i pavlefshëm" }); return; }
  if (priority && !VALID_PRIORITY.includes(priority)) { res.status(400).json({ error: "priority i pavlefshëm" }); return; }
  if (entityType && !VALID_ENTITY.includes(entityType)) { res.status(400).json({ error: "entityType i pavlefshëm" }); return; }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));

  const [created] = await db.insert(tasksTable).values({
    title: title.trim(),
    description: description || null,
    status: status || "todo",
    priority: priority || "medium",
    assigneeId: assigneeId ? Number(assigneeId) : null,
    creatorId: req.session.userId!,
    dueDate: dueDate ? new Date(dueDate) : null,
    parentId: parentId ? Number(parentId) : null,
    entityType: entityType || null,
    entityId: entityId ? Number(entityId) : null,
    labels: Array.isArray(labels) ? labels : [],
    watchers: Array.isArray(watchers) ? watchers.map(Number) : [],
  }).returning();

  await logActivity(created.id, req.session.userId!, user?.name || "", "created", { title: created.title });

  if (created.assigneeId && created.assigneeId !== req.session.userId) {
    await notifyUsers([created.assigneeId], created.id, "assigned", `Të është caktuar një detyrë: ${created.title}`);
  }

  res.status(201).json(serializeTask(created));
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.patch("/tasks/:id", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Task nuk u gjet" }); return; }
  if (!canAccessTask(req.session, existing)) {
    res.status(403).json({ error: "Nuk keni qasje në këtë detyrë" }); return;
  }

  const { title, description, status, priority, assigneeId, dueDate, labels, watchers, position, entityType, entityId } = req.body || {};
  const patch: any = {};
  if (title !== undefined) patch.title = String(title).trim();
  if (description !== undefined) patch.description = description || null;
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) { res.status(400).json({ error: "status i pavlefshëm" }); return; }
    patch.status = status;
    patch.completedAt = (status === "done") ? new Date() : null;
  }
  if (priority !== undefined) {
    if (!VALID_PRIORITY.includes(priority)) { res.status(400).json({ error: "priority i pavlefshëm" }); return; }
    patch.priority = priority;
  }
  if (assigneeId !== undefined) patch.assigneeId = assigneeId ? Number(assigneeId) : null;
  if (dueDate !== undefined) patch.dueDate = dueDate ? new Date(dueDate) : null;
  if (labels !== undefined) patch.labels = Array.isArray(labels) ? labels : [];
  if (watchers !== undefined) patch.watchers = Array.isArray(watchers) ? watchers.map(Number) : [];
  if (position !== undefined) patch.position = Number(position);
  if (entityType !== undefined) patch.entityType = entityType || null;
  if (entityId !== undefined) patch.entityId = entityId ? Number(entityId) : null;

  const aiExpectedStatus =
    req.headers["x-ai-action"] && typeof req.headers["x-ai-expected-status"] === "string"
      ? req.headers["x-ai-expected-status"]
      : null;
  const [updated] = await db
    .update(tasksTable)
    .set(patch)
    .where(
      aiExpectedStatus
        ? and(eq(tasksTable.id, id), eq(tasksTable.status, aiExpectedStatus))
        : eq(tasksTable.id, id),
    )
    .returning();
  if (!updated && aiExpectedStatus) {
    res.status(409).json({ error: "Detyra ndryshoi pas krijimit të propozimit." });
    return;
  }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
  const uname = user?.name || "";

  if (patch.status && patch.status !== existing.status) {
    await logActivity(id, req.session.userId!, uname, "status_changed", { from: existing.status, to: patch.status });
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== existing.assigneeId) {
    await logActivity(id, req.session.userId!, uname, "assignee_changed", { from: existing.assigneeId, to: patch.assigneeId });
    if (patch.assigneeId && patch.assigneeId !== req.session.userId) {
      await notifyUsers([patch.assigneeId], id, "assigned", `Të është caktuar një detyrë: ${updated.title}`);
    }
  }
  if (patch.priority && patch.priority !== existing.priority) {
    await logActivity(id, req.session.userId!, uname, "priority_changed", { from: existing.priority, to: patch.priority });
  }
  if (patch.title && patch.title !== existing.title) {
    await logActivity(id, req.session.userId!, uname, "title_changed", { from: existing.title, to: patch.title });
  }
  if (patch.dueDate !== undefined) {
    const oldD = existing.dueDate ? (existing.dueDate as any).toISOString?.() ?? existing.dueDate : null;
    const newD = patch.dueDate ? patch.dueDate.toISOString() : null;
    if (oldD !== newD) await logActivity(id, req.session.userId!, uname, "due_changed", { from: oldD, to: newD });
  }

  const enriched = await enrichTaskEntity(serializeTask(updated));
  res.json(enriched);
});

// ── BULK STATUS UPDATE ───────────────────────────────────────────────────────
// Set the same status on many tasks at once. Available to every FMS user, but
// each task is still gated by canAccessTask (non-admins only affect tasks they
// are linked to); inaccessible/no-op tasks are silently skipped.
router.post("/tasks/bulk-status", requireFMS, async (req, res): Promise<void> => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids nevojiten" }); return; }
  if (!status || !VALID_STATUS.includes(status)) { res.status(400).json({ error: "status i pavlefshëm" }); return; }
  const numIds = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n)))];
  if (numIds.length === 0) { res.status(400).json({ error: "ids të pavlefshme" }); return; }

  const rows = await db.select().from(tasksTable).where(inArray(tasksTable.id, numIds));
  const accessible = rows.filter((t) => canAccessTask(req.session, t));
  const toUpdate = accessible.filter((t) => t.status !== status);

  if (toUpdate.length > 0) {
    const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
    const uname = user?.name || "";
    const completedAt = status === "done" ? new Date() : null;
    const updIds = toUpdate.map((t) => t.id);
    await db.update(tasksTable).set({ status, completedAt }).where(inArray(tasksTable.id, updIds));
    await db.insert(taskActivityTable).values(
      toUpdate.map((t) => ({ taskId: t.id, userId: req.session.userId!, userName: uname, action: "status_changed", meta: { from: t.status, to: status } })),
    );
  }

  res.json({ ok: true, updated: toUpdate.length, requested: numIds.length, skipped: numIds.length - toUpdate.length });
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/tasks/:id", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [t] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!t) { res.status(404).json({ error: "Task nuk u gjet" }); return; }
  if (!canAccessTask(req.session, t)) {
    res.status(403).json({ error: "Nuk keni qasje në këtë detyrë" }); return;
  }
  const role = req.session.role;
  if (t.creatorId !== req.session.userId && role !== "admin" && role !== "manager") {
    res.status(403).json({ error: "Vetëm krijuesi, manager ose admin mund të fshijë" }); return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ ok: true });
});

// ── COMMENTS ─────────────────────────────────────────────────────────────────
router.post("/tasks/:id/comments", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { body, mentions } = req.body || {};
  if (!body || !String(body).trim()) { res.status(400).json({ error: "body nevojitet" }); return; }
  const [taskRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!taskRow) { res.status(404).json({ error: "Task nuk u gjet" }); return; }
  if (!canAccessTask(req.session, taskRow)) {
    res.status(403).json({ error: "Nuk keni qasje në këtë detyrë" }); return;
  }
  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
  const ment = Array.isArray(mentions) ? mentions.map(Number).filter(n => !isNaN(n)) : [];
  const [c] = await db.insert(taskCommentsTable).values({
    taskId: id,
    authorId: req.session.userId!,
    authorName: user?.name || "",
    body: String(body).trim(),
    mentions: ment,
  }).returning();
  await logActivity(id, req.session.userId!, user?.name || "", "commented", { snippet: String(body).slice(0, 120) });
  if (ment.length > 0) {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    await notifyUsers(ment.filter(u => u !== req.session.userId), id, "mentioned", `Të përmendi në detyrën: ${task?.title ?? ""}`, String(body).slice(0, 200));
  }
  res.status(201).json({ ...c, createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt });
});

router.delete("/tasks/:id/comments/:cid", requireFMS, async (req, res): Promise<void> => {
  const cid = Number(req.params.cid);
  const [c] = await db.select().from(taskCommentsTable).where(eq(taskCommentsTable.id, cid));
  if (!c) { res.status(404).json({ error: "Komenti nuk u gjet" }); return; }
  const [cTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, c.taskId));
  if (!cTask || !canAccessTask(req.session, cTask)) {
    res.status(403).json({ error: "Nuk keni qasje në këtë detyrë" }); return;
  }
  if (c.authorId !== req.session.userId && req.session.role !== "admin") { res.status(403).json({ error: "Vetëm autori ose admin mund të fshijë" }); return; }
  await db.delete(taskCommentsTable).where(eq(taskCommentsTable.id, cid));
  res.json({ ok: true });
});

// ── LABELS ───────────────────────────────────────────────────────────────────
router.get("/task-labels", requireFMS, async (_req, res): Promise<void> => {
  const rows = await db.select().from(taskLabelsTable).orderBy(asc(taskLabelsTable.name));
  res.json(rows);
});

router.post("/task-labels", requireFMS, async (req, res): Promise<void> => {
  const { name, color, description } = req.body || {};
  if (!name || !String(name).trim()) { res.status(400).json({ error: "name nevojitet" }); return; }
  try {
    const [l] = await db.insert(taskLabelsTable).values({
      name: String(name).trim(),
      color: color || "#64748b",
      description: description || null,
    }).returning();
    res.status(201).json(l);
  } catch (e: any) {
    res.status(409).json({ error: "Label me këtë emër ekziston" });
  }
});

router.patch("/task-labels/:id", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, color, description } = req.body || {};
  const patch: any = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (color !== undefined) patch.color = color;
  if (description !== undefined) patch.description = description || null;
  const [l] = await db.update(taskLabelsTable).set(patch).where(eq(taskLabelsTable.id, id)).returning();
  res.json(l);
});

router.delete("/task-labels/:id", requireFMS, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(taskLabelsTable).where(eq(taskLabelsTable.id, id));
  res.json({ ok: true });
});

// ── USERS (for assignee picker — staff only) ─────────────────────────────────
router.get("/tasks-meta/users", requireFMS, async (_req, res): Promise<void> => {
  const rows = await db.select({ id: bookingUsersTable.id, name: bookingUsersTable.name, role: bookingUsersTable.role })
    .from(bookingUsersTable)
    .where(inArray(bookingUsersTable.role, FMS_ROLES))
    .orderBy(asc(bookingUsersTable.name));
  res.json(rows);
});

// ── ENTITY COUNTS (active tasks linked per entity) ───────────────────────────
router.get("/tasks-meta/entity-counts", requireFMS, async (req, res): Promise<void> => {
  const entityType = String(req.query.entityType || "");
  if (!VALID_ENTITY.includes(entityType)) {
    res.status(400).json({ error: "entityType i pavlefshëm" });
    return;
  }
  const countConds: any[] = [
    eq(tasksTable.entityType, entityType),
    sql`${tasksTable.entityId} IS NOT NULL`,
    inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"]),
  ];
  // Non-admins only count tasks they are linked to.
  if (req.session.role !== "admin") {
    const uid = req.session.userId!;
    countConds.push(or(
      eq(tasksTable.assigneeId, uid),
      eq(tasksTable.creatorId, uid),
      sql`${tasksTable.watchers} @> ${JSON.stringify([uid])}::jsonb`,
    ));
  }
  const rows = await db
    .select({ entityId: tasksTable.entityId, c: sql<number>`count(*)` })
    .from(tasksTable)
    .where(and(...countConds))
    .groupBy(tasksTable.entityId);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.entityId != null) out[String(r.entityId)] = Number(r.c);
  }
  res.json(out);
});

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────
router.get("/tasks-notifications", requireFMS, async (req, res): Promise<void> => {
  const rows = await db.select().from(taskNotificationsTable)
    .where(eq(taskNotificationsTable.userId, req.session.userId!))
    .orderBy(desc(taskNotificationsTable.createdAt))
    .limit(50);
  res.json(rows.map(r => ({ ...r, readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt, createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt })));
});

router.post("/tasks-notifications/read", requireFMS, async (req, res): Promise<void> => {
  const { ids } = req.body || {};
  const now = new Date();
  if (Array.isArray(ids) && ids.length > 0) {
    await db.update(taskNotificationsTable).set({ readAt: now })
      .where(and(eq(taskNotificationsTable.userId, req.session.userId!), inArray(taskNotificationsTable.id, ids.map(Number))));
  } else {
    await db.update(taskNotificationsTable).set({ readAt: now })
      .where(and(eq(taskNotificationsTable.userId, req.session.userId!), isNull(taskNotificationsTable.readAt)));
  }
  res.json({ ok: true });
});

// ── STATS ────────────────────────────────────────────────────────────────────
router.get("/tasks-stats", requireFMS, async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const now = new Date();
  const [mine] = await db.select({ c: sql<number>`count(*)` }).from(tasksTable)
    .where(and(eq(tasksTable.assigneeId, uid), inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"])));
  const [overdue] = await db.select({ c: sql<number>`count(*)` }).from(tasksTable)
    .where(and(eq(tasksTable.assigneeId, uid), sql`${tasksTable.dueDate} IS NOT NULL`, lte(tasksTable.dueDate, now), inArray(tasksTable.status, ["backlog", "todo", "in_progress", "in_review"])));
  const [unread] = await db.select({ c: sql<number>`count(*)` }).from(taskNotificationsTable)
    .where(and(eq(taskNotificationsTable.userId, uid), isNull(taskNotificationsTable.readAt)));
  res.json({
    mineOpen: Number(mine?.c ?? 0),
    overdue: Number(overdue?.c ?? 0),
    unreadNotifs: Number(unread?.c ?? 0),
  });
});

export default router;
