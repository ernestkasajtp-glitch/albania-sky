import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
const doubles = path.resolve("scripts/offerEmailDoubles.ts");
await build({
  entryPoints: ["scripts/offerEmail.test.ts"], outfile: "/tmp/offer-email-tests.mjs",
  platform: "node", bundle: true, format: "esm",
  plugins: [{
    name: "isolated-offer-email-doubles",
    setup(build) {
      build.onResolve({ filter: /^(@workspace\/db|drizzle-orm)$/ }, () => ({ path: doubles }));
      build.onResolve({ filter: /^\.\/(gmail|operationalFailures|liveEvents|logger)$/ }, () => ({ path: doubles }));
    },
  }],
});
await import(pathToFileURL("/tmp/offer-email-tests.mjs").href);
