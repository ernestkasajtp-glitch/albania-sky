import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import express from "express";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

// All SQL is confined to an ephemeral schema. No public-schema fallback.
const schema = `discount_test_${randomUUID().replaceAll("-", "")}`;
const Pool = pool.constructor as any;
const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
await admin.query(`CREATE SCHEMA ${schema}`);
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema} -c statement_timeout=5000`);
process.env.DATABASE_URL = url.toString();
pool.options.connectionString = url.toString();
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
try {
  await pool.query(`
    CREATE TABLE settings(key text primary key,value text,updated_at timestamptz default now());
    CREATE TABLE flights(id integer primary key,from_city text,to_city text,departure_date text,flight_number text);
    CREATE TABLE agency_groups(id integer primary key,name text);
    CREATE TABLE agency_group_rules(id integer,group_id integer,airport text,direction text,date_from date,date_to date);
    CREATE TABLE flight_activity_audit(id bigserial,flight_id integer,entity_table text,entity_id text,operation text,
      changes jsonb,reference text,user_id integer,user_name text,user_role text,origin text,created_at timestamptz default now());
    INSERT INTO flights VALUES(1,'TIA','BER','2099-06-01','W61234'),(2,'BER','TIA','2099-06-02','W64321');
    INSERT INTO agency_groups VALUES(1,'Fixture Group');
    INSERT INTO agency_group_rules VALUES(1,1,'TIA','from',null,null);
  `);
  const { default: router } = await import("../src/routes/discountCampaigns");
  const { default: bannerRouter } = await import("../src/routes/bannerConfigs");
  const { defaultBanner } = await import("../src/lib/offerBannerMath");
  const { readFlightDiscounts } = await import("../src/lib/flightDiscounts");
  const { invalidateCampaigns } = await import("../src/lib/discountCampaigns");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { role: req.headers["x-test-role"] ?? "admin", userId: 1, userName: "Fixture Admin" };
    (req as any).log = { error: () => undefined };
    next();
  });
  app.use(router);
  app.use(bannerRouter);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/discount-campaigns`;
  const call = async (method: string, path = "", body?: unknown, role = "admin") => {
    const response = await fetch(baseUrl + path, {
      method, headers: { "Content-Type": "application/json", "x-test-role": role },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() as any };
  };
  const input = {
    name: "Fixture", enabled: true, type: "percent", value: 10, channels: ["agents", "public", "offline", "api"],
    startsAt: "2000-01-01T00:00", endsAt: "2099-12-31T23:59",
    periods: [{ from: "2099-06-01", to: "2099-06-30" }], scope: "group", groupId: 1,
    fromAirport: null, toAirport: null, flightIds: [], priority: 0,
  };
  assert.equal((await call("GET", "", undefined, "manager")).status, 403);
  assert.equal((await call("POST", "", input, "manager")).status, 403);
  assert.equal((await call("POST", "", { ...input, groupId: 999 })).status, 400);
  assert.equal((await call("POST", "", { ...input, scope: "flights", flightIds: [999] })).status, 400);
  const created = await call("POST", "", input);
  assert.equal(created.status, 201);
  const c = created.body.campaign;
  const bannerCall = async (method: string, path = "", body?: unknown, role = "admin") => {
    const response = await fetch(baseUrl.replace("/discount-campaigns", "/banner-configs") + path, {
      method, headers: { "Content-Type": "application/json", "x-test-role": role },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() as any };
  };
  assert.equal((await bannerCall("GET", "", undefined, "manager")).status, 403);
  assert.equal((await bannerCall("PUT", `/${c.id}`, defaultBanner(), "manager")).status, 403);
  const bannerList = await bannerCall("GET");
  assert.equal(bannerList.body.campaigns[0].value, c.value);
  assert.equal(bannerList.body.campaigns[0].banner.enabled, false);
  assert.equal(bannerList.body.campaigns[0].banner.version, 0);
  const bannerInput = { ...defaultBanner(), enabled: true };
  const bannerSaved = await bannerCall("PUT", `/${c.id}`, bannerInput);
  assert.equal(bannerSaved.status, 200);
  assert.equal(bannerSaved.body.banner.version, 1);
  assert.equal((await bannerCall("PUT", `/${c.id}`, bannerInput)).status, 409);
  assert.equal((await bannerCall("PUT", `/${c.id}`, { ...bannerInput, colors: { background: "red" } })).status, 400);
  assert.equal((await bannerCall("GET")).body.campaigns[0].banner.colors.background, "#BD3348");
  assert.equal((await call("GET")).body.campaigns[0].value, input.value, "banner editing must never change pricing");
  assert.equal((await call("GET")).body.campaigns.length, 1);
  let prices = await readFlightDiscounts([1, 2]);
  assert.equal(prices.get(1)?.value, 10); assert.equal(prices.has(2), false);
  // Manual always wins; deleting it reveals the still-active campaign.
  await pool.query("INSERT INTO settings(key,value) VALUES('flightDiscount.1',$1)", [JSON.stringify({ type: "fixed", value: 3, channels: ["public"] })]);
  assert.equal((await readFlightDiscounts([1])).get(1)?.value, 3);
  await pool.query("DELETE FROM settings WHERE key='flightDiscount.1'");
  assert.equal((await readFlightDiscounts([1])).get(1)?.value, 10);
  // Concurrent writers cannot both commit the same version.
  const results = await Promise.all([
    call("PUT", `/${c.id}`, { ...input, version: 1, value: 20 }),
    call("PUT", `/${c.id}`, { ...input, version: 1, value: 30 }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const updated = results.find(r => r.status === 200)!.body.campaign;
  assert.equal((await call("DELETE", `/${c.id}`, { version: 1 })).status, 409);
  const disabled = await call("PUT", `/${c.id}`, { ...updated, enabled: false });
  assert.equal(disabled.status, 200);
  assert.equal((await readFlightDiscounts([1])).size, 0);
  const expired = await call("PUT", `/${c.id}`, { ...disabled.body.campaign, enabled: true, endsAt: "2001-01-01T00:00" });
  assert.equal(expired.status, 200);
  assert.equal((await readFlightDiscounts([1])).size, 0);
  const newer = await call("POST", "", { ...input, name: "Higher priority", scope: "all", groupId: null, priority: 10, value: 40 });
  assert.equal(newer.status, 201);
  assert.equal((await readFlightDiscounts([1, 2])).get(2)?.value, 40);
  assert.ok(Number((await pool.query("SELECT count(*) AS n FROM flight_activity_audit")).rows[0].n) >= 5);
  assert.equal((await call("DELETE", `/${c.id}`, { version: expired.body.campaign.version })).status, 200);
  assert.equal((await bannerCall("PUT", `/${c.id}`, { ...bannerInput, version: 1 })).status, 404);
  assert.equal((await bannerCall("GET")).body.campaigns.some((row: any) => row.id === c.id), false);
  assert.equal((await call("DELETE", `/${newer.body.campaign.id}`, { version: 1 })).status, 200);
  invalidateCampaigns();
  assert.equal((await readFlightDiscounts([1, 2])).size, 0);
  console.log("Campaign integration passed: CRUD, admin gates, live pricing, precedence, expiry, concurrent edits, audit, removal.");
} finally {
  server?.close();
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
process.exit(0);
