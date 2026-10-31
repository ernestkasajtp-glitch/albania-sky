import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, claimsTable, claimBookingsTable, bookingsTable, flightsTable, passengersTable, type Claim } from "@workspace/db";
import { CreateClaimBody, UpdateClaimBody, LinkClaimBookingBody, ListClaimsQueryParams } from "@workspace/api-zod";
import { notifyDataChanged } from "../lib/liveEvents";

const router = Router();
class ClaimError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const run = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, _next: NextFunction) => {
    void handler(req, res).catch(err => {
      if (err instanceof ClaimError) { res.status(err.status).json({ error: err.message }); return; }
      req.log?.error({ err }, "Claim request failed");
      res.status(500).json({ error: "Kërkesa Claim dështoi. Provo përsëri." });
    });
  };
const positiveId = (value: unknown) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ClaimError(400, "Identifikues i pavlefshëm.");
  return id;
};
// Defense in depth: never accept booking-engine or partner identities, even if
// this router is mounted elsewhere later. Internal visibility matches bookings.
router.use("/claims", (req, res, next) => {
  const s = (req as any).session;
  if (!s?.userId || s.source === "be" || !["admin", "manager", "agent_staff"].includes(s.role)) {
    res.status(401).json({ error: "Kërkohet hyrja në sistemin e brendshëm." }); return;
  }
  next();
});

async function enrich(rows: Claim[]) {
  if (!rows.length) return [];
  const links = await db.select({
    claimId: claimBookingsTable.claimId,
    id: bookingsTable.id, bookingRef: bookingsTable.bookingRef,
    fromCity: flightsTable.fromCity, toCity: flightsTable.toCity,
    departureDate: flightsTable.departureDate, flightNumber: flightsTable.flightNumber,
  }).from(claimBookingsTable)
    .innerJoin(bookingsTable, eq(bookingsTable.id, claimBookingsTable.bookingId))
    .leftJoin(flightsTable, eq(flightsTable.id, bookingsTable.flightId))
    .where(inArray(claimBookingsTable.claimId, rows.map(r => r.id)))
    .orderBy(bookingsTable.id);
  const ids = [...new Set(links.map(l => l.id))];
  const pax = ids.length ? await db.select({
    bookingId: passengersTable.bookingId, id: passengersTable.id,
    firstName: passengersTable.firstName, lastName: passengersTable.lastName,
    cancelled: passengersTable.cancelled,
  }).from(passengersTable).where(inArray(passengersTable.bookingId, ids)).orderBy(passengersTable.id) : [];
  return rows.map(r => ({
    id: r.id, title: r.title, description: r.description, status: r.status,
    version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    bookings: links.filter(l => l.claimId === r.id).map(({ claimId: _, ...b }) => ({
      ...b, passengers: pax.filter(p => p.bookingId === b.id).map(({ bookingId: _, ...p }) => p),
    })),
  }));
}
async function findClaim(id: number) {
  const [row] = await db.select().from(claimsTable).where(eq(claimsTable.id, id));
  if (!row) throw new ClaimError(404, "Claim nuk u gjet.");
  return (await enrich([row]))[0];
}

router.get("/claims", run(async (req, res) => {
  const parsed = ListClaimsQueryParams.strict().safeParse(req.query);
  if (!parsed.success) throw new ClaimError(400, "Filtra të pavlefshëm.");
  const q = parsed.data;
  if (!Number.isSafeInteger(q.offset) || !Number.isSafeInteger(q.limit) || (q.bookingId !== undefined && !Number.isSafeInteger(q.bookingId))) {
    throw new ClaimError(400, "Filtra të pavlefshëm.");
  }
  const conditions = [];
  if (q.status) conditions.push(eq(claimsTable.status, q.status));
  if (q.bookingId) conditions.push(sql`exists (
    select 1 from claim_bookings cb where cb.claim_id = ${claimsTable.id} and cb.booking_id = ${q.bookingId}
  )`);
  if (q.search?.trim()) {
    // User text is a literal substring, not a SQL wildcard pattern.
    const term = `%${q.search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(
      ${claimsTable.title} ilike ${term} or ${claimsTable.description} ilike ${term} or
      exists (select 1 from claim_bookings cb join bookings b on b.id = cb.booking_id
        left join flights f on f.id = b.flight_id left join passengers p on p.booking_id = b.id
        where cb.claim_id = ${claimsTable.id} and (
          b.booking_ref ilike ${term} or f.from_city ilike ${term} or f.to_city ilike ${term}
          or f.flight_number ilike ${term} or f.departure_date::text ilike ${term}
          or concat_ws(' ', p.first_name, p.last_name) ilike ${term}
        ))
    )`);
  }
  const where = and(...conditions);
  const [rows, counts] = await Promise.all([
    db.select().from(claimsTable).where(where).orderBy(desc(claimsTable.createdAt), desc(claimsTable.id)).limit(q.limit).offset(q.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(claimsTable).where(where),
  ]);
  res.json({ items: await enrich(rows), total: counts[0].count });
}));

router.post("/claims", run(async (req, res) => {
  const parsed = CreateClaimBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim()) throw new ClaimError(400, "Plotëso titullin dhe të dhënat e Claim.");
  const { bookingId, requestId, description } = parsed.data;
  positiveId(bookingId);
  const title = parsed.data.title.trim();
  const creatorId = positiveId((req as any).session.userId);
  const id = await db.transaction(async tx => {
    const [booking] = await tx.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.id, bookingId)).for("key share");
    if (!booking) throw new ClaimError(404, "Rezervimi nuk u gjet.");
    const [inserted] = await tx.insert(claimsTable).values({ title, description, creatorId, requestId })
      .onConflictDoNothing({ target: claimsTable.requestId }).returning();
    if (!inserted) {
      const [existing] = await tx.select().from(claimsTable).where(eq(claimsTable.requestId, requestId));
      const [link] = await tx.select().from(claimBookingsTable).where(and(eq(claimBookingsTable.claimId, existing.id), eq(claimBookingsTable.bookingId, bookingId)));
      if (existing.creatorId !== creatorId || existing.title !== title || existing.description !== description || !link) {
        throw new ClaimError(409, "Kjo kërkesë është përdorur më parë. Rihap formularin për një Claim të ri.");
      }
      return existing.id;
    }
    await tx.insert(claimBookingsTable).values({ claimId: inserted.id, bookingId });
    return inserted.id;
  });
  notifyDataChanged("claims");
  res.status(201).json(await findClaim(id));
}));

router.get("/claims/:id", run(async (req, res) => {
  res.json(await findClaim(positiveId(req.params.id)));
}));

router.patch("/claims/:id", run(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = UpdateClaimBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim() || !Number.isSafeInteger(parsed.data.version)) throw new ClaimError(400, "Të dhëna të pavlefshme.");
  const { version, title, description, status } = parsed.data;
  const [updated] = await db.update(claimsTable).set({
    title: title.trim(), description, status, updatedAt: new Date(), version: sql`${claimsTable.version} + 1`,
  }).where(and(eq(claimsTable.id, id), eq(claimsTable.version, version))).returning();
  if (!updated) {
    const [exists] = await db.select({ id: claimsTable.id }).from(claimsTable).where(eq(claimsTable.id, id));
    throw new ClaimError(exists ? 409 : 404, exists ? "Claim është ndryshuar nga një përdorues tjetër. Rifresko të dhënat para ruajtjes." : "Claim nuk u gjet.");
  }
  notifyDataChanged("claims");
  res.json((await enrich([updated]))[0]);
}));

router.post("/claims/:id/bookings", run(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = LinkClaimBookingBody.strict().safeParse(req.body);
  if (!parsed.success) throw new ClaimError(400, "Rezervim i pavlefshëm.");
  const bookingId = positiveId(parsed.data.bookingId);
  await db.transaction(async tx => {
    const [claim] = await tx.select({ id: claimsTable.id }).from(claimsTable).where(eq(claimsTable.id, id)).for("update");
    if (!claim) throw new ClaimError(404, "Claim nuk u gjet.");
    const [booking] = await tx.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.id, bookingId)).for("key share");
    if (!booking) throw new ClaimError(404, "Rezervimi nuk u gjet.");
    const rows = await tx.insert(claimBookingsTable).values({ claimId: id, bookingId }).onConflictDoNothing().returning();
    if (rows.length) await tx.update(claimsTable).set({ updatedAt: new Date(), version: sql`${claimsTable.version} + 1` }).where(eq(claimsTable.id, id));
  });
  notifyDataChanged("claims");
  res.json(await findClaim(id));
}));
export default router;
