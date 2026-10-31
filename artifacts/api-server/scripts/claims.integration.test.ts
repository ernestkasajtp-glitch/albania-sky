// Real Claims router and PostgreSQL, isolated test rows only.
// FMS_CLAIMS_TEST=1 node .../claims.integration.test.mjs
// Add CLAIMS_BROWSER=1 to keep a local browser fixture alive after the API tests.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import express from "express";
import { pool } from "@workspace/db";
import claimsRouter from "../src/routes/claims";
import { createModuleGuard, moduleForApiPath } from "../src/routes/moduleControls";
import { moduleCatalogue } from "../src/lib/moduleControls";

if (process.env.FMS_CLAIMS_TEST !== "1" || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) throw Error("Development tests only; explicit opt-in required.");
const suffix = randomUUID();
const key = randomBytes(32).toString("hex");
const infoPath = "/tmp/claims-browser-fixture.json";
let userId = 0, flightId = 0;
const bookingIds: number[] = [];
let disabled = false;
let server: ReturnType<express.Express["listen"]>;
const app = express();
app.use(express.json());
app.post("/__fixture/login", (req, res) => {
  if (req.body.key !== key) { res.sendStatus(403); return; }
  res.cookie("claims_test", key, { httpOnly: true, sameSite: "lax" }).json({ ok: true });
});
app.post("/__fixture/stop", (req, res) => {
  if (req.body.key !== key) { res.sendStatus(403); return; }
  res.json({ ok: true }); void cleanup().then(() => process.exit(0));
});
app.use((req, _res, next) => {
  const hasKey = req.get("x-fixture-key") === key;
  if (hasKey || req.get("cookie")?.split(";").some(c => c.trim() === `claims_test=${key}`)) {
    (req as any).session = { userId, role: hasKey ? req.get("x-fixture-role") || "admin" : "admin", source: hasKey ? req.get("x-fixture-source") || "fms" : "fms" };
  }
  next();
});
app.use("/api", createModuleGuard(async id => !(id === "claim" && disabled)), claimsRouter);
// The old booking endpoints depend on columns absent in the dev database.
// These adapters supply ONLY unchanged surrounding UI; Claims use their real router and DB.
app.get("/api/admin/me", (req, res) => {
  if (!(req as any).session) { res.sendStatus(401); return; }
  res.json({ id: userId, role: "admin", name: "Claims Test", email: "claims@example.invalid" });
});
app.get("/api/admin/has-admin", (_req, res) => { res.json({ hasAdmin: true }); });
app.get("/api/permissions/my", (_req, res) => { res.json({}); });
app.get("/api/modules", (_req, res) => { res.json({ revision: 1, modules: moduleCatalogue.map(m => ({ ...m, enabled: !(disabled && m.id === "claim"), locked: "locked" in m })) }); });
app.get("/api/branding", (_req, res) => { res.json({ siteName: "FMS Test", premiumLayout: false }); });
app.get("/api/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!bookingIds.includes(id)) { res.sendStatus(404); return; }
  const { rows: [b] } = await pool.query("select * from bookings where id=$1", [id]);
  const { rows: pax } = await pool.query("select id, first_name, last_name, cancelled from passengers where booking_id=$1 order by id", [id]);
  res.json({
    id, bookingRef: b.booking_ref, flightId, customerName: b.customer_name, customerEmail: "",
    customerPhone: "", status: b.status, totalAmount: Number(b.total_amount), paidAmount: Number(b.paid_amount), dueAmount: 80,
    markup: 0, commission: 0, discount: 0, createdAt: b.created_at, updatedAt: b.updated_at, notes: "", pnr: "TEST",
    flight: { id: flightId, airline: "TEST", flightNumber: "ZZ999", fromCity: "TIA", toCity: "LTN",
      departureDate: "2027-12-20", arrivalDate: "2027-12-20", departureTime: "10:00", arrivalTime: "12:00",
      adultPrice: 100, childPrice: 100, infantPrice: 0, tax: 0, totalSeats: 100, soldSeats: 2, availableSeats: 98, status: "open" },
    passengers: pax.map(p => ({ id: p.id, bookingId: id, firstName: p.first_name, lastName: p.last_name, cancelled: p.cancelled, type: "adult", ticketPrice: 100, extraCost: 0 })),
    payments: [], extras: [], splits: [],
  });
});
app.get("/api/live/events", (_req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.flushHeaders(); res.write(": fixture\n\n"); });
app.use("/api", (_req, res) => { res.json([]); });
const web = path.resolve("../flight-system/dist/public");
app.use("/flight-system", express.static(web));
app.get("/flight-system/{*rest}", (_req, res) => { res.sendFile(path.join(web, "index.html")); });

async function cleanup() {
  if (userId) await pool.query("delete from claims where creator_id=$1", [userId]);
  if (bookingIds.length) {
    await pool.query("delete from passengers where booking_id=any($1::int[])", [bookingIds]);
    await pool.query("delete from bookings where id=any($1::int[])", [bookingIds]);
  }
  if (flightId) await pool.query("delete from flights where id=$1", [flightId]);
  if (userId) await pool.query("delete from booking_users where id=$1", [userId]);
  try { unlinkSync(infoPath); } catch {}
  server?.closeAllConnections(); server?.close();
  await pool.end();
  console.log("Claims fixture cleaned.");
}

try {
  await pool.query(readFileSync("../../deploy/migrations/20261008-claims.sql", "utf8"));
  userId = (await pool.query("insert into booking_users(email,password_hash,name,role) values($1,'not-a-login-hash','Claims Test','admin') returning id", [`claims-${suffix}@example.invalid`])).rows[0].id;
  flightId = (await pool.query("insert into flights(airline,flight_number,from_city,to_city,departure_date,departure_time,arrival_date,arrival_time,adult_price,child_price,infant_price,total_seats,sold_seats,status) values('TEST','ZZ999','TIA','LTN','2027-12-20','10:00','2027-12-20','12:00',100,100,0,100,2,'cancelled') returning id")).rows[0].id;
  for (let i = 0; i < 2; i++) {
    const b = (await pool.query("insert into bookings(booking_ref,flight_id,customer_name,status,total_amount,paid_amount) values($1,$2,'Claims Fixture','confirmed',100,20) returning id", [`TEST-CLAIM-${suffix}-${i}`, flightId])).rows[0].id;
    bookingIds.push(b);
    await pool.query("insert into passengers(booking_id,first_name,last_name,type,cancelled) values($1,'Arben','Prova','adult',false),($1,'Elira','Testi','adult',true)", [b]);
  }
  const snapshot = JSON.stringify((await pool.query("select * from bookings where id=any($1::int[]) order by id", [bookingIds])).rows);
  server = app.listen(18996, "0.0.0.0");
  await new Promise<void>(r => server.on("listening", r));
  const call = async (url: string, method = "GET", body?: unknown, role = "admin", source = "fms", authenticated = true) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authenticated) Object.assign(headers, { "x-fixture-key": key, "x-fixture-role": role, "x-fixture-source": source });
    const r = await fetch(`http://127.0.0.1:18996/api${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  for (const [role, source, auth] of [["client", "be", true], ["admin", "be", true], ["agent", "be", true], ["admin", "fms", false]] as const) {
    assert.equal((await call("/claims", "GET", undefined, role, source, auth)).status, 401);
  }
  disabled = true;
  assert.equal((await call("/ClAiMs")).status, 403);
  assert.equal(moduleForApiPath("/claims/2/bookings", "POST"), "claim");
  disabled = false;
  assert.equal((await call("/claims?limit=1.5")).status, 400);
  const input = { title: `Fixture ${suffix}`, description: "Ankesë prove", bookingId: bookingIds[0], requestId: randomUUID() };
  const [one, replay] = await Promise.all([call("/claims", "POST", input), call("/claims", "POST", input)]);
  assert.equal(one.status, 201); assert.equal(replay.data.id, one.data.id);
  const claimId = one.data.id;
  assert.equal((await call(`/claims/${claimId}`)).data.id, claimId);
  assert.equal((await call("/claims/2147483647")).status, 404);
  assert.equal(one.data.bookings[0].passengers.length, 2);
  assert.equal(one.data.bookings[0].passengers[1].cancelled, true);
  assert.equal(one.data.bookings[0].toCity, "LTN");
  assert.equal(one.data.bookings[0].departureDate, "2027-12-20");
  assert(!("customerEmail" in one.data.bookings[0]));
  assert(!("passportNumber" in one.data.bookings[0].passengers[0]));
  assert.equal((await call("/claims", "POST", { ...input, title: "different" })).status, 409);
  assert.equal((await call("/claims", "POST", { ...input, title: "   ", requestId: randomUUID() })).status, 400);
  assert.equal((await call("/claims", "POST", { ...input, bookingId: 2147483647, requestId: randomUUID() })).status, 404);
  assert.equal((await call(`/claims?bookingId=${bookingIds[0]}&search=Elira`)).data.total, 1);
  for (const role of ["manager", "agent_staff"]) assert.equal((await call(`/claims?bookingId=${bookingIds[0]}`, "GET", undefined, role)).status, 200);
  const edit = { title: input.title, description: "Ndryshuar", status: "in_progress", version: one.data.version };
  const edits = await Promise.all([call(`/claims/${claimId}`, "PATCH", edit), call(`/claims/${claimId}`, "PATCH", edit)]);
  assert.deepEqual(edits.map(e => e.status).sort(), [200, 409]);
  const links = await Promise.all([call(`/claims/${claimId}/bookings`, "POST", { bookingId: bookingIds[1] }), call(`/claims/${claimId}/bookings`, "POST", { bookingId: bookingIds[1] })]);
  assert(links.every(r => r.status === 200 && r.data.bookings.length === 2));
  assert.equal((await call(`/claims/${claimId}/bookings`, "POST", { bookingId: 2147483647 })).status, 404);
  assert.equal((await call(`/claims?bookingId=${bookingIds[1]}&status=in_progress`)).data.items.length, 1);
  assert.equal((await call(`/claims?bookingId=${bookingIds[1]}&search=2027-12-20`)).data.total, 1);
  assert.equal((await call(`/claims?bookingId=${bookingIds[1]}&offset=1&limit=1`)).data.items.length, 0);
  assert.equal(JSON.stringify((await pool.query("select * from bookings where id=any($1::int[]) order by id", [bookingIds])).rows), snapshot);
  console.log("Claims integration passed: auth/module boundaries, passenger/route/date context, real persistence, search/pagination, concurrent create/link dedupe, stale-update rejection, booking invariance.");
  if (process.env.CLAIMS_BROWSER === "1") {
    writeFileSync(infoPath, JSON.stringify({ url: "http://127.0.0.1:18996/flight-system/", key, bookingIds, claimId }), { mode: 0o600 });
    console.log(`Browser fixture ready; private access information at ${infoPath}`);
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void cleanup().then(() => process.exit(0)); });
  } else await cleanup();
} catch (err) { console.error(err); await cleanup(); process.exitCode = 1; }
