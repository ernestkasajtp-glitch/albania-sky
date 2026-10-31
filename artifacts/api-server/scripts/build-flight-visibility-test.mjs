import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import esbuildPluginPino from "esbuild-plugin-pino";

const dir = path.dirname(fileURLToPath(import.meta.url));
globalThis.require = createRequire(import.meta.url);
const root = path.resolve(dir, "../../..");
await build({
  entryPoints: [path.join(dir, "flightVisibility.test.ts")],
  outdir: path.join(dir, "../node_modules/.cache/flight-visibility-test"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "bundle",
  external: ["*.node", "pg-native", "ssh2", "cpu-features", "googleapis"],
  plugins: [
    {
      name: "memory-only-db",
      setup(build) {
        build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "fixture-db", namespace: "fixture-db" }));
        build.onLoad({ filter: /.*/, namespace: "fixture-db" }, () => ({
          contents: `export * from ${JSON.stringify(path.join(root, "lib/db/src/schema/index.ts"))};
// Public flight visibility must never perform module-control SQL writes.
export { db, pool } from ${JSON.stringify(path.join(dir, "flightVisibility.fixture.ts"))};`,
          loader: "ts",
          resolveDir: root,
        }));
      },
    },
    esbuildPluginPino({ transports: ["pino-pretty"] }),
  ],
  banner: { js: `import { createRequire as __cr } from "node:module";
import __p from "node:path"; import __u from "node:url";
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);` },
});