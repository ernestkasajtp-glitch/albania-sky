import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import express from "express";
import session from "express-session";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agentsTable } from "../../../lib/db/src/schema/agents.js";

const url = new URL(process.env.DATABASE_URL || "postgres://invalid");
if (process.env.ENROLLMENT_TEST_DB !== "development" || url.hostname !== "helium" || url.pathname !== "/heliumdb" || process.env.NODE_ENV === "production") {
  throw new Error("Test writes require opt-in and local helium/heliumdb");
}
// An isolated schema, not production tables. No real email is ever sent.
const schema = `enrollment_test_${randomUUID().replaceAll("-", "")}`;
const { Client } = createRequire(resolve("../../lib/db/package.json"))("pg");
const setup = new Client({ connectionString: url.href });
await setup.connect();
await setup.query(`CREATE SCHEMA "${schema}"`);
try {
await setup.query(`SET search_path TO "${schema}"`);
await setup.query(`
 CREATE TABLE booking_users (
 id serial PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 name text NOT NULL, company text, phone text, role text NOT NULL DEFAULT 'client',
 agent_id integer, is_approved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE agency_groups (id serial PRIMARY KEY, name text NOT NULL UNIQUE);
 CREATE TABLE sessions (sid text PRIMARY KEY, sess text NOT NULL, expired_at timestamptz NOT NULL);
 CREATE TABLE agents (LIKE public.agents INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
 CREATE TABLE agent_activity (id serial PRIMARY KEY, agent_id integer, user_id integer,
 type text NOT NULL, method text, path text, description text, ip text, user_agent text,
 status_code integer, created_at timestamptz NOT NULL DEFAULT now());
`);
for (const column of getTableConfig(agentsTable).columns) {
  await setup.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS "${column.name}" ${column.getSQLType()}`);
}
await setup.query(await readFile("../../lib/db/drizzle/0012_public_enrollments.sql", "utf8"));
} catch (error) {
  await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
  await setup.end();
  throw error;
}
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.href;
delete process.env.SMTP_HOST;
process.env.NOTIFY_EMAIL = "admin@example.invalid";
process.env.FMS_PUBLIC_BASE_URL = "https://example.invalid/flight-system";
const { pool } = await import("@workspace/db");
const { default: authRouter } = await import("../src/routes/auth.js");
const { publicEnrollmentsRouter } = await import("../src/routes/publicEnrollments.js");
const { sendEnrollmentEmail } = await import("../src/lib/publicEnrollment.js");
const { DrizzleSessionStore } = await import("../src/lib/sessionStore.js");
const app = express();
app.use(express.json());
// Use the real get/set/touch implementation without starting its cleanup timer.
const sessionStore = Object.setPrototypeOf(new session.Store(), DrizzleSessionStore.prototype);
app.use(session({
  secret: "isolated-enrollment-test-only",
  store: sessionStore, resave: false, saveUninitialized: false,
  cookie: { secure: false },
}));
app.use((req: any, _res, next) => {
  // Header impersonation is reserved for the isolated admin assertions below.
  if (req.headers["x-user"]) Object.assign(req.session, {
    userId: Number(req.headers["x-user"]), role: req.headers["x-role"], source: "fms",
  });
  next();
});
app.use(authRouter);
app.use(publicEnrollmentsRouter);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(r => server.on("listening", r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let assertions = 0;
const check = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); assertions++; };
async function request(path: string, body?: object, admin = true) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(admin ? { "x-user": "9999", "x-role": "admin" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
try {
  check((await request("/admin/enrollments", undefined, false)).status, 403, "PII admin-only");
  check((await request("/admin/enrollments/count", undefined, false)).status, 403, "count admin-only");
  const group = (await pool.query("INSERT INTO agency_groups(name) VALUES ('Test group') RETURNING id")).rows[0].id;
  const ids: number[] = [];
  for (const role of ["client", "agent"]) {
    const email = `${role}@example.invalid`;
    const signup = await request("/auth/register", { email, password: "REPLACE_WITH_YOUR_VALUE", name: `<${role}>`, company: role === "agent" ? "Test agency" : "", role }, false);
    check(signup.status, 201, "registration succeeds");
    check(signup.body.pendingApproval, true, "registration pending");
    check(signup.body.isApproved, false, "no auto approval");
    check(signup.body.role, role, "role not escalated");
    ids.push(signup.body.id);
    assert.ok(signup.cookie, "registration persists a session cookie");
    const meResponse = await fetch(base + "/auth/me", { headers: { Cookie: signup.cookie } });
    check(meResponse.status, 200, "registration cookie authenticates the next request");
    const me = await meResponse.json();
    check(me.id, signup.body.id, "session restores registered identity");
    check(me.agentId, signup.body.agentId, "session restores registered agency");
    check(me.pendingApproval, true, "pending survives session restoration");
    const login = await request("/auth/login", { email, password: "REPLACE_WITH_YOUR_VALUE" }, false);
    check(login.body.pendingApproval, true, "pending survives login");
  }
  check((await request("/admin/enrollments/count")).body.count, 2, "combined client and agent count");
  // An unrelated agency with the same email must not auto-link/promote a new client.
  await pool.query("INSERT INTO agents(name,email,company) VALUES ('Unrelated', 'client@example.invalid', 'Company')");
  const unlinkedLogin = await request("/auth/login", { email: "client@example.invalid", password: "REPLACE_WITH_YOUR_VALUE" }, false);
  check(unlinkedLogin.body.agentId, null, "new enrollment cannot bypass gate via email auto-linking");
  check(unlinkedLogin.body.role, "client", "new client keeps original role");
  check((await request(`/admin/enrollments/${ids[0]}/approve`, {}, true)).status, 400, "group mandatory");
  check((await request(`/admin/enrollments/${ids[0]}/approve`, { groupId: group }, false)).status, 403, "approval admin-only");
  check((await request(`/admin/enrollments/${ids[0]}/approve`, { groupId: 999999 })).status, 400, "group must exist");
  const results = await Promise.all(Array.from({ length: 6 }, () => request(`/admin/enrollments/${ids[0]}/approve`, { groupId: group })));
  check(results.every(r => r.status === 200 && r.body.approved), true, "concurrent approvals idempotent");
  const approved = (await pool.query("SELECT * FROM public_enrollments WHERE user_id=$1", [ids[0]])).rows[0];
  check(approved.group_id, group, "membership persisted");
  check(!!approved.approved_at, true, "approval persisted");
  check((await pool.query("SELECT role, agent_id FROM booking_users WHERE id=$1", [ids[0]])).rows[0], { role: "client", agent_id: null }, "client not promoted or silently linked");
  check((await request("/auth/login", { email: "client@example.invalid", password: "REPLACE_WITH_YOUR_VALUE" }, false)).body.pendingApproval, false, "approval effective on login");
  check((await request("/admin/enrollments/count")).body.count, 1, "pending count decreases");
  check((await request(`/admin/enrollments/${ids[1]}/approve`, { groupId: group })).status, 200, "agent approved");
  check((await pool.query("SELECT a.group_id FROM agents a JOIN booking_users u ON u.agent_id=a.id WHERE u.id=$1", [ids[1]])).rows[0].group_id, group, "agency receives group atomically");
  await pool.query("UPDATE public_enrollments SET activation_status='sent' WHERE user_id=$1", [ids[0]]);
  check((await sendEnrollmentEmail(ids[0], "activation")).emailStatus, "sent", "sent email never claimed again");
  await pool.query("UPDATE public_enrollments SET activation_status='sending' WHERE user_id=$1", [ids[0]]);
  check((await sendEnrollmentEmail(ids[0], "activation")).emailStatus, "sending", "in-flight email never stolen");
  await pool.query("UPDATE public_enrollments SET activation_status='unknown' WHERE user_id=$1", [ids[0]]);
  check((await sendEnrollmentEmail(ids[0], "activation")).emailStatus, "unknown", "ambiguous outcome never resent blindly");
  check((await request("/admin/enrollments/count")).body.count, 0, "zero after approval");
  const old = (await pool.query("INSERT INTO booking_users(email,password_hash,name,role,is_approved) SELECT 'legacy@example.invalid',password_hash,'Legacy','client',false FROM booking_users WHERE id=$1 RETURNING id", [ids[0]])).rows[0];
  check((await request("/auth/login", { email: "legacy@example.invalid", password: "REPLACE_WITH_YOUR_VALUE" }, false)).body.pendingApproval, false, "historical unapproved account remains compatible");
  check((await pool.query("SELECT count(*)::integer AS count FROM public_enrollments WHERE user_id=$1", [old.id])).rows[0].count, 0, "legacy account not enrolled retroactively");
  console.log(`Public enrollment integration: ${assertions} assertions passed`);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
  await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
  await setup.end();
}