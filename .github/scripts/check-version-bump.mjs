// CI guard: every PR that changes the app must raise the FMS version.
// The "Version i ri i sistemit / Bëj Hard Refresh" banner only appears when
// APP_VERSION changes, so a release without a bump goes unnoticed by users.
//
// Usage: node .github/scripts/check-version-bump.mjs <base-ref>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "origin/main";
const VERSION_FILE = "artifacts/flight-system/src/lib/version.ts";
const CHANGELOG_FILE = "artifacts/flight-system/src/lib/changelog.ts";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
const appChanges = changed.filter(f =>
  /^(artifacts|lib)\//.test(f) && !/\.(md|test\.[cm]?[jt]s)$/.test(f) && !/\/scripts\/.*\.test\./.test(f));
if (appChanges.length === 0) {
  console.log("No app changes — version bump not required.");
  process.exit(0);
}

const readVersion = src => src.match(/APP_VERSION\s*=\s*"([\d.]+)"/)?.[1];
const baseVersion = readVersion(git("show", `${base}:${VERSION_FILE}`));
const headVersion = readVersion(readFileSync(VERSION_FILE, "utf8"));
const cmp = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

const fail = msg => {
  console.error(`::error file=${VERSION_FILE}::${msg}`);
  console.error(`Changed app files:\n  ${appChanges.slice(0, 20).join("\n  ")}`);
  process.exit(1);
};
if (!baseVersion || !headVersion) fail("Could not read APP_VERSION.");
if (cmp(headVersion, baseVersion) <= 0) {
  fail(`APP_VERSION must be raised (base ${baseVersion}, this PR ${headVersion}). ` +
    `Bump it in ${VERSION_FILE} and add a CHANGELOG entry so users see the update banner.`);
}
if (!readFileSync(CHANGELOG_FILE, "utf8").includes(`version: "${headVersion}"`)) {
  fail(`Add a CHANGELOG entry for version ${headVersion} in ${CHANGELOG_FILE}.`);
}
console.log(`Version bumped ${baseVersion} → ${headVersion}.`);
