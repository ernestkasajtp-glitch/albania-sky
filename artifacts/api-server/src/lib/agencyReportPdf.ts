import { access, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
let rendering = false;
async function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_BIN, "/usr/local/bin/chromium", "/usr/bin/chromium",
    "/usr/bin/chromium-browser", "/snap/bin/chromium",
    "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
    ...(process.env.PATH || "").split(delimiter).map(p => join(p, "chromium")),
  ].filter((p): p is string => !!p);
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  throw new Error("Chromium mungon në server; raporti PDF nuk mund të gjenerohet.");
}

/** Local-only escaped HTML, no remote resources, isolated files and bounded runtime.
 * Reuses the server's existing Chromium installation used by ticket PDFs.
 */
export async function agencyReportPDF(html: string): Promise<Buffer> {
  if (rendering) throw new Error("Një raport tjetër po përgatitet. Provoni përsëri pas pak.");
  rendering = true;
  let dir: string | undefined;
  try {
    const bin = await chromiumPath();
    dir = await mkdtemp(join(tmpdir(), "agency-report-"));
    const input = join(dir, "report.html"), output = join(dir, "report.pdf");
    // Defense in depth: even future accidental markup cannot load external content.
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;
    await writeFile(input, html.replace("<head>", `<head>${csp}`), { mode: 0o600 });
    await run(bin, [
      "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--disable-background-networking", "--disable-extensions", "--no-first-run",
      "--no-pdf-header-footer", `--user-data-dir=${join(dir, "profile")}`,
      `--print-to-pdf=${output}`, pathToFileURL(input).href,
    ], { timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF i pavlefshëm.");
    return pdf;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    rendering = false;
  }
}
