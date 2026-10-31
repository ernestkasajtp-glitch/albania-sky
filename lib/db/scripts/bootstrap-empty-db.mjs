// Creates the full schema on an EMPTY database (e.g. a fresh Render Postgres).
// If the database already has the `flights` table it does not create or change
// any tables; it only makes sure the idempotent performance indexes in
// scripts/ensure-indexes.sql exist (CREATE INDEX IF NOT EXISTS).
//
//   pnpm --filter @workspace/db run bootstrap
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(dbDir, "..", "..");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: url });
await client.connect();

// Idempotent performance indexes — applied on every start, including databases
// that already hold data, so new indexes reach production with a normal deploy.
async function ensureIndexes() {
  const file = path.join(dbDir, "scripts", "ensure-indexes.sql");
  const started = Date.now();
  await client.query(readFileSync(file, "utf8"));
  console.log(`[db-bootstrap] Performance indexes ensured (${Date.now() - started} ms).`);
}

const { rows } = await client.query("SELECT to_regclass('public.flights') AS t");
if (rows[0].t) {
  console.log("[db-bootstrap] Database already has tables — skipping schema creation.");
  await ensureIndexes();
  await client.end();
  process.exit(0);
}

console.log("[db-bootstrap] Empty database — creating schema with drizzle-kit push…");
execFileSync("pnpm", ["exec", "drizzle-kit", "push", "--force", "--config", "./drizzle.config.ts"], {
  cwd: dbDir,
  stdio: "inherit",
});

// Raw SQL migrations that live outside the Drizzle schema (all idempotent).
const sqlDirs = ["scripts/migrations", "deploy/migrations", "artifacts/api-server/sql"];
for (const dir of sqlDirs) {
  const abs = path.join(repoRoot, dir);
  for (const file of readdirSync(abs).filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`[db-bootstrap] Applying ${dir}/${file}`);
    await client.query(readFileSync(path.join(abs, file), "utf8"));
  }
}
await ensureIndexes();
await client.end();
console.log("[db-bootstrap] Done.");
