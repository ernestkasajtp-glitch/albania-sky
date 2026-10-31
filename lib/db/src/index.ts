import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { attachDatabaseAudit, attachDatabaseAuditPool } from "./auditContext";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool sizing matters under concurrent load (multiple users / multiple browser
// tabs sharing one session). The node-postgres default of max:10 is too small:
// every API request already consumes a connection for session read/write before
// its own queries, so a second tab can exhaust the pool and make requests queue
// (and, without connectionTimeoutMillis, hang indefinitely). Sized generously but
// safely below Postgres' default max_connections (100). Overridable via env.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 25,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
attachDatabaseAuditPool(pool);
export const db = drizzle(pool, { schema });
pool.on("connect", client => attachDatabaseAudit(client as any));
export { databaseAuditContext } from "./auditContext";

export * from "./schema";
