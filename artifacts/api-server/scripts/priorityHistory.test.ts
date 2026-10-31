import assert from "node:assert/strict";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as tables from "@workspace/db";
import { historyRange, receiptInRange } from "../src/lib/priorityHistory.js";
import { storePriorityEmail } from "../src/lib/priorityEmailMonitor.js";
assert.deepEqual(historyRange("2026-09-01", "2026-10-08"), {from:"2026-09-01",to:"2026-10-08"});
assert.equal(receiptInRange(new Date("2026-08-31T22:00:00Z"), "2026-09-01", "2026-10-08"), true);
assert.equal(receiptInRange(new Date("2026-08-31T21:59:59Z"), "2026-09-01", "2026-10-08"), false);
assert.equal(receiptInRange(new Date("2026-10-08T21:59:59Z"), "2026-09-01", "2026-10-08"), true);
assert.equal(receiptInRange(new Date("2026-10-08T22:00:00Z"), "2026-09-01", "2026-10-08"), false);
for (const dates of [["2026-02-30","2026-10-08"],["2026-10-09","2026-10-08"],["x","y"],["2024-01-01","2026-01-01"]])
  assert.throws(() => historyRange(...dates as [string, string]));
const schema = `priority_history_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({connectionString:process.env.DATABASE_URL});
const pool = new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`});
const client = drizzle(pool) as typeof tables.db;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const dialect = new PgDialect();
  for (const table of [tables.cpImportAlertsTable]) {
    const config = getTableConfig(table);
    const cols = config.columns.map(c => {
      const def = c.default === undefined ? "" : c.default && typeof c.default === "object" && "getSQL" in c.default
        ? ` DEFAULT ${dialect.sqlToQuery((c.default as any).getSQL()).sql}` : ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}${c.primary ? " PRIMARY KEY" : ""}${c.isUnique ? " UNIQUE" : ""}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${cols.join(",")})`);
  }
  const text = "PNR Reference\nCPTEST01\nBooking ID\n12345\nCabin luggage\n55 × 40 × 23 cm, 10kg – €45 (×3)\nLuggage in the hold\n0 x luggage selected";
  const results = await Promise.all(Array.from({length:4}, () => storePriorityEmail("fixture","message-1",text,client)));
  assert.equal(results.filter(r => r === "created").length,1);
  assert.equal(results.filter(r => r === "existing").length,3);
  const [alert] = await client.select().from(tables.cpImportAlertsTable);
  assert.match(alert.reason,/3 × €45/);
  await client.update(tables.cpImportAlertsTable).set({resolvedAt:new Date()}).where(eq(tables.cpImportAlertsTable.id,alert.id));
  assert.equal(await storePriorityEmail("fixture","message-1",text,client),"existing");
  assert.equal(await storePriorityEmail("fixture","message-2",text.replace("(×3)","(×0)"),client),"ignored");
  assert.equal((await client.select().from(tables.cpImportAlertsTable)).length,1);
  console.log("PRIORITY historical tests: date validation, shared live/history dedupe, concurrent scans, resolved-alert dedupe, quantities and no-cabin exclusion passed.");
} finally {
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end(); await tables.pool.end();
}
