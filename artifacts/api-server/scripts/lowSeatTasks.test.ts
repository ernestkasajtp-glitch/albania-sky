import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as tables from "@workspace/db";
import { processLowSeatTasks } from "../src/lib/lowSeatTasks.js";

const schema = `low_seats_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const client = drizzle(pool) as typeof tables.db;
const run = (enabled = true) => processLowSeatTasks(client, async () => enabled, () => {});
const counts = async () => (await pool.query("SELECT (SELECT count(*)::int FROM flight_low_seat_events) events, (SELECT count(*)::int FROM tasks) tasks")).rows[0];
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const dialect = new PgDialect();
  for (const table of [tables.flightsTable, tables.bookingUsersTable, tables.tasksTable, tables.taskNotificationsTable, tables.taskActivityTable]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let def = "";
      if (c.default !== undefined) {
        if (c.default && typeof c.default === "object" && "getSQL" in c.default) {
          const q = dialect.sqlToQuery((c.default as any).getSQL());
          assert.equal(q.params.length, 0); def = ` DEFAULT ${q.sql}`;
        } else if (typeof c.default === "object") def = ` DEFAULT '${JSON.stringify(c.default)}'`;
        else def = ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      }
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}${c.primary ? " PRIMARY KEY" : ""}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await pool.query(readFileSync("../../deploy/migrations/flight-low-seat-tasks.sql", "utf8"));
  await client.insert(tables.bookingUsersTable).values({
    name: "Fixture Admin", email: "low-seats@example.invalid", passwordHash: "not-a-login", role: "admin",
  } as any);
  await client.insert(tables.flightsTable).values({
    id: 1, airline: "W6", flightNumber: "W69999", fromCity: "TIA", toCity: "FCO",
    departureDate: "2028-01-01", departureTime: "10:00", arrivalDate: "2028-01-01", arrivalTime: "11:30",
    adultPrice: "100", childPrice: "100", infantPrice: "30", totalSeats: 20, soldSeats: 0,
  });
  await pool.query("UPDATE flights SET sold_seats=9 WHERE id=1");
  assert.equal((await counts()).events, 0, ">10 does not trigger");
  await pool.query("UPDATE flights SET sold_seats=10 WHERE id=1");
  await run(false);
  assert.deepEqual(await counts(), { events: 1, tasks: 0 }, "Disabled module retains pending event");
  await run(); await run();
  assert.deepEqual(await counts(), { events: 1, tasks: 1 }, "Exactly 10 creates one task; retries do not duplicate");
  const task = (await pool.query("SELECT * FROM tasks")).rows[0];
  assert.equal(task.entity_type, "flight"); assert.equal(task.entity_id, 1);
  assert.equal(task.priority, "high"); assert.match(task.description, /nga 11 në 10/);
  await pool.query("UPDATE tasks SET status='done'; UPDATE flights SET sold_seats=11 WHERE id=1");
  await run();
  assert.equal((await counts()).tasks, 1, "Staying <=10 never repeats even after task completion");
  await pool.query("UPDATE flights SET sold_seats=0 WHERE id=1");
  await pool.query("UPDATE flights SET total_seats=8 WHERE id=1");
  await run();
  assert.deepEqual(await counts(), { events: 2, tasks: 2 }, "Manual reduction crosses threshold; rearmed after >10");
  await pool.query("UPDATE flights SET total_seats=20,sold_seats=9 WHERE id=1");
  const tx = await pool.connect();
  try { await tx.query("BEGIN"); await tx.query("UPDATE flights SET sold_seats=12 WHERE id=1"); await tx.query("ROLLBACK"); }
  finally { tx.release(); }
  assert.equal((await counts()).events, 2, "Rolled-back sale cannot create task");
  await Promise.all([
    pool.query("UPDATE flights SET sold_seats=sold_seats+1 WHERE id=1"),
    pool.query("UPDATE flights SET sold_seats=sold_seats+1 WHERE id=1"),
  ]);
  await run();
  assert.deepEqual(await counts(), { events: 3, tasks: 3 }, "Concurrent sales create only one crossing");
  await pool.query("UPDATE flights SET sold_seats=0 WHERE id=1; UPDATE flights SET sold_seats=13 WHERE id=1");
  await pool.query("ALTER TABLE task_notifications RENAME TO notifications_unavailable");
  await run();
  assert.equal((await counts()).tasks, 3, "Delivery failure rolls back task atomically");
  await pool.query("ALTER TABLE notifications_unavailable RENAME TO task_notifications");
  await run();
  assert.deepEqual(await counts(), { events: 4, tasks: 4 }, "Pending delivery retries after recovery");
  assert.equal((await pool.query("SELECT count(*)::int n FROM task_notifications")).rows[0].n, 4);
  console.log("Low-seat tasks passed: sales, reductions, exact/skipped threshold, no repeat, rearm, concurrency, rollback, disabled module, retry.");
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end(); await tables.pool.end();
}
