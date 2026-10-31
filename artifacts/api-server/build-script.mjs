import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[2];
const outdir = process.argv[3];
if (!entry || !outdir) {
  console.error("usage: node build-script.mjs <entry.ts> <outdir>");
  process.exit(1);
}

await esbuild({
  entryPoints: [path.resolve(artifactDir, entry)],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.resolve(artifactDir, outdir),
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  external: [
    "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2",
    "fsevents", "re2", "pg-native", "ssh2", "cpu-features", "lightningcss",
    "@aws-sdk/*", "googleapis", "@google-cloud/*", "@google/*",
  ],
  sourcemap: false,
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);`,
  },
}).catch((e) => { console.error(e); process.exit(1); });
console.log("built", outdir);
