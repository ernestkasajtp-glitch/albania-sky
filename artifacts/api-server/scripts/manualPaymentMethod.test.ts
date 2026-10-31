import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.DATABASE_URL ??= "postgres://manual-payment-test.invalid/manual_payment";
const { validateManualPaymentMethod } = await import("../src/lib/manualPaymentMethod.js");
const { db } = await import("@workspace/db");

let queries = 0;
let writes = 0;
const activeNames = new Set(["cash", "bank_transfer", "card", "online"]);
const client = {
  select: () => ({
    from: () => ({
      where: (condition: unknown) => ({
        limit: async () => {
          queries++;
          const { params } = db.dialect.sqlToQuery(condition as never);
          assert.equal(params[1], true, "lookup requires active=true");
          return params[0] === selectedActive && activeNames.has(selectedActive)
            ? [{ name: selectedActive }]
            : [];
        },
      }),
    }),
  }),
  insert: () => { writes++; throw new Error("unexpected insert"); },
  update: () => { writes++; throw new Error("unexpected update"); },
};
let selectedActive = "";

for (const value of [undefined, null, "", "   ", 3, {}, "not-a-method", "inactive"]) {
  selectedActive = "";
  const result = await validateManualPaymentMethod(value, client as never);
  assert.ok("error" in result, `rejected ${String(value)}`);
  assert.equal(writes, 0);
}
assert.equal(queries, 2, "blank methods never query or write");

for (const method of activeNames) {
  selectedActive = method;
  assert.deepEqual(await validateManualPaymentMethod(method, client as never), { method });
}
const beforeWallet = queries;
assert.deepEqual(await validateManualPaymentMethod("credit", client as never), { method: "credit" });
assert.equal(queries, beforeWallet, "canonical wallet credit is not a configured deposit method");
selectedActive = "cash";
assert.deepEqual(await validateManualPaymentMethod("  cash  ", client as never), { method: "cash" });
assert.equal(writes, 0);

// Verify all three manual writers validate before opening their transaction or
// in-flight guard, while status-only PATCH remains independent of method.
const payments = readFileSync(resolve(process.cwd(), "src/routes/payments.ts"), "utf8");
const bookings = readFileSync(resolve(process.cwd(), "src/routes/bookings.ts"), "utf8");
for (const [source, route, boundary] of [
  [payments, 'router.post("/payments",', "await db.transaction"],
  [payments, 'router.post("/payments/bulk",', "bulkPaymentInFlight.add"],
  [bookings, 'router.post("/bookings/:id/payments",', "await db.transaction"],
] as const) {
  const section = source.slice(source.indexOf(route));
  assert.ok(section.indexOf("validateManualPaymentMethod") >= 0);
  assert.ok(section.indexOf("validateManualPaymentMethod") < section.indexOf(boundary));
}
assert.ok(payments.includes('status: "completed"'));
assert.ok(bookings.includes('status: "completed"'));
assert.ok(payments.includes('Object.prototype.hasOwnProperty.call(reqBody, "method")'));
assert.ok(payments.includes('const isLedgerMutation = reqBody?.confirmed !== undefined || reqBody?.confirmNote !== undefined'));
assert.ok(!bookings.includes('validMethods.includes(method) ? method : "cash"'));