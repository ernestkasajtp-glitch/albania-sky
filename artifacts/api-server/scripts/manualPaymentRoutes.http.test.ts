import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

// Isolated HTTP fixture: never contact a database and never run the app.
process.env.DATABASE_URL ??= "postgres://manual-payment-routes.invalid/test";
const { db, pool } = await import("@workspace/db");
const activeNames = new Set(["cash", "bank_transfer"]);
let writes = 0;
let lookups = 0;
const failWrite = () => {
  writes++;
  throw new Error("Payment handler attempted to write");
};
Object.assign(db, {
  select: () => ({
    from: () => ({
      where: (filter: unknown) => ({
        limit: async () => {
          lookups++;
          // Verify the policy query actually includes both exact method name
          // and active=true, rather than granting access to any selected row.
          const { params } = db.dialect.sqlToQuery(filter as never);
          assert.equal(params[1], true);
          return activeNames.has(params[0] as string) ? [{ name: params[0] }] : [];
        },
      }),
    }),
  }),
  transaction: failWrite,
  insert: failWrite,
  update: failWrite,
  execute: failWrite,
});
// A stray SQL call must fail immediately rather than connect to any DB.
Object.assign(pool, { query: failWrite, connect: failWrite });

const [{ default: payments }, { default: bookings }] = await Promise.all([
  import("../src/routes/payments.js"),
  import("../src/routes/bookings.js"),
]);
const app = express();
app.use(express.json());
app.use(payments, bookings);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  for (const [path, body] of [
    ["/payments", { bookingId: 101, amount: 10 }],
    ["/bookings/101/payments", { amount: 10 }],
    ["/payments/bulk", { payments: [{ bookingId: 101, amount: 10 }], tenderedAmount: 10 }],
  ] as const) {
    for (const [description, value] of [
      ["omitted", undefined],
      ["null", null],
      ["empty", ""],
      ["whitespace", "   "],
      ["unknown", "crypto"],
      ["inactive", "card"],
    ] as const) {
      const before = lookups;
      const response = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(value === undefined ? {} : { method: value }) }),
      });
      assert.equal(response.status, 400, `${path}: ${description}: ${await response.text()}`);
      assert.equal(writes, 0, `${path}: ${description} must not write`);
      assert.equal(lookups - before, description === "unknown" || description === "inactive" ? 1 : 0);
    }
  }
} finally {
  server.close();
  await once(server, "close");
  await pool.end();
}