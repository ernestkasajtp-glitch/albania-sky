import SftpClient from "ssh2-sftp-client";
import { db, flightsTable, cpExportLogTable, settingsTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCitizenPricingSettings, computeCitizenAdultPrice } from "./citizenPricing.js";
import { normalizeAirportCode } from "./airports.js";
import { splitCanonicalFlightNumber } from "./flightIdentifiers.js";
import { isModuleEnabled } from "./moduleControls.js";
import { readFlightDiscounts, discountForChannel, applyFlightDiscount } from "./flightDiscounts.js";

export interface ExportResult {
  ok: boolean;
  flightsExported: number;
  errors: string[];
  csv?: string;
  fileName?: string;
}

// -----------------------------------------------------------------------
// Build luggage_options string: "count-kg-price" e.g. "1-20-0" or "1-23-45"
// If baggage is free (price=0), still include it. Empty string = no hold baggage.
// -----------------------------------------------------------------------
function luggageOptions(
  count: number | null | undefined,
  kg: number | string | null | undefined,
  price: number | string | null | undefined
): string {
  const c = count ?? 0;
  const k = kg != null ? Math.round(Number(kg)) : 0;
  const p = price != null ? Number(price) : 0;
  if (c === 0 && k === 0) return "";
  return `${c}-${k}-${Number(p.toFixed(2))}`;
}

// -----------------------------------------------------------------------
// Format a numeric price value to 2 decimal places as a string
// -----------------------------------------------------------------------
function fmtPrice(val: number | string | null | undefined): string {
  return Number(val ?? 0).toFixed(2);
}

// -----------------------------------------------------------------------
// Global sell-cutoff hours fallback (settings key `sell_cutoff_hours`,
// default 3). Used when a flight has no per-flight sellCutoffHours set, so
// the exported end_selling_date matches exactly what the selling logic
// applies to that flight (public.ts: f.sellCutoffHours ?? globalCutoff).
// -----------------------------------------------------------------------
// Orët "para nisjes" për një fluturim ⭐ të konfirmuar, sipas rregullit:
// mbyllja = nisja − confirmedHours; nëse bie 00:30–09:00 (zyra mbyllur),
// mbyllet 00:30 e asaj dite. Datat/orët tona janë wall-clock Europe/Tirane,
// prandaj mjafton aritmetika e thjeshtë mbi to. Math.ceil → CP mbyll kurrë
// më vonë se sistemi ynë i brendshëm.
function confirmedEndSellingHours(departureDate: string, departureTime: string | null, confirmedHours: number): number {
  try {
    const [y, m, d] = departureDate.split("-").map(Number);
    const [hh = 0, mm = 0] = (departureTime || "00:00").split(":").map(Number);
    const depMs = Date.UTC(y, m - 1, d, hh, mm, 0);
    let closeMs = depMs - confirmedHours * 3_600_000;
    const c = new Date(closeMs);
    const minsOfDay = c.getUTCHours() * 60 + c.getUTCMinutes();
    if (minsOfDay > 30 && minsOfDay < 540) {
      closeMs = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 0, 30, 0);
    }
    const hours = (depMs - closeMs) / 3_600_000;
    return Math.max(confirmedHours, Math.ceil(hours));
  } catch {
    return confirmedHours;
  }
}

// Kufiri i konfirmuar nga settings (confirmed_sell_cutoff_hours, default 4).
async function getConfirmedSellCutoffHours(): Promise<number> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
    const n = parseFloat(rows[0]?.value ?? "");
    return isNaN(n) || n < 0 ? 4 : n;
  } catch { return 4; }
}

async function getGlobalSellCutoffHours(): Promise<number> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "sell_cutoff_hours"));
    const val = rows[0]?.value;
    if (!val) return 3;
    const n = parseFloat(val);
    return isNaN(n) ? 3 : n;
  } catch { return 3; }
}

// -----------------------------------------------------------------------
// CitizenPlane CSV header — comma-separated, 41 columns
// Format per: https://citizenplane.notion.site/Mirroring-instant-cache-file-upload
// -----------------------------------------------------------------------
const CP_HEADER = [
  "segment_1_origin_airport", "segment_1_origin_terminal_airport",
  "segment_1_date_local_takeoff", "segment_1_hours_local_takeoff",
  "segment_1_destination_airport", "segment_1_destination_terminal_airport",
  "segment_1_date_local_landing", "segment_1_hours_local_landing",
  "segment_1_via_airport", "segment_1_airline", "segment_1_flight_number",
  "segment_2_origin_airport", "segment_2_origin_terminal_airport",
  "segment_2_date_local_takeoff", "segment_2_hours_local_takeoff",
  "segment_2_destination_airport", "segment_2_destination_terminal_airport",
  "segment_2_date_local_landing", "segment_2_hours_local_landing",
  "segment_2_via_airport", "segment_2_airline", "segment_2_flight_number",
  "segment_3_origin_airport", "segment_3_origin_terminal_airport",
  "segment_3_date_local_takeoff", "segment_3_hours_local_takeoff",
  "segment_3_destination_airport", "segment_3_destination_terminal_airport",
  "segment_3_date_local_landing", "segment_3_hours_local_landing",
  "segment_3_via_airport", "segment_3_airline", "segment_3_flight_number",
  "luggage_options", "available_seats", "price",
  "outward_price", "return_price", "infant_price",
  "need_apis", "end_selling_date",
].join(",");

// -----------------------------------------------------------------------
// Build CSV text from flights (open, future departure dates)
// -----------------------------------------------------------------------
export async function buildCpExportCsv(): Promise<{ csv: string; count: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const flights = await db
    .select()
    .from(flightsTable)
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${flightsTable.departureDate} >= ${today}`
      )
    )
    .orderBy(flightsTable.departureDate);

  const rows: string[] = [CP_HEADER];

  // end_selling_date is in hours before departure (CitizenPlane format). Use
  // the PER-FLIGHT sell cutoff exactly as currently applied (f.sellCutoffHours),
  // falling back to the global `sell_cutoff_hours` setting when a flight has no
  // per-flight value — mirroring the public selling logic.
  const globalSellCutoff = await getGlobalSellCutoffHours();
  const confirmedSellCutoff = await getConfirmedSellCutoffHours();

  // CitizenPlane price = base adult + global markup, or a per-flight manual
  // override (flights.citizen_price). Read the markup settings once. Infant
  // price is NEVER marked up — it stays at the base infant price.
  const citizenSettings = await getCitizenPricingSettings();
  const discounts = await readFlightDiscounts(flights.map(f => f.id));

  for (const f of flights) {
    const { airlineCode, flightNo } = splitCanonicalFlightNumber(f.flightNumber);
    // Never send a negative availability to CitizenPlane (oversold flights
    // imported with the MBISHITJE policy can push soldSeats above totalSeats).
    // Externally-blocked flights are exported with 0 seats so CitizenPlane
    // closes them immediately (internal sales unaffected).
    const available = f.externalSalesBlocked ? 0 : Math.max(0, (f.totalSeats ?? 0) - (f.soldSeats ?? 0));
    const luggage = luggageOptions(f.checkedBaggageCount, f.checkedBaggageKg, f.checkedBaggagePrice);
    const discount = discountForChannel(discounts.get(f.id) ?? null, "offline");
    const adultPrice  = fmtPrice(applyFlightDiscount(computeCitizenAdultPrice(f, citizenSettings), discount));
    const infantPrice = fmtPrice(applyFlightDiscount(Number(f.infantPrice), discount));
    // Fluturimet e konfirmuara (⭐) përdorin rregullin e konfirmuar (confirmed_sell_cutoff_hours,
    // default 4) + rregullin e zyrës (nëse mbyllja bie 00:30–09:00, mbyllet 00:30) —
    // identik me public.ts / autoSoldOut. CP pret "orë para nisjes", ndaj e shprehim
    // mbylljen si orë (Math.ceil = kurrë më vonë se mbyllja jonë e brendshme).
    // Kufiri MANUAL për-fluturim ka përparësi edhe te të konfirmuarat (⭐) —
    // identik me public.ts / autoSoldOut (rregulli i zyrës vlen gjithsesi).
    const endSellingHours = f.isConfirmed
      ? confirmedEndSellingHours(f.departureDate, f.departureTime, f.sellCutoffHours ?? confirmedSellCutoff)
      : (f.sellCutoffHours ?? globalSellCutoff);

    // segment_1 (11 fields) + segment_2 empty (11) + segment_3 empty (11) + tail (8)
    const row = [
      normalizeAirportCode(f.fromCity), "",   // origin airport, terminal
      f.departureDate, f.departureTime,       // takeoff date, time
      normalizeAirportCode(f.toCity), "",     // destination airport, terminal
      f.arrivalDate, f.arrivalTime,           // landing date, time
      "",                                     // via
      airlineCode, flightNo,                  // airline IATA code, flight number
      // segment 2 — empty (11 cols)
      "","","","","","","","","","","",
      // segment 3 — empty (11 cols)
      "","","","","","","","","","","",
      // tail (8 cols)
      luggage,                                // luggage_options e.g. "1-23-45"
      available,                              // available_seats
      adultPrice,                             // price (adult)
      adultPrice,                             // outward_price
      adultPrice,                             // return_price
      infantPrice,                            // infant_price
      "FALSE",                                // need_apis
      endSellingHours,                        // end_selling_date (hours before departure)
    ].join(",");

    rows.push(row);
  }

  return { csv: rows.join("\n"), count: flights.length };
}

// -----------------------------------------------------------------------
// Upload CSV to CitizenPlane SFTP — path: /flight-ingest
// -----------------------------------------------------------------------
function getSftpConfig() {
  return {
    host: process.env.CITIZENPLANE_FTP_HOST ?? "airdrop.citizenplane.com",
    port: Number(process.env.CITIZENPLANE_FTP_PORT ?? 22),
    username: process.env.CITIZENPLANE_FTP_USER ?? "",
    password: process.env.CITIZENPLANE_FTP_PASSWORD ?? "",
    exportPath: process.env.CITIZENPLANE_EXPORT_PATH ?? "/flight-ingest",
  };
}

export type CpExportSource = "cron" | "manual" | "auto";

async function saveExportLog(result: ExportResult, source: CpExportSource = "cron") {
  try {
    await db.insert(cpExportLogTable).values({
      flightsExported: result.flightsExported,
      status: result.ok ? "success" : "error",
      errors: result.errors.length > 0 ? result.errors.join("\n") : null,
      source,
    });
  } catch (err) {
    logger.error({ err }, "CP Export: gabim gjatë ruajtjes së log-ut");
  }
}

// Process-wide serialization: only one export (cron / manual / auto) may run at
// a time so concurrent SFTP uploads never overlap or race the same remote file.
let cpExportChain: Promise<unknown> = Promise.resolve();

export function runCitizenPlaneExport(source: CpExportSource = "cron"): Promise<ExportResult> {
  const run = cpExportChain.then(() => doCitizenPlaneExport(source));
  // Keep the chain alive even if a run rejects, so later exports still proceed.
  cpExportChain = run.then(() => undefined, () => undefined);
  return run;
}

async function doCitizenPlaneExport(source: CpExportSource = "cron"): Promise<ExportResult> {
  const result: ExportResult = { ok: true, flightsExported: 0, errors: [] };
  if (source === "cron" && !(await isModuleEnabled("offlineFlights"))) {
    return { ok: false, flightsExported: 0, errors: ["Offline flight export stopped: module disabled"] };
  }

  const cfg = getSftpConfig();
  if (!cfg.username || !cfg.password) {
    logger.warn("CP Export: SFTP kredencialet mungojnë");
    result.ok = false;
    result.errors.push("SFTP kredencialet mungojnë (CITIZENPLANE_FTP_USER / CITIZENPLANE_FTP_PASSWORD)");
    await saveExportLog(result, source);
    return result;
  }

  let csvText = "";
  let count = 0;
  try {
    const built = await buildCpExportCsv();
    csvText = built.csv;
    count = built.count;
  } catch (err: any) {
    logger.error({ err }, "CP Export: gabim gjatë gjenerimit të CSV");
    result.ok = false;
    result.errors.push(`Gjenerim CSV: ${err.message}`);
    await saveExportLog(result, source);
    return result;
  }

  if (count === 0) {
    logger.info("CP Export: nuk ka fluturime aktive për eksport");
    result.flightsExported = 0;
    await saveExportLog(result, source);
    return result;
  }

  const sftp = new SftpClient();
  try {
    if (source === "cron" && !(await isModuleEnabled("offlineFlights"))) {
      return { ok: false, flightsExported: 0, errors: ["Offline flight export stopped: module disabled"] };
    }
    await sftp.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
    });

    logger.info({ host: cfg.host, path: cfg.exportPath }, "CP Export: u lidh me SFTP");

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `flights_${date}.csv`;
    const remotePath = `${cfg.exportPath.replace(/\/$/, "")}/${fileName}`;

    const buf = Buffer.from(csvText, "utf-8");
    if (source === "cron" && !(await isModuleEnabled("offlineFlights"))) {
      return { ok: false, flightsExported: 0, errors: ["Offline flight export stopped: module disabled"] };
    }
    await sftp.put(buf, remotePath);

    result.flightsExported = count;
    result.csv = csvText;
    result.fileName = fileName;
    logger.info({ remotePath, count }, "CP Export: skedari u ngarkua me sukses");
  } catch (err: any) {
    logger.error({ err }, "CP Export: gabim SFTP");
    result.ok = false;
    const msg: string = err.message ?? String(err);
    if (msg.toLowerCase().includes("authentication") || msg.toLowerCase().includes("auth")) {
      result.errors.push(
        `Autentifikimi SFTP dështoi — kontrolloni fjalëkalimin CITIZENPLANE_FTP_PASSWORD (${cfg.host})`
      );
    } else {
      result.errors.push(`SFTP upload: ${msg}`);
    }
  } finally {
    try { await sftp.end(); } catch { }
  }

  await saveExportLog(result, source);
  return result;
}

// -----------------------------------------------------------------------
// Event-driven export trigger.
// When a flight's status changes (sales closed / sold out / pending, or
// reopened), CitizenPlane must reflect it immediately instead of waiting for
// the 30-min interval. We debounce so that bulk changes (e.g. closing many
// flights at once) coalesce into a single SFTP upload a few seconds after the
// last change, and guard against overlapping uploads.
// -----------------------------------------------------------------------
// 3 min default (ishte 5s): CP ankohej se merrte shumë skedarë brenda pak
// minutash kur stafi bënte ndryshime radhazi — tani grumbullohen për 3 min.
const CP_EXPORT_DEBOUNCE_MS = Number(process.env.CITIZENPLANE_EXPORT_DEBOUNCE_MS ?? 3 * 60 * 1000);
let cpExportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let cpExportInFlight = false;
let cpExportRerunQueued = false;

async function runAutoCpExport(): Promise<void> {
  if (cpExportInFlight) {
    // An upload is already running — remember to run once more afterwards so we
    // capture any changes that arrived mid-flight.
    cpExportRerunQueued = true;
    return;
  }
  cpExportInFlight = true;
  try {
    await runCitizenPlaneExport("auto");
  } catch (err) {
    logger.error({ err }, "CP Export: eksporti automatik (ndryshim statusi) dështoi");
  } finally {
    cpExportInFlight = false;
    if (cpExportRerunQueued) {
      cpExportRerunQueued = false;
      void runAutoCpExport();
    }
  }
}

/**
 * Schedule an immediate (debounced) CitizenPlane export. Safe to call from any
 * flight-status mutation; multiple rapid calls collapse into one export.
 */
export function triggerCpExportSoon(): void {
  if (cpExportDebounceTimer) clearTimeout(cpExportDebounceTimer);
  cpExportDebounceTimer = setTimeout(() => {
    cpExportDebounceTimer = null;
    void runAutoCpExport();
  }, CP_EXPORT_DEBOUNCE_MS);
}

/**
 * A ndodhi një eksport i suksesshëm brenda `ms` milisekondave të fundit?
 * Përdoret nga cron-i në ndezje të serverit që rinisjet (deploy/pm2 restart)
 * të mos i dërgojnë CitizenPlane skedarë të tepërt të njëpasnjëshëm.
 */
export async function lastCpExportWithinMs(ms: number): Promise<boolean> {
  const [row] = await db.select({ at: cpExportLogTable.exportedAt })
    .from(cpExportLogTable)
    .where(sql`${cpExportLogTable.status} = 'success'`)
    .orderBy(desc(cpExportLogTable.exportedAt))
    .limit(1);
  return !!row && Date.now() - new Date(row.at as any).getTime() < ms;
}

// -----------------------------------------------------------------------
// Fetch recent export logs
// -----------------------------------------------------------------------
export async function getExportLogs(limit = 20) {
  // Kthen logjet e fundit + GJITHMONË gabimet e fundit (edhe nëse janë më të
  // vjetra se logjet e suksesshme të fundit) — që historiku i gabimeve të mos
  // "zhduket" kur cron-i çdo 30 min i mbush 100 rreshtat e fundit me suksese.
  const [recent, recentErrors] = await Promise.all([
    db.select().from(cpExportLogTable).orderBy(desc(cpExportLogTable.exportedAt)).limit(limit),
    db.select().from(cpExportLogTable)
      .where(sql`${cpExportLogTable.status} <> 'success'`)
      .orderBy(desc(cpExportLogTable.exportedAt))
      .limit(30),
  ]);
  const seen = new Set(recent.map(r => r.id));
  const merged = [...recent, ...recentErrors.filter(r => !seen.has(r.id))];
  merged.sort((a, b) => new Date(b.exportedAt as any).getTime() - new Date(a.exportedAt as any).getTime());
  return merged;
}
