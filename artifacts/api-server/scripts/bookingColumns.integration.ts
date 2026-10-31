// Isolated local HTTP fixture: real route + database, test-only sessions.
// No email, bookings, payments or production authentication are modified.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import { bookingColumnPreferencesRouter } from "../src/routes/bookingColumnPreferences";

const ids: number[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const identity = Number(req.headers["x-test-user"]);
  (req as any).session = {
    userId: ids.includes(identity) ? identity : undefined,
    source: req.headers["x-test-source"] ?? "fms",
  };
  next();
});
app.use(bookingColumnPreferencesRouter);
const server = app.listen(0, "127.0.0.1");
try {
  for (const role of ["admin", "manager", "client"]) {
    const result = await pool.query(
      "INSERT INTO booking_users (email,password_hash,name,role) VALUES ($1,$2,$3,$4) RETURNING id",
      [`column-test-${randomUUID()}@example.invalid`, "disabled-test-account", "Temporary columns test", role],
    );
    ids.push(result.rows[0].id);
  }
  if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = (id?: number, body?: unknown, source = "fms") => fetch(`http://127.0.0.1:${port}/me/booking-columns`, {
    method: body === undefined ? "GET" : "PUT",
    headers: { "Content-Type": "application/json", ...(id ? { "x-test-user": String(id) } : {}), "x-test-source": source },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal((await request()).status, 401);
  assert.equal((await request(ids[2])).status, 401);
  assert.equal((await request(ids[0], undefined, "be")).status, 401);
  assert.deepEqual(await (await request(ids[0])).json(), { visibleColumns: null, columnWidths: {} });
  assert.equal((await request(ids[0], { visibleColumns: ["ref", "paid"] })).status, 200);
  assert.deepEqual(await (await request(ids[0])).json(), { visibleColumns: ["ref", "paid"], columnWidths: {} });
  assert.deepEqual(await (await request(ids[1])).json(), { visibleColumns: null, columnWidths: {} });
  assert.equal((await request(ids[1], { visibleColumns: ["date"] })).status, 200);
  assert.equal((await request(ids[0], { visibleColumns: ["ref", "paid"], columnWidths: { ref: 160, paid: 48 } })).status, 200);
  assert.equal((await request(ids[0], { visibleColumns: ["ref", "paid"] })).status, 200);
  assert.deepEqual(await (await request(ids[0])).json(), { visibleColumns: ["ref", "paid"], columnWidths: { ref: 160, paid: 48 } });
  for (const columnWidths of [{ paid: 47 }, { paid: 1001 }, { paid: 65.5 }, { bad: 80 }, { paid: "80" }]) {
    assert.equal((await request(ids[0], { visibleColumns: ["paid"], columnWidths })).status, 400);
  }
  for (const body of [{ visibleColumns: [] }, { visibleColumns: ["ref", "ref"] }, { visibleColumns: ["secret"] },
    { visibleColumns: ["ref"], userId: ids[1] }]) {
    assert.equal((await request(ids[0], body)).status, 400);
  }
  assert.equal((await request(ids[0], { visibleColumns: null })).status, 200);
  assert.deepEqual(await (await request(ids[0])).json(), { visibleColumns: null, columnWidths: {} });
  assert.deepEqual(await (await request(ids[1])).json(), { visibleColumns: ["date"], columnWidths: {} });
  console.log("PASS: auth, validation, durable save/read, independent users, reset and rejected ownership injection.");
} finally {
  server.close();
  if (ids.length) {
    await pool.query("DELETE FROM booking_users WHERE id = ANY($1::int[])", [ids]);
    const remaining = await pool.query("SELECT count(*)::int AS count FROM booking_column_preferences WHERE user_id = ANY($1::int[])", [ids]);
    assert.equal(remaining.rows[0].count, 0);
    console.log("Temporary fixtures removed.");
  }
  await pool.end();
}