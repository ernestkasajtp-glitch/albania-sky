/**
 * Run with pnpm --filter @workspace/api-server test:modules-restart.
 * Requires PostgreSQL initdb/pg_ctl/psql on PATH and a non-root OS user.
 * Creates its OWN disposable cluster, never uses inherited DATABASE_URL/PG*.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(path.join(tmpdir(), "module-restart-"));
const data = path.join(root, "data");
const socket = path.join(root, "socket");
const out = path.join(cwd, "node_modules/.cache", path.basename(root));
// Do not pass credentials, app settings, NODE_OPTIONS or external service keys.
const env = { PATH: process.env.PATH, HOME: root, LANG: "C", NODE_ENV: "test" };
let activeChild;
let stopping;
let clusterStarted = false;

function run(command, args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
    activeChild = child;
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = undefined;
      if (code === 0) resolve(output);
      else reject(new Error(`${command} failed (${code}):\n${output}`));
    });
  });
}

async function cleanup() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (activeChild) {
      const child = activeChild;
      await new Promise(resolve => { child.once("close", resolve); child.kill("SIGKILL"); });
    }
    try {
      if (clusterStarted) {
        // Explicitly remove all test rows before destroying the cluster.
        await run("psql", ["-h", socket, "-U", "fixture", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
          "-c", "DROP TABLE IF EXISTS settings"]);
      }
    } finally {
      // Even failed SQL cleanup must stop PostgreSQL. Also cover interrupted
      // startup. If stopping fails, retain its directory for diagnosis.
      let hasPid = false;
      try {
        await access(path.join(data, "postmaster.pid"));
        hasPid = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (hasPid) await run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
      await rm(root, { recursive: true, force: true });
      await rm(out, { recursive: true, force: true });
    }
  })();
  return stopping;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().then(() => process.exit(1), error => { console.error(error); process.exit(1); });
  });
}

try {
  await mkdir(socket);
  await run("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  // Unix socket only: no TCP listener and no collision with the development DB.
  await run("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"),
    "-o", `-F -c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"]);
  clusterStarted = true;
  await run("psql", ["-h", socket, "-U", "fixture", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-c", "CREATE TABLE settings (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now())"]);
  await run(process.execPath, ["build-script.mjs", "scripts/moduleControls.restart.fixture.ts", out]);
  const childEnv = {
    DATABASE_URL: `postgresql://fixture@localhost/postgres?host=${encodeURIComponent(socket)}`,
    MODULE_RESTART_FIXTURE: "isolated-postgres",
  };
  const pids = new Set();
  for (const phase of ["disable", "reenable", "verify"]) {
    const output = await run(process.execPath, [path.join(out, "moduleControls.restart.fixture.mjs"), phase], childEnv);
    console.log(output.trim());
    const match = output.match(/fresh process (\d+)/);
    assert.ok(match, "fixture must finish all assertions");
    assert.ok(!pids.has(match[1]), "restart must use a new OS process");
    pids.add(match[1]);
  }
} finally {
  await cleanup();
}
await assert.rejects(access(root), { code: "ENOENT" });
await assert.rejects(access(out), { code: "ENOENT" });
console.log("PASS cleanup: test rows, disposable PostgreSQL cluster and build output removed");