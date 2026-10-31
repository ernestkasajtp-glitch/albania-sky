import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import * as tables from "@workspace/db";
import { FailedEmailStore, emailOutcomeUncertain } from "../src/lib/failedEmail.js";
const schema = `email_retry_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const client = drizzle(pool) as typeof tables.db;
const dir = await mkdtemp(path.join(os.tmpdir(), "email-retry-test-"));
const store = new FailedEmailStore(client, dir);
const authError = Object.assign(new Error("Account unavailable"), { code: "EAUTH" });
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const dialect = new PgDialect();
  for (const table of [tables.settingsTable, tables.cpImportAlertsTable]) {
    const config = getTableConfig(table);
    const cols = config.columns.map(c => {
      const def = c.default === undefined ? "" : c.default && typeof c.default === "object" && "getSQL" in c.default
        ? ` DEFAULT ${dialect.sqlToQuery((c.default as any).getSQL()).sql}` : ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}${c.primary ? " PRIMARY KEY" : ""}${c.isUnique ? " UNIQUE" : ""}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${cols.join(",")})`);
  }
  const payload = { to: "fixture@example.test", subject: "Booking KTF1234", htmlBody: "<b>Original email</b>",
    attachments: [{ filename: "report.pdf", content: Buffer.from([0, 255, 3, 4]), mimeType: "application/pdf" }] };
  const id = await store.record(payload, authError);
  assert.equal(await store.record(payload, authError), id);
  assert.equal((await readdir(dir)).length, 1);
  assert.equal((await stat(path.join(dir, (await readdir(dir))[0]))).mode & 0o777, 0o600);
  const meta = (await store.details([id])).get(id)!;
  assert.equal(meta.attempts, 2); assert.equal(meta.canRetry, true);
  assert.deepEqual(meta.references, ["KTF1234"]); assert.equal("file" in meta, false);
  let unlock!: () => void;
  const gate = new Promise<void>(r => { unlock = r; });
  let began!: () => void;
  const entered = new Promise<void>(r => { began = r; });
  let sends = 0;
  const run = store.retry(id, false, async p => {
    sends++; assert.deepEqual(p, payload); began(); await gate;
  });
  await entered;
  await assert.rejects(store.retry(id, false, async () => { sends++; }));
  unlock(); await run;
  assert.equal(sends, 1);
  assert.equal((await store.details([id])).get(id)!.status, "sent");
  assert.equal((await readdir(dir)).length, 0);
  await assert.rejects(store.retry(id, false, async () => { sends++; }));
  const id2 = await store.record(payload, authError); assert.notEqual(id2, id);
  await assert.rejects(store.retry(id2, false, async () => { throw authError; }));
  assert.equal((await store.details([id2])).get(id2)!.status, "failed");
  const timeout = Object.assign(new Error("Timeout after DATA"), { code: "ETIMEDOUT" });
  assert.equal(emailOutcomeUncertain(timeout), true);
  await assert.rejects(store.retry(id2, false, async () => { throw timeout; }));
  assert.equal((await store.details([id2])).get(id2)!.status, "uncertain");
  await assert.rejects(store.retry(id2, false, async () => {}));
  await store.retry(id2, true, async () => {});
  console.log("Failed email: dedupe, exact PDF bytes, privacy, concurrency, SMTP failure, ambiguous retry and sent guard OK");
} finally {
  await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end(); await tables.pool.end(); await rm(dir, { recursive: true, force: true });
}
