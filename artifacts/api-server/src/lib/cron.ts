import { sendDailyAgentActivityReport } from "./agentActivityReport";
import { isOfflineLuggageError } from "./offlineImportFiles";
import { startDailyGoogleRefresh } from "./googleRefreshSchedule";
import { db, bookingsTable, paymentsTable, passengersTable, flightsTable, agentsTable, settingsTable, agentActivityTable } from "@workspace/db";
import { gte, lte, and, eq, sql, desc, notInArray } from "drizzle-orm";
import { sendEmail } from "./gmail.js";
import { syncGoogleSheetsNow } from "./googleSheets.js";
import { runCitizenPlaneImport } from "./pnlImport.js";
import { runCitizenPlaneEmailImport } from "./emailImport.js";
import { runCitizenPlaneExport, triggerCpExportSoon, lastCpExportWithinMs } from "./cpExport.js";
import { runDailyScheduleCheckEmail, startGooglePriceWarmer, startNoPriceWarmer, startStalePriceWarmer, startNewPriceWarmer, runDailyForcedGooglePriceRefresh } from "../routes/flights.js";
import { startSeatCheckScheduler } from "./seatCheck.js";
import { startLowSeatTaskScheduler } from "./lowSeatTasks.js";
import { startSuspectRecheckScheduler } from "./suspectFlightRecheck.js";
import { fetchGoogleFlightSchedules } from "../routes/flights.js";
import { scheduleNextAutoSoldOut } from "./autoSoldOut.js";
import { sendDailyPassengersReport } from "./passengersReport.js";
import { sendDailySalesReport } from "./salesReport.js";
import { sendWeeklyAgentDebtReports } from "./agentDebtWeekly.js";
import { logger } from "./logger.js";
import { recordImportAlert } from "./importAlerts.js";
import { reportOperationalFailure } from "./operationalFailures.js";
import { scanNewWizzTicketEmails, sweepMissingSavedTickets } from "./wizzTicket.js";
import { scanScheduleChangeEmails } from "./scheduleEmailAlert.js";
import { startFlightDiscoveryScheduler } from "../routes/flightDiscovery.js";
import { startWizzPriceMonitorScheduler } from "./wizzPriceMonitor.js";
import { isModuleEnabled } from "./moduleControls.js";

function pad(n: number) { return String(n).padStart(2, "0"); }

function toAlbaniaDate(d: Date) {
  return d.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" });
}

// Offset (ms) between Europe/Tirane wall-clock and UTC at a given instant.
function albaniaOffsetMsAt(at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: "Europe/Tirane" }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}

// UTC instant of Albania-local 00:00:00 for the given Y/M/D. The offset is read
// at ~local midnight (well away from the 03:00 DST switch), so it is exact.
function albaniaMidnightUtc(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const offset = albaniaOffsetMsAt(new Date(guess));
  return new Date(guess - offset);
}

// Start/end (UTC instants) of the Albania calendar day that contains `ref`,
// plus a "DD.MM.YYYY" label for that day. DST-correct: the end is computed as
// (start of the NEXT Albania day − 1ms), so DST changeover days (23h/25h) work.
function albaniaDayWindow(ref: Date): { startOfDay: Date; endOfDay: Date; label: string } {
  const [y, m, d] = ref.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }).split("-").map(Number);
  const startOfDay = albaniaMidnightUtc(y, m, d);
  // +26h lands firmly inside the next Albania day regardless of a 23h/25h DST day.
  const [ny, nm, nd] = new Date(startOfDay.getTime() + 26 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }).split("-").map(Number);
  const nextStart = albaniaMidnightUtc(ny, nm, nd);
  const endOfDay = new Date(nextStart.getTime() - 1);
  const label = `${pad(d)}.${pad(m)}.${y}`;
  return { startOfDay, endOfDay, label };
}

// Ora shfaqet 12-orëshe me AM/PM (vetëm paraqitje — ruajtja mbetet 24-orëshe).
function albaniaTime(d: Date) {
  return d.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true });
}

const BOOKING_STATUS_AL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Konfirmuar",
  ticketed: "Me Biletë",
  cancelled: "Anuluar",
};

function buildCsvRow(values: (string | number | null | undefined)[]) {
  return values.map(v => {
    const s = String(v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  }).join(",");
}

// Raporti i vjetër bazik i orës 20 UTC u zëvendësua nga raporti premium i
// shitjeve (lib/salesReport.ts), i planifikuar në 23:55 Albania te startCronJobs.

async function sendDailyBackup() {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;

  const today = new Date().toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane" });

  const bookings = await db.select().from(bookingsTable);
  const flights = await db.select().from(flightsTable);
  const payments = await db.select().from(paymentsTable);
  const agents = await db.select().from(agentsTable);

  const flightMap = new Map(flights.map(f => [f.id, f]));
  const agentMap = new Map(agents.map(a => [a.id, a]));

  const bookingsCsvHeader = "ID,Referenca,PNR,Klienti,Email,Fluturimi,Agjenti,Statusi,Total,Paguar,Data\n";
  const bookingsCsvBody = bookings.map(b => buildCsvRow([
    b.id, b.bookingRef, b.pnr ?? "",
    b.customerName, b.customerEmail ?? "",
    `${flightMap.get(b.flightId)?.airline ?? ""} ${flightMap.get(b.flightId)?.flightNumber ?? ""}`,
    agentMap.get(b.agentId ?? 0)?.name ?? "",
    b.status,
    String(Math.round(Number(b.totalAmount))),
    String(Math.round(Number(b.paidAmount))),
    b.createdAt.toISOString().slice(0, 10),
  ])).join("\n");

  const paymentsCsvHeader = "ID,BookingRef,Shuma,Metoda,Statusi,Rimbursim,Data\n";
  const paymentsCsvBody = payments.map(p => {
    const bk = bookings.find(b => b.id === p.bookingId);
    return buildCsvRow([
      p.id, bk?.bookingRef ?? p.bookingId,
      String(Math.round(Number(p.amount))),
      p.method, p.status,
      p.isRefund ? "PO" : "JO",
      p.createdAt.toISOString().slice(0, 10),
    ]);
  }).join("\n");

  const html = `
    <h2>Backup Ditor — ${today}</h2>
    <p>Bashkangjitur gjeni dy skedarë CSV:</p>
    <ul>
      <li><strong>bookings_${today.replace(/\//g, "-")}.csv</strong> — ${bookings.length} rezervime</li>
      <li><strong>payments_${today.replace(/\//g, "-")}.csv</strong> — ${payments.length} pagesa</li>
    </ul>
    <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
  `;

  const dateSlug = today.replace(/\//g, "-");
  await sendEmail(notifyTo, `💾 Backup Ditor FMS Pro — ${today}`, html, [
    { filename: `bookings_${dateSlug}.csv`, content: bookingsCsvHeader + bookingsCsvBody },
    { filename: `payments_${dateSlug}.csv`, content: paymentsCsvHeader + paymentsCsvBody },
  ]).catch(() => {});
}

// End-of-day summary — runs at 00:01 Albania time and reports on the day that
// just ended. It first refreshes the Google Sheets backup so the "Excel" link
// reflects the full day, then emails a summary of every action of the day:
// new bookings, payments, refunds, cancellations, new flights, and the agent
// activity log (logins, searches, bookings, payments, …).
async function sendEndOfDaySummary() {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;

  // Refresh the full Google Sheets backup BEFORE building the email so the link
  // points at end-of-day data.
  await syncGoogleSheetsNow().catch((e) => console.error("[cron] gsheets sync (eod) failed:", e));

  // At 00:01 the day that just ended is "yesterday"; shift back a few minutes.
  const ref = new Date(Date.now() - 5 * 60 * 1000);
  const { startOfDay, endOfDay, label } = albaniaDayWindow(ref);

  const [bookings, payments, flights, agents, activity] = await Promise.all([
    db.select().from(bookingsTable),
    db.select().from(paymentsTable),
    db.select().from(flightsTable),
    db.select().from(agentsTable),
    db.select().from(agentActivityTable)
      .where(and(gte(agentActivityTable.createdAt, startOfDay), lte(agentActivityTable.createdAt, endOfDay)))
      .orderBy(agentActivityTable.createdAt),
  ]);

  const flightMap = new Map(flights.map(f => [f.id, f]));
  const agentMap = new Map(agents.map(a => [a.id, a]));
  const inDay = (d: Date | null | undefined) => !!d && d >= startOfDay && d <= endOfDay;

  const newBookings = bookings.filter(b => inDay(b.createdAt));
  const cancelledToday = bookings.filter(b => b.status === "cancelled" && inDay(b.updatedAt));
  const dayPayments = payments.filter(p => inDay(p.createdAt) && p.status === "completed" && !p.isRefund);
  const dayRefunds = payments.filter(p => inDay(p.createdAt) && p.status === "completed" && p.isRefund);
  const newFlights = flights.filter(f => inDay(f.createdAt));

  const revToday = dayPayments.reduce((s, p) => s + Number(p.amount), 0);
  const refundToday = dayRefunds.reduce((s, p) => s + Number(p.amount), 0);
  const salesToday = newBookings.reduce((s, b) => s + Number(b.totalAmount), 0);

  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const flLabel = (id: number | null | undefined) => {
    const f = id ? flightMap.get(id) : null;
    return f ? `${f.airline} ${f.flightNumber} (${f.fromCity}→${f.toCity})` : "";
  };

  // ── Summary metrics ───────────────────────────────────────────────────────
  const metricsTable = `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <tr style="background:#f0f0f0"><th align="left">Veprimi i ditës</th><th align="left">Numri / Vlera</th></tr>
      <tr><td>Rezervime të reja</td><td><strong>${newBookings.length}</strong> (€${Math.round(salesToday)})</td></tr>
      <tr><td>Pagesa</td><td><strong>${dayPayments.length}</strong> (€${Math.round(revToday)})</td></tr>
      <tr><td>Rimbursime</td><td><strong>${dayRefunds.length}</strong> (€${Math.round(refundToday)})</td></tr>
      <tr><td>Rezervime të anuluara</td><td><strong>${cancelledToday.length}</strong></td></tr>
      <tr><td>Fluturime të reja</td><td><strong>${newFlights.length}</strong></td></tr>
      <tr><td>Veprime të agjentëve (total)</td><td><strong>${activity.length}</strong></td></tr>
    </table>`;

  // ── New bookings ──────────────────────────────────────────────────────────
  const bookingsSection = newBookings.length === 0 ? "<p>Asnjë rezervim i ri.</p>" : `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">
      <tr style="background:#f0f0f0"><th>Ora</th><th>Referenca</th><th>Klienti</th><th>Fluturimi</th><th>Agjenti</th><th>Total</th><th>Statusi</th></tr>
      ${newBookings.map(b => `<tr>
        <td>${albaniaTime(b.createdAt)}</td>
        <td>${esc(b.bookingRef)}</td>
        <td>${esc(b.customerName)}</td>
        <td>${esc(flLabel(b.flightId))}</td>
        <td>${esc(b.agentId ? agentMap.get(b.agentId)?.name ?? "" : "")}</td>
        <td>€${Math.round(Number(b.totalAmount))}</td>
        <td>${esc(BOOKING_STATUS_AL[b.status] ?? b.status)}</td>
      </tr>`).join("")}
    </table>`;

  // ── Payments + refunds ────────────────────────────────────────────────────
  const allPayRows = [...dayPayments, ...dayRefunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const paymentsSection = allPayRows.length === 0 ? "<p>Asnjë pagesë.</p>" : `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">
      <tr style="background:#f0f0f0"><th>Ora</th><th>Referenca</th><th>Shuma</th><th>Tipi</th><th>Metoda</th></tr>
      ${allPayRows.map(p => {
        const bk = bookings.find(b => b.id === p.bookingId);
        return `<tr>
          <td>${albaniaTime(p.createdAt)}</td>
          <td>${esc(bk?.bookingRef ?? p.bookingId)}</td>
          <td>€${Math.round(Number(p.amount))}</td>
          <td>${p.isRefund ? "Rimbursim" : "Pagesë"}</td>
          <td>${esc(p.method ?? "")}</td>
        </tr>`;
      }).join("")}
    </table>`;

  // ── Agent activity log (capped to keep the email reasonable) ───────────────
  const ACT_CAP = 500;
  const shown = activity.slice(0, ACT_CAP);
  const activitySection = activity.length === 0 ? "<p>Asnjë veprim i regjistruar.</p>" : `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">
      <tr style="background:#f0f0f0"><th>Ora</th><th>Agjenti</th><th>Veprimi</th><th>Statusi</th></tr>
      ${shown.map(a => `<tr>
        <td>${albaniaTime(a.createdAt)}</td>
        <td>${esc(agentMap.get(a.agentId)?.name ?? `#${a.agentId}`)}</td>
        <td>${esc(a.description ?? `${a.method ?? ""} ${a.path ?? ""}`)}</td>
        <td>${a.statusCode ?? ""}</td>
      </tr>`).join("")}
    </table>
    ${activity.length > ACT_CAP ? `<p style="color:#888;font-size:12px">… dhe ${activity.length - ACT_CAP} veprime të tjera (shih Google Sheet për të plotat).</p>` : ""}`;

  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetLink = sheetId
    ? `<p style="font-size:14px"><strong>📊 Excel (Google Sheets) — backup i plotë i sistemit:</strong><br>
       <a href="https://docs.google.com/spreadsheets/d/${sheetId}/edit">https://docs.google.com/spreadsheets/d/${sheetId}/edit</a></p>`
    : "";

  const html = `
    <h2>Përmbledhje Ditore — ${label}</h2>
    ${sheetLink}
    <h3>Përmbledhje</h3>
    ${metricsTable}
    <h3>Rezervimet e reja (${newBookings.length})</h3>
    ${bookingsSection}
    <h3>Pagesat &amp; Rimbursimet (${allPayRows.length})</h3>
    ${paymentsSection}
    <h3>Veprimet e agjentëve (${activity.length})</h3>
    ${activitySection}
    <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro — fund i ditës ${label}</p>
  `;

  await sendEmail(notifyTo, `📋 Përmbledhje Ditore FMS Pro — ${label}`, html).catch(() => {});
}

// Auto sold-out by sell cutoff: see ./autoSoldOut.ts. It is event-driven (a
// single precise timer recomputed on create/edit/import/cutoff-change) rather
// than a fixed poll, and is armed once on startup below.

export function startCronJobs() {
  startLowSeatTaskScheduler();
  // Run daily at 23:00 Albanian time (UTC+2, so 21:00 UTC)
  const BACKUP_HOUR_UTC = 21;

  function scheduleAt(hourUTC: number, task: () => Promise<void>) {
    function runAt() {
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(hourUTC, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      const delay = next.getTime() - now.getTime();
      setTimeout(async () => {
        try { await task(); } catch (e) {
          logger.error({ err: e }, "Cron error");
          await reportOperationalFailure(`cron-utc-${hourUTC}`, hourUTC === 5 ? "Raporti i orareve" : "Backup ditor", e);
        }
        runAt(); // reschedule for next day
      }, delay);
    }
    runAt();
  }

  // Offset (ms) between Europe/Tirane wall-clock and UTC at the given instant.
  function albaniaOffsetMs(at: Date): number {
    const local = new Date(at.toLocaleString("en-US", { timeZone: "Europe/Tirane" }));
    const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
    return local.getTime() - utc.getTime();
  }

  // Schedule a task daily at EXACTLY `hour`:`minute` Europe/Tirane wall-clock,
  // correct year-round across DST (unlike the fixed-UTC scheduleAt above).
  function scheduleDailyAlbania(hour: number, minute: number, task: () => Promise<void>) {
    function runAt() {
      const now = new Date();
      const offset = albaniaOffsetMs(now);
      // Shift now so its UTC getters read Albania wall-clock, set the target hour,
      // then convert back to a real UTC instant by subtracting the offset.
      const albNow = new Date(now.getTime() + offset);
      const target = new Date(albNow);
      target.setUTCHours(hour, minute, 0, 0);
      if (target.getTime() <= albNow.getTime()) target.setUTCDate(target.getUTCDate() + 1);
      // Recompute the offset at the target instant so a DST change between now and
      // the run time doesn't shift the local hour.
      let instant = target.getTime() - offset;
      const offsetAtTarget = albaniaOffsetMs(new Date(instant));
      if (offsetAtTarget !== offset) instant = target.getTime() - offsetAtTarget;
      let delay = instant - now.getTime();
      if (delay < 0) delay += 24 * 60 * 60 * 1000;
      logger.info(
        { nextRun: new Date(now.getTime() + delay).toLocaleString("sq-AL", { timeZone: "Europe/Tirane" }) },
        `[cron] daily ${pad(hour)}:${pad(minute)} Albania task scheduled`,
      );
      setTimeout(async () => {
        try { await task(); } catch (e) {
          logger.error({ err: e }, "Cron error");
          await reportOperationalFailure(`cron-tirane-${hour}-${minute}`, `Raporti automatik ${pad(hour)}:${pad(minute)}`, e);
        }
        runAt();
      }, delay);
    }
    runAt();
  }

  // Automatic schedule check vs Google for all future flights — once every 24h
  const SCHEDULE_CHECK_HOUR_UTC = 5; // ~07:00 Albania time

  scheduleAt(BACKUP_HOUR_UTC, async () => { if (await isModuleEnabled("reports")) await sendDailyBackup(); });
  scheduleAt(SCHEDULE_CHECK_HOUR_UTC, async () => { if (await isModuleEnabled("scheduleCheck")) await runDailyScheduleCheckEmail(); });

  // Raporti ditor PREMIUM i shitjeve (email elegant + PDF me listën e plotë,
  // shumën dhe komisionin) — çdo natë në 23:55 Albania, kur dita e shitjeve
  // është pothuajse e mbyllur. Zëvendëson raportin e vjetër bazik të orës 20 UTC.
  scheduleDailyAlbania(23, 55, async () => { if (await isModuleEnabled("reports")) await sendDailySalesReport(); });

  // Raporti javor i detyrimeve për agjentët e selektuar (weekly_debt_report)
  // që kanë detyrim real — çdo të HËNË në 07:00 sipas orës së Shqipërisë.
  scheduleDailyAlbania(7, 0, async () => {
    if (!(await isModuleEnabled("reports"))) return;
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Tirane" }).format(new Date());
    if (weekday !== "Mon") return;
    await sendWeeklyAgentDebtReports();
  });

  // One daily refresh at the saved Albania wall-clock time (default 02:00).
  // Changing the time is picked up without restarting; no second fixed job.
  startDailyGoogleRefresh(runDailyForcedGooglePriceRefresh);

  // End-of-day summary + Google Sheets backup refresh at EXACTLY 00:01 Albania.
  scheduleDailyAlbania(0, 1, async () => { if (await isModuleEnabled("reports")) await sendEndOfDaySummary(); });

  // Raporti "Pasagjerët e Ditës" (numri + PDF lista + komisioni) në 00:01
  // sipas orës së Shqipërisë — sapo mbaron dita, me pasagjerët e ditës që
  // sapo përfundoi (jo të ditës së re).
  scheduleDailyAlbania(0, 1, async () => { if (await isModuleEnabled("reports")) await sendDailyPassengersReport(); });
  scheduleDailyAlbania(0, 1, async () => { if (await isModuleEnabled("reports")) await sendDailyAgentActivityReport(); });
  // Catch missed midnight runs after downtime and surface abandoned claims.
  // A durable cursor bounds work to seven days per pass; no ambiguous send is retried.
  const recoverAgentActivity = async () => {
    try {
      if (await isModuleEnabled("reports")) await sendDailyAgentActivityReport();
    } catch (error) {
      await reportOperationalFailure("agent-activity-report-recovery", "Rikuperimi i raporteve të aktivitetit", error);
    }
  };
  setTimeout(() => { void recoverAgentActivity(); }, 30_000).unref();
  setInterval(() => { void recoverAgentActivity(); }, 60 * 60 * 1000).unref();

  // Pastrim automatik: fluturimet e KALUARA përjashtohen nga Google — hiqen
  // shënimet e vjetra (seat/schedule alert nga Google) sapo fluturimi të ketë
  // ikur, që lista "Past Flights", Njoftimet dhe shiriti i kuq të mos mbajnë
  // njoftime pa kuptim. Kontrollet e Google tashmë i anashkalojnë të kaluarat
  // (departureDate >= today); kjo fshin vetëm gjurmët e mbetura.
  async function clearPastFlightGoogleAlerts() {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
    const result = await db.update(flightsTable)
      .set({
        seatAlert: null, seatAlertDetail: null, seatMissCount: 0, seatMissLastAt: null,
        scheduleAlert: null, scheduleAlertDetail: null,
        updatedAt: sql`updated_at`, // mos e prek updatedAt — pastrim metadata, jo ndryshim real
      })
      .where(and(
        sql`${flightsTable.departureDate} < ${today}`,
        sql`(${flightsTable.seatAlert} IS NOT NULL OR ${flightsTable.scheduleAlert} IS NOT NULL)`,
      ))
      .returning({ id: flightsTable.id });
    if (result.length > 0) {
      logger.info({ cleared: result.length }, "[cron] u pastruan njoftimet e Google nga fluturimet e kaluara");
    }
  }
  clearPastFlightGoogleAlerts().catch(e => logger.error({ err: e }, "clearPastFlightGoogleAlerts boot failed"));
  setInterval(() => { clearPastFlightGoogleAlerts().catch(e => logger.error({ err: e }, "clearPastFlightGoogleAlerts failed")); }, 60 * 60 * 1000);

  // Keep Google Flights prices warm in the background (no more loading spinners).
  startGooglePriceWarmer();

  // Seat-availability check vs Google (separate, configurable in Settings).
  startSeatCheckScheduler();

  // Dedicated, more frequent re-check for "Pa Çmim" flights (configurable; default 30min).
  startNoPriceWarmer();
  startSuspectRecheckScheduler(fetchGoogleFlightSchedules);
  startStalePriceWarmer();
  startNewPriceWarmer();

  // Auto sold-out: arm the precise, event-driven sell-cutoff scheduler.
  void scheduleNextAutoSoldOut();

  // Optional admin-configured direct-flight discovery. The scheduler is
  // disabled by default and shares the manual-search guard in its route.
  startFlightDiscoveryScheduler();
  startWizzPriceMonitorScheduler();

  const CITIZENPLANE_INTERVAL_MS = 1 * 60 * 1000;
  // Anti-overlap guard: if a run (SFTP or IMAP) takes longer than the interval,
  // skip the next tick instead of starting a second concurrent import — two
  // concurrent runs could list the same PNL file before either archives it.
  let cpImportRunning = false;
  let cpImportStartedAt = 0;
  // Njoftim/email vetëm pas N dështimeve rresht të lidhjes SFTP — dështimet e
  // vetme kalimtare (timeout i rastësishëm te serveri i CP) nuk alarmojnë më.
  let cpSftpConsecFailures = 0;
  const CP_SFTP_ALERT_THRESHOLD = 3;
  const runCitizenPlane = async () => {
    if (cpImportRunning) {
      logger.info({ runningForMs: Date.now() - cpImportStartedAt }, "Offline import: previous run still active; tick skipped");
      return;
    }
    if (!(await isModuleEnabled("offlineFlights"))) return;
    if (cpImportRunning) return;
    cpImportRunning = true;
    cpImportStartedAt = Date.now();
    try {
      await doRunCitizenPlane();
    } finally {
      logger.info({ durationMs: Date.now() - cpImportStartedAt }, "Offline import: run finished");
      cpImportRunning = false;
    }
  };
  const doRunCitizenPlane = async () => {
    const notifyTo = process.env.NOTIFY_EMAIL;

    // Run both SFTP and email imports, merge results
    let result = { ok: true, filesProcessed: 0, bookingsCreated: 0, bookingsSkipped: 0, errors: [] as string[] };
    // Raw CSV content of files that had errors — attached to import alerts so
    // the data stays recoverable after the source file is deleted from SFTP.
    const failedFileRaw: Record<string, string> = {};
    try {
      const sftpResult = await runCitizenPlaneImport(true);
      cpSftpConsecFailures = 0;
      result.filesProcessed += sftpResult.filesProcessed;
      result.bookingsCreated += sftpResult.bookingsCreated;
      result.bookingsSkipped += sftpResult.bookingsSkipped;
      result.errors.push(...sftpResult.errors);
      Object.assign(failedFileRaw, sftpResult.failedFileRaw ?? {});
    } catch (err: any) {
      cpSftpConsecFailures++;
      logger.error(
        { err, consecFailures: cpSftpConsecFailures },
        "Offline SFTP import error",
      );
      // Alarmi (njoftim + email) vetëm kur dështojnë 3 cikle rresht (secili
      // cikël bën vetë 3 tentativa lidhjeje) — pra vetëm për shkëputje reale.
      // Gjatë një shkëputjeje të gjatë ri-alarmon çdo 30 dështime (~60 min,
      // sepse çdo run i dështuar zgjat ~70s dhe kapërcen tick-un pasues).
      const shouldAlert =
        cpSftpConsecFailures === CP_SFTP_ALERT_THRESHOLD ||
        (cpSftpConsecFailures > CP_SFTP_ALERT_THRESHOLD && cpSftpConsecFailures % 30 === 0);
      if (shouldAlert) {
        await recordImportAlert({
          kind: "connection",
          source: "sftp",
          reason: `${cpSftpConsecFailures} cikle rresht: ${err?.message ?? String(err)}`,
        });
        if (notifyTo) {
          const html = `
            <h2>🔴 Offline — Lidhja SFTP dështoi</h2>
            <p>Sistemi nuk u lidh dot me SFTP-në e importit Offline për <strong>${cpSftpConsecFailures} cikle rresht</strong> (secili cikël me 3 tentativa).</p>
            <p><strong>Gabimi i fundit:</strong> <code style="color:red">${err?.message ?? String(err)}</code></p>
            <p>Kontrolloni kredencialet dhe disponueshmërinë e serverit SFTP.</p>
            <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
          `;
          await sendEmail(notifyTo, `🔴 Offline: lidhja SFTP dështoi (${cpSftpConsecFailures} cikle rresht)`, html).catch(() => {});
        }
      }
    }
    // Gmail IMAP import — i çaktivizueshëm via env var DISABLE_CP_EMAIL_IMPORT=1
    if (process.env.DISABLE_CP_EMAIL_IMPORT !== "1" && await isModuleEnabled("offlineFlights")) {
      try {
        const emailResult = await runCitizenPlaneEmailImport(true);
        result.filesProcessed += emailResult.filesProcessed;
        result.bookingsCreated += emailResult.bookingsCreated;
        result.bookingsSkipped += emailResult.bookingsSkipped;
        result.errors.push(...emailResult.errors);
        Object.assign(failedFileRaw, emailResult.failedFileRaw ?? {});
      } catch (err: any) {
        console.error("Offline Email import error:", err);
        await recordImportAlert({ kind: "connection", source: "email", reason: err?.message ?? String(err) });
      }
    }

    // A disabled module must not emit a misleading empty/success report.
    if (!(await isModuleEnabled("offlineFlights"))) return;
    // Notify on successful imports
    try {
      if (result.bookingsCreated > 0 && notifyTo) {
        const html = `
          <h2>✅ Offline — Rezervime të reja</h2>
          <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif">
            <tr style="background:#f0f0f0"><th>Metrika</th><th>Vlera</th></tr>
            <tr><td>Skedarë të procesuar</td><td><strong>${result.filesProcessed}</strong></td></tr>
            <tr><td>Rezervime të krijuara</td><td style="color:green"><strong>${result.bookingsCreated}</strong></td></tr>
            <tr><td>Rezervime të anashkaluara (ekzistonin)</td><td><strong>${result.bookingsSkipped}</strong></td></tr>
            ${result.errors.length > 0 ? `<tr><td>Gabime</td><td style="color:red"><strong>${result.errors.length}</strong></td></tr>` : ""}
          </table>
          ${result.errors.length > 0 ? `
          <h3 style="color:red">⚠️ Gabime gjatë importit:</h3>
          <ul>${result.errors.map(e => `<li style="color:red">${e}</li>`).join("")}</ul>
          ` : ""}
          <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
        `;
        await sendEmail(notifyTo, `✅ Offline: ${result.bookingsCreated} rezervime të reja`, html).catch(() => {});
      }

      // In-system, admin-only alerts for file/booking failures. Recorded
      // ALWAYS (independent of email config) so the notification exists even
      // when NOTIFY_EMAIL is unset. Skip only connection-level noise (already
      // captured as `connection` alerts above), empty-but-valid files, and
      // blank messages. Bad-CSV / parse failures ARE surfaced here.
      const isConnectionNoise = (e: string) =>
        e.includes("No SFTP connection available") ||
        e.includes("Timed out while waiting for handshake") ||
        e.includes("ECONNRESET") ||
        e.includes("ETIMEDOUT") ||
        e.includes("ENETUNREACH") ||
        e.includes("IMAP lidhje dështoi") ||
        e.includes("connect ECONNREFUSED");
      const fileErrors = result.errors.filter(e =>
        !isConnectionNoise(e) &&
        !e.includes("nuk ka rezervime") &&
        // skip empty/whitespace-only messages (e.g. AggregateError with empty msg)
        e.replace(/^[^:]*:\s*/, "").trim().length > 0
      );
      for (const e of fileErrors) {
        const cpMatch = e.match(/\[([A-Z0-9]{6,})\]/);
        const cpCode = cpMatch ? cpMatch[1] : null;
        const fileMatch = e.match(/^([^[]+?)\s*\[/);
        const fileName = fileMatch ? fileMatch[1].trim() : null;
        const reason = e.includes(": ") ? e.substring(e.lastIndexOf(": ") + 2) : e;
        // Attach the raw CSV of the failed file (recovery copy) — errors are
        // formatted "<fileName> [pnr]: msg" or "<fileName>: msg", so a simple
        // prefix match against the collected failed-file map is reliable.
        const rawCsv =
          Object.entries(failedFileRaw).find(([name]) => e.startsWith(name))?.[1] ?? null;
        await recordImportAlert({ kind: "booking", source: "citizenplane", cpCode, fileName, reason, rawCsv });
      }

      // Notify on import errors — send dedicated email for each failed booking
      if (result.errors.length > 0 && notifyTo) {
        // Filter out empty-CSV errors (not real booking failures)
        const bookingErrors = result.errors.filter(e =>
          !isOfflineLuggageError(e) &&
          !e.includes("CSV bosh ose format i gabuar") &&
          !e.includes("nuk ka rezervime") &&
          !e.includes("Unexpected end event") &&
          !e.includes("No SFTP connection available") &&
          !e.includes("Timed out while waiting for handshake") &&
          !e.includes("ECONNRESET") &&
          !e.includes("ETIMEDOUT") &&
          !e.includes("ENETUNREACH") &&
          !e.includes("IMAP lidhje dështoi") &&
          !e.includes("connect ECONNREFUSED") &&
          // skip empty/whitespace-only messages (e.g. AggregateError with empty msg)
          e.replace(/^[^:]*:\s*/, "").trim().length > 0
        );

        if (bookingErrors.length > 0) {
          const rows = bookingErrors.map(e => {
            // Extract CP code from format: "filename [CPCODE]: reason"
            const cpMatch = e.match(/\[([A-Z0-9]{6,})\]/);
            const cpCode = cpMatch ? cpMatch[1] : "—";
            // Extract reason after last ": "
            const reason = e.includes(": ") ? e.substring(e.lastIndexOf(": ") + 2) : e;
            return `
              <tr>
                <td style="font-family:monospace;color:#0066cc"><strong>${cpCode}</strong></td>
                <td style="color:red">${reason}</td>
              </tr>`;
          }).join("");

          const html = `
            <h2>⚠️ Offline — Rezervime që nuk u importuan</h2>
            <p>Rezervimet e mëposhtme <strong>nuk u importuan dot</strong> gjatë ciklit të fundit:</p>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;width:100%">
              <tr style="background:#fff3cd">
                <th style="text-align:left">Kodi CP</th>
                <th style="text-align:left">Arsyeja</th>
              </tr>
              ${rows}
            </table>
            <p style="margin-top:16px;color:#555">Kontrolloni nëse fluturimi ekziston në sistem ose nëse ka ndonjë problem me të dhënat.</p>
            <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
          `;
          await sendEmail(notifyTo, `⚠️ Offline: ${bookingErrors.length} rezervime nuk u importuan`, html).catch(() => {});
        }
      }

    } catch (err: any) {
      console.error("Offline notify error:", err);
    }
  };
  runCitizenPlane();
  setInterval(runCitizenPlane, CITIZENPLANE_INTERVAL_MS);

  // CitizenPlane flight export — çdo 30 minuta
  const CP_EXPORT_INTERVAL_MS = 30 * 60 * 1000;
  const runCpExport = async () => {
    if (!(await isModuleEnabled("offlineFlights"))) return;
    try {
      const result = await runCitizenPlaneExport();
      if (!(await isModuleEnabled("offlineFlights"))) return;
      // Lista e fluturimeve të eksportuara te CitizenPlane shkon te një adresë
      // e dedikuar (jo NOTIFY_EMAIL / booking@albaniasky.com). E mbivendosshme
      // via env CP_EXPORT_NOTIFY_EMAIL.
      const notifyTo = process.env.CP_EXPORT_NOTIFY_EMAIL || "ernestkasajtp@gmail.com";
      if (notifyTo && result.ok && result.csv && result.fileName) {
        const timeNow = new Date();
        const time = `${timeNow.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane" })}, ${albaniaTime(timeNow)}`;
        const html = `
          <h2>📤 Offline — Eksporti i fluturimeve</h2>
          <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif">
            <tr style="background:#f0f0f0"><th>Metrika</th><th>Vlera</th></tr>
            <tr><td>Skedari</td><td><strong>${result.fileName}</strong></td></tr>
            <tr><td>Fluturime të eksportuara</td><td><strong>${result.flightsExported}</strong></td></tr>
            <tr><td>Koha</td><td>${time}</td></tr>
          </table>
          <p>Bashkangjitur gjeni skedarin CSV që u dërgua (eksporti Offline).</p>
          <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro çdo 30 minuta</p>
        `;
        await sendEmail(
          notifyTo,
          `📤 CP Export: ${result.flightsExported} fluturime — ${result.fileName}`,
          html,
          [{ filename: result.fileName, content: result.csv }]
        ).catch(() => {});
      }
    } catch (e) { /* logged inside */ }
  };
  // Në ndezje: mos e dërgo eksportin nëse është dërguar një me sukses në 25
  // minutat e fundit — rinisjet e shpeshta (deploy/pm2 restart) i çonin CP-së
  // skedarë të tepërt brenda pak minutash.
  void (async () => {
    if (!(await isModuleEnabled("offlineFlights"))) return;
    try {
      if (await lastCpExportWithinMs(25 * 60 * 1000)) {
        console.log("CP Export: kapërcyer në ndezje (eksport i suksesshëm < 25 min më parë)");
        return;
      }
    } catch { /* në dyshim, eksporto */ }
    void runCpExport();
  })();
  setInterval(runCpExport, CP_EXPORT_INTERVAL_MS);

  // Inbox-first: çdo 1 min lexohen vetëm email-et e REJA Wizz sipas UID
  // watermark-it dhe kontrollohen vetëm rezervimet me PNR-të e atyre email-eve.
  const WIZZ_INBOX_INTERVAL_MS = 60 * 1000;
  const WIZZ_FILE_INTEGRITY_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const WIZZ_SCHEDULE_INTERVAL_MS = 30 * 60 * 1000;
  let wizzTicketScanRunning = false;
  const runWizzInboxScan = async () => {
    if (wizzTicketScanRunning) return;
    if (!process.env.TICKET_INBOX_USER || !process.env.TICKET_INBOX_PASS) return;
    wizzTicketScanRunning = true;
    try {
      await scanNewWizzTicketEmails();
    } catch (err) {
      logger.error({ err }, "WizzTicket: skaneri i email-eve të reja dështoi");
    } finally {
      wizzTicketScanRunning = false;
    }
  };

  // Vetëm integritet lokal i PDF-ve të ruajtura. Nuk lidhet me inbox-in dhe
  // nuk kërkon bileta; çdo fetch automatik vjen vetëm nga një UID i ri.
  const runWizzFileIntegritySweep = async () => {
    if (wizzTicketScanRunning) return;
    wizzTicketScanRunning = true;
    try {
      await sweepMissingSavedTickets();
    } catch (err) {
      logger.error({ err }, "WizzTicket: kontrolli lokal i PDF-ve dështoi");
    } finally {
      wizzTicketScanRunning = false;
    }
  };

  const runWizzScheduleScan = async () => {
    if (wizzTicketScanRunning) return;
    // Booking-linked schedule-change notifications remain active even if the
    // internal schedule-changes management page is disabled.
    wizzTicketScanRunning = true;
    try {
      await scanScheduleChangeEmails();
    } catch (err) {
      logger.error({ err }, "WizzTicket: skaneri i ndryshimeve të orarit dështoi");
    } finally {
      wizzTicketScanRunning = false;
    }
  };

  setTimeout(runWizzInboxScan, 60 * 1000);
  setInterval(runWizzInboxScan, WIZZ_INBOX_INTERVAL_MS);
  setTimeout(runWizzFileIntegritySweep, 3 * 60 * 1000);
  setInterval(runWizzFileIntegritySweep, WIZZ_FILE_INTEGRITY_INTERVAL_MS);
  setTimeout(runWizzScheduleScan, 10 * 60 * 1000);
  setInterval(runWizzScheduleScan, WIZZ_SCHEDULE_INTERVAL_MS);
}
