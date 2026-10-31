import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import session from "express-session";
import { Pool } from "@workspace/db/pg";

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for the isolated integration test");
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
  throw new Error("Refusing to run assistant integration tests in production");
}

const schemaName = `assistant_action_test_${process.pid}_${Date.now()}`;
const schemaIdent = `"${schemaName.replaceAll('"', '""')}"`;
const adminPool = new Pool({ connectionString: sourceDatabaseUrl, max: 1 });

function urlForSchema(raw: string, schema: string): string {
  const url = new URL(raw);
  const existing = url.searchParams.get("options");
  const searchPathOption = `-c search_path=${schema}`;
  url.searchParams.set("options", existing ? `${existing} ${searchPathOption}` : searchPathOption);
  return url.toString();
}

await adminPool.query(`CREATE SCHEMA ${schemaIdent}`);
process.env.DATABASE_URL = urlForSchema(sourceDatabaseUrl, schemaName);
process.env.PG_POOL_MAX = "3";
process.env.PORT = "0";
process.env.OPENAI_API_KEY = "REPLACE_WITH_YOUR_VALUE";

const isolatedPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

await isolatedPool.query(`
  CREATE TABLE booking_users (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    name text NOT NULL,
    company text,
    phone text,
    role text NOT NULL,
    agent_id integer,
    is_approved boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE tasks (
    id serial PRIMARY KEY,
    title text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'todo',
    priority text NOT NULL DEFAULT 'medium',
    assignee_id integer,
    creator_id integer,
    due_date timestamptz,
    completed_at timestamptz,
    parent_id integer,
    entity_type text,
    entity_id integer,
    labels jsonb NOT NULL DEFAULT '[]'::jsonb,
    watchers jsonb NOT NULL DEFAULT '[]'::jsonb,
    position integer NOT NULL DEFAULT 0,
    auto_generated boolean NOT NULL DEFAULT false,
    auto_rule_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE task_activity (
    id serial PRIMARY KEY,
    task_id integer NOT NULL,
    user_id integer,
    user_name text,
    action text NOT NULL,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE task_notifications (
    id serial PRIMARY KEY,
    user_id integer NOT NULL,
    task_id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE assistant_actions (
    id text PRIMARY KEY,
    user_id integer NOT NULL,
    action_type text NOT NULL,
    module text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    warning text NOT NULL,
    path text NOT NULL,
    body jsonb NOT NULL,
    precondition jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    result_message text,
    error_message text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz,
    completed_at timestamptz
  );
  CREATE TABLE bookings (
    id serial PRIMARY KEY,
    booking_ref text NOT NULL DEFAULT 'TEST',
    agent_id integer,
    flight_id integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'pending',
    total_amount numeric NOT NULL DEFAULT 0,
    paid_amount numeric NOT NULL DEFAULT 0,
    commission numeric NOT NULL DEFAULT 0,
    source text NOT NULL DEFAULT 'test',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE flights (
    id serial PRIMARY KEY,
    airline text NOT NULL DEFAULT 'TEST',
    flight_number text NOT NULL DEFAULT 'T1',
    from_city text NOT NULL DEFAULT 'TIA',
    to_city text NOT NULL DEFAULT 'TEST',
    departure_date text NOT NULL DEFAULT '2099-01-01',
    departure_time text NOT NULL DEFAULT '12:00',
    total_seats integer NOT NULL DEFAULT 0,
    sold_seats integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'open',
    is_confirmed boolean NOT NULL DEFAULT false,
    schedule_alert text,
    seat_alert text,
    external_sales_blocked boolean NOT NULL DEFAULT false,
    show_in_booking_engine boolean NOT NULL DEFAULT true
  );
  CREATE TABLE payments (
    id serial PRIMARY KEY,
    amount numeric NOT NULL DEFAULT 0,
    method text NOT NULL DEFAULT 'cash',
    status text NOT NULL DEFAULT 'completed',
    is_refund boolean NOT NULL DEFAULT false,
    confirmed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE agents (
    id serial PRIMARY KEY,
    name text NOT NULL,
    company text,
    status text NOT NULL DEFAULT 'active',
    wallet_balance numeric NOT NULL DEFAULT 0,
    show_in_reports boolean NOT NULL DEFAULT true
  );
  CREATE TABLE passengers (
    id serial PRIMARY KEY,
    booking_id integer NOT NULL,
    type text NOT NULL DEFAULT 'adult',
    cancelled boolean NOT NULL DEFAULT false,
    extra_cost numeric NOT NULL DEFAULT 0
  );
  CREATE TABLE booking_change_logs (
    id serial PRIMARY KEY,
    action text NOT NULL,
    field_name text,
    user_role text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE flight_change_history (
    id serial PRIMARY KEY,
    source text NOT NULL,
    user_role text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE payment_change_logs (
    id serial PRIMARY KEY,
    action text NOT NULL,
    field_name text,
    user_role text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO booking_users (id, email, password_hash, name, role)
  VALUES
    (101, 'admin-101@example.test', 'not-used', 'Test Admin', 'admin'),
    (202, 'admin-202@example.test', 'not-used', 'Other Admin', 'admin');
`);

const [{ default: assistantRouter, createStoredAssistantAction }, { default: tasksRouter }, dbModule] =
  await Promise.all([
    import("../src/routes/assistant.js"),
    import("../src/routes/tasks.js"),
    import("@workspace/db"),
  ]);

const app = express();
app.use(express.json());
let forceUncertain = false;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url === "https://api.openai.com/v1/chat/completions") {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Propozimi u përgatit dhe pret konfirmim.",
                proposal: {
                  type: "task_create_self",
                  targetId: null,
                  targetRef: null,
                  title: "Confirmation integration target",
                  description: null,
                  priority: "medium",
                  dueDate: null,
                  status: null,
                  isConfirmed: null,
                  confirmNote: null,
                  summary: "Krijo detyrën e sigurt të testimit.",
                  warning: "Detyra krijohet vetëm pas konfirmimit.",
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return nativeFetch(input, init);
}) as typeof fetch;
app.use(
  session({
    secret: "assistant-integration-test-only",
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
    cookie: { secure: false, httpOnly: true, sameSite: "lax" },
  }),
);
app.post("/test/login/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  if (userId !== 101 && userId !== 202) {
    res.status(400).json({ error: "invalid test user" });
    return;
  }
  req.session.userId = userId;
  req.session.role = "admin";
  req.session.userName = userId === 101 ? "Test Admin" : "Other Admin";
  res.json({ ok: true });
});
app.use((req, _res, next) => {
  (req as typeof req & { log: Record<string, () => void> }).log = {
    info() {},
    warn() {},
    error() {},
  };
  next();
});
app.use("/api", assistantRouter);
app.use("/api", (req, res, next) => {
  if (forceUncertain && req.path === "/tasks" && req.method === "POST" && req.header("X-AI-Action")) {
    res.status(503).json({ error: "simulated downstream uncertainty" });
    return;
  }
  next();
});
app.use("/api", tasksRouter);

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not bind");
process.env.PORT = String(address.port);
const baseUrl = `http://127.0.0.1:${address.port}/api`;

async function login(userId: 101 | 202): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${address.port}/test/login/${userId}`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function confirm(proposalId: string, cookie: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}/assistant/actions/${proposalId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
  });
  return { status: response.status, body: await response.json() };
}

async function createTaskProposal(title: string) {
  const proposal = await createStoredAssistantAction(
    {
      type: "task_create_self",
      targetId: null,
      targetRef: null,
      title,
      description: null,
      priority: "medium",
      dueDate: null,
      status: null,
      isConfirmed: null,
      confirmNote: null,
      summary: `Create ${title}`,
      warning: "Test warning",
    },
    101,
  );
  assert.ok(proposal);
  return proposal;
}

try {
  const ownerCookie = await login(101);
  const otherUserCookie = await login(202);
  const queryResponse = await fetch(`${baseUrl}/assistant/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ message: "Krijo një detyrë personale testimi." }),
  });
  assert.equal(queryResponse.status, 200);
  const queryBody = (await queryResponse.json()) as { proposal?: { proposalId?: string } };
  assert.ok(queryBody.proposal?.proposalId);
  const safe = { proposalId: queryBody.proposal.proposalId };
  assert.equal((await isolatedPool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count, 0);
  assert.equal(
    (await isolatedPool.query("SELECT status FROM assistant_actions WHERE id = $1", [safe.proposalId])).rows[0].status,
    "pending",
  );

  const firstConfirm = await confirm(safe.proposalId, ownerCookie);
  assert.equal(firstConfirm.status, 200);
  assert.equal(firstConfirm.body.status, "executed");
  assert.equal((await isolatedPool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count, 1);

  const repeatedConfirm = await confirm(safe.proposalId, ownerCookie);
  assert.equal(repeatedConfirm.status, 200);
  assert.equal(repeatedConfirm.body.status, "already_executed");
  assert.equal((await isolatedPool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count, 1);

  const forbidden = await createTaskProposal("Permission denied target");
  const deniedConfirm = await confirm(forbidden.proposalId, otherUserCookie);
  assert.equal(deniedConfirm.status, 403);
  assert.equal((await isolatedPool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count, 1);

  const expired = await createTaskProposal("Expired target");
  await isolatedPool.query("UPDATE assistant_actions SET expires_at = now() - interval '1 second' WHERE id = $1", [
    expired.proposalId,
  ]);
  const expiredConfirm = await confirm(expired.proposalId, ownerCookie);
  assert.equal(expiredConfirm.status, 400);
  assert.match(expiredConfirm.body.error, /skaduar/);
  assert.equal((await isolatedPool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count, 1);

  const insertedTask = await isolatedPool.query(
    "INSERT INTO tasks (title, status, priority, assignee_id, creator_id) VALUES ($1, 'todo', 'medium', 101, 101) RETURNING id",
    ["Stale target"],
  );
  const stale = await createStoredAssistantAction(
    {
      type: "task_set_status",
      targetId: insertedTask.rows[0].id,
      targetRef: null,
      title: null,
      description: null,
      priority: null,
      dueDate: null,
      status: "done",
      isConfirmed: null,
      confirmNote: null,
      summary: "Complete stale target",
      warning: "Test warning",
    },
    101,
  );
  assert.ok(stale);
  await isolatedPool.query("UPDATE tasks SET status = 'in_progress' WHERE id = $1", [insertedTask.rows[0].id]);
  const staleConfirm = await confirm(stale.proposalId, ownerCookie);
  assert.equal(staleConfirm.status, 409);
  assert.match(staleConfirm.body.error, /ndryshuar/);
  assert.equal(
    (await isolatedPool.query("SELECT status FROM tasks WHERE id = $1", [insertedTask.rows[0].id])).rows[0].status,
    "in_progress",
  );

  const uncertain = await createTaskProposal("Uncertain target");
  forceUncertain = true;
  const uncertainConfirm = await confirm(uncertain.proposalId, ownerCookie);
  forceUncertain = false;
  assert.equal(uncertainConfirm.status, 503);
  assert.match(uncertainConfirm.body.error, /paqartë/);
  assert.equal(
    (await isolatedPool.query("SELECT status FROM assistant_actions WHERE id = $1", [uncertain.proposalId])).rows[0]
      .status,
    "uncertain",
  );
  const uncertainRetry = await confirm(uncertain.proposalId, ownerCookie);
  assert.equal(uncertainRetry.status, 409);
  assert.equal(
    (await isolatedPool.query("SELECT count(*)::int AS count FROM tasks WHERE title = $1", ["Uncertain target"])).rows[0]
      .count,
    0,
  );

  console.log("assistant action confirmation integration tests: OK");
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await dbModule.pool.end();
  await isolatedPool.end();
  await adminPool.query(`DROP SCHEMA ${schemaIdent} CASCADE`);
  await adminPool.end();
}