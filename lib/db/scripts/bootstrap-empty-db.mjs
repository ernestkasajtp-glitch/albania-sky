// Creates the full schema on an EMPTY database (e.g. a fresh Render Postgres).
// If the database already has the `flights` table it does nothing, so it never
// touches a database restored from the VPS or one already in use.
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
const { rows } = await client.query("SELECT to_regclass('public.flights') AS t");
if (rows[0].t) {
  console.log("[db-bootstrap] Database already has tables — skipping.");
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
await client.end();
console.log("[db-bootstrap] Done.");
