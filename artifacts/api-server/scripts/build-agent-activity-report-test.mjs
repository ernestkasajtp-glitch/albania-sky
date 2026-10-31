import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(dir, "agentActivityReport.fixture.ts");
const schema = path.resolve(dir, "../../../lib/db/src/schema/index.ts");
const report = path.resolve(dir, "../src/lib/agentActivityReport.ts");
await build({
  entryPoints: [path.join(dir, "agentActivityReport.integration.test.ts")],
  outfile: path.join(dir, "../node_modules/.cache/agent-activity-report/test.mjs"),
  bundle: true, platform: "node", format: "esm",
  external: ["@electric-sql/pglite", "pino", "googleapis", "pg-native", "ssh2"],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  plugins: [{
    name: "isolated-activity-boundaries",
    setup(b) {
      b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "controlled" }));
      b.onResolve({ filter: /^nodemailer$/ }, () => ({ path: "smtp", namespace: "controlled" }));
      b.onResolve({ filter: /\/operationalFailures(\.js)?$/ }, () => ({ path: "failures", namespace: "controlled" }));
      b.onResolve({ filter: /\/failedEmail(\.js)?$/ }, () => ({ path: "recovery", namespace: "controlled" }));
      b.onResolve({ filter: /^independent-report-worker$/ }, () => ({ path: report, namespace: "worker" }));
      b.onLoad({ filter: /.*/, namespace: "worker" }, async () => ({
        contents: await readFile(report, "utf8"), loader: "ts", resolveDir: path.dirname(report),
      }));
      b.onLoad({ filter: /.*/, namespace: "controlled" }, ({ path: name }) => ({
        contents: {
          db: `export * from ${JSON.stringify(schema)}; export { db, pool } from ${JSON.stringify(fixture)};`,
          smtp: `export { transport as default } from ${JSON.stringify(fixture)};`,
          failures: `import { failures } from ${JSON.stringify(fixture)}; export async function reportOperationalFailure(...args) { failures.push(args); }`,
          recovery: `import { recoveryCopies } from ${JSON.stringify(fixture)}; export const failedEmails = { record: async (...args) => recoveryCopies.push(args) };`,
        }[name],
        loader: "ts", resolveDir: dir,
      }));
    },
  }],
});
