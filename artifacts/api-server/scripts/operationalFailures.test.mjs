import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tmp = await mkdtemp(join(tmpdir(), "operational-failures-"));
try {
  const routeSource = await readFile(resolve("src/routes/flights.ts"), "utf8");
  const pdfSource = routeSource.slice(routeSource.indexOf("async function generateSchedulePdf("), routeSource.indexOf("async function sendScheduleReport("));
  if (!pdfSource.includes("reportPdfText(val)")) throw new Error("Actual report generator not found");
  await build({
    stdin: { resolveDir: process.cwd(), loader: "ts", contents: `
      import assert from "node:assert/strict";
      import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
      import { reportPdfText } from "./src/lib/reportPdfText";
      import { reportOperationalFailure } from "./src/lib/operationalFailures";
      const state = globalThis.fixture = { rows: [], emails: 0, updates: 0, dbFails: false, mailFails: false };
      process.env.NOTIFY_EMAIL = "test@example.invalid";
      await reportOperationalFailure("report", "Raporti", new Error("PDF failed"));
      assert.equal(state.rows.length, 1);
      assert.equal(state.emails, 1);
      await reportOperationalFailure("report", "Raporti", new Error("Again"));
      assert.equal(state.rows.length, 1);
      assert.equal(state.emails, 1, "No repeated failure emails while unresolved");
      assert.equal(state.updates, 1);
      state.rows = [];
      state.mailFails = true;
      await reportOperationalFailure("other", "Raporti tjetër", new Error("Failure"));
      assert.equal(state.rows.length, 1, "Alert survives email failure");
      state.rows = [];
      const before = state.emails;
      await reportOperationalFailure("smtp", "Email", new Error("454"), false);
      assert.equal(state.emails, before, "SMTP failure must never send recursive mail");
      delete process.env.NOTIFY_EMAIL;
      state.rows = [];
      await reportOperationalFailure("no-mail", "Report", new Error("Failure"));
      assert.equal(state.rows.length, 1, "Alert independent of mail configuration");
      state.dbFails = true;
      await reportOperationalFailure("db", "Report", new Error("Failure"));
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const sample = reportPdfText('HAM → TIA €150 — “Ora” … Çmimi 🚀');
      assert.equal(sample, 'HAM -> TIA €150 - "Ora" ... Çmimi ??');
      assert.doesNotThrow(() => font.encodeText(sample));
      doc.addPage().drawText(sample, { font });
      assert.ok((await doc.save()).length > 100);
      const STATUS_LABELS = { time_changed: "Ndryshuar", unchanged: "Pa ndryshim", not_found: "Nuk gjendet" };
      const formatWholeEuro = n => String(Math.round(n));
      ${pdfSource}
      const rows = Array.from({ length: 50 }, (_, i) => ({
        route: "HAM → TIA", flightNumber: "W45168", airline: "Wizz Air",
        departureDate: "2026-12-25", ourDepartureTime: "20:25", ourArrivalTime: "22:55",
        googleDepartureTime: null, googleArrivalTime: null, ourPrice: 150, googlePrice: null,
        status: i % 2 ? "not_found" : "time_changed",
        changes: [{field:"Nisja → Mbërritja", old:"20:25 — 22:55", new:"“21:25”"}],
      }));
      const actualPdf = await generateSchedulePdf(rows, "TË GJITHA RRUGËT", "", "2026-10-03", "2026-12-31");
      assert.ok((await PDFDocument.load(actualPdf)).getPageCount() > 1, "Actual multi-page schedule report works with arrows and missing prices");
      console.log("PASS: PDF encoding; persistent failure alerts; dedupe; SMTP/no-config/DB failures");
    ` },
    outfile: join(tmp, "test.mjs"), bundle: true, platform: "node", format: "esm",
    plugins: [{
      name: "isolated-failure-dependencies",
      setup(b) {
        b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        b.onResolve({ filter: /\.\/(gmail|logger)\.js$/ }, args => ({ path: args.path.includes("gmail") ? "mail" : "logger", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents:
          path === "db" ? `
            export const cpImportAlertsTable = { id: 1, source: "source", resolvedAt: null };
            export const db = { async transaction(fn) {
              const s = globalThis.fixture;
              if (s.dbFails) throw new Error("DB unavailable");
              return fn({
                execute: async () => {},
                select: () => ({ from: () => ({ where: () => ({ limit: async () => s.rows }) }) }),
                update: () => ({ set: () => ({ where: async () => { s.updates++; } }) }),
                insert: () => ({ values: async value => { s.rows.push({ id: 1, ...value }); } })
              });
            }};
          ` : path === "mail" ? `
            export async function sendEmailStrict() {
              globalThis.fixture.emails++;
              if (globalThis.fixture.mailFails) throw new Error("SMTP unavailable");
            }
          ` : "export const logger = { error() {} };",
        }));
      },
    }],
  });
  await import(pathToFileURL(join(tmp, "test.mjs")).href);
} finally {
  await rm(tmp, { recursive: true, force: true });
}