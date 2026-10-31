import { google } from "googleapis";
import { db, bookingsTable, flightsTable, passengersTable, agentsTable, paymentsTable, bookingExtrasTable, agentCreditTransactionsTable } from "@workspace/db";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentRun: Promise<void> | null = null;
let pendingAfterRun = false;

// PERFORMANCE (16.08.2026): full re-upload of every sheet after each write ran
// ~once a minute during active use (big row-building + many Sheets API calls).
// Throttle: at most one sync per MIN_INTERVAL; writes land on the trailing edge.
const GS_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 min
let gsLastRunAt = 0;

export function scheduleGSheetsSync(delayMs = 30_000) {
  if (!process.env.GOOGLE_SHEETS_ID) return;

  if (debounceTimer) return; // trailing run already scheduled
  const since = Date.now() - gsLastRunAt;
  const wait = Math.max(delayMs, GS_MIN_INTERVAL_MS - since);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    gsLastRunAt = Date.now();
    void runSync();
  }, wait);
}

// Awaitable, immediate sync — used by the end-of-day cron so the email goes out
// only after the Google Sheet backup reflects the full day's data. The returned
// promise resolves only when the in-flight run (and any run queued while it was
// in flight) has fully completed.
export async function syncGoogleSheetsNow(): Promise<void> {
  if (!process.env.GOOGLE_SHEETS_ID) return;
  await runSync();
}

function runSync(): Promise<void> {
  // A run is already in flight — request a fresh rerun after it and return the
  // same promise, which resolves only once the loop (incl. the rerun) is done.
  if (currentRun) {
    pendingAfterRun = true;
    return currentRun;
  }
  currentRun = runSyncLoop();
  return currentRun;
}

async function runSyncLoop(): Promise<void> {
  try {
    do {
      pendingAfterRun = false;
      try {
        await syncToGoogleSheets();
      } catch (err) {
        console.error("[gSheets] Sync error:", err);
      }
    } while (pendingAfterRun);
  } finally {
    currentRun = null;
  }
}

function getAuth() {
  const authConfig: Record<string, unknown> = {
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  };
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonStr) authConfig.credentials = JSON.parse(jsonStr);
  return new google.auth.GoogleAuth(authConfig);
}

async function clearAndWrite(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetTitle: string,
  rows: (string | number | boolean | null)[][]
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(s => s.properties?.title === sheetTitle);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
    });
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetTitle}!A:ZZ` });
  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows as string[][] },
  });

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = sheetMeta.data.sheets?.find(s => s.properties?.title === sheetTitle)?.properties?.sheetId;
  if (sheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: rows[0]?.length ?? 20 },
            },
          },
        ],
      },
    });
  }
}

const fmt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("sq-AL", { timeZone: "Europe/Tirane" }) : "";

async function syncToGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const [bookings, flights, passengers, payments, agents, extras, creditTx] = await Promise.all([
    db.select().from(bookingsTable).orderBy(bookingsTable.createdAt),
    db.select().from(flightsTable).orderBy(flightsTable.departureDate),
    db.select().from(passengersTable),
    db.select().from(paymentsTable).orderBy(paymentsTable.createdAt),
    db.select().from(agentsTable).orderBy(agentsTable.name),
    db.select().from(bookingExtrasTable),
    db.select().from(agentCreditTransactionsTable).orderBy(agentCreditTransactionsTable.createdAt),
  ]);

  const flightMap = new Map(flights.map(f => [f.id, f]));
  const agentMap  = new Map(agents.map(a => [a.id, a]));
  const bookingMap = new Map(bookings.map(b => [b.id, b]));

  // ── 1. FLUTURIMET ──────────────────────────────────────────────────────────
  const flightRows: (string | number | null)[][] = [[
    "Nr. Fluturimit", "Kompania", "Nga", "Deri",
    "Data Nisjes", "Ora Nisjes", "Data Arritjes", "Ora Arritjes",
    "Çmimi Adult (€)", "Çmimi Fëmijë (€)", "Çmimi Infant (€)", "Taksa (€)",
    "Vendet Totale", "Vendet Shitura", "Vendet Lira",
    "Bagazhi Kabine (kg)", "Nr. Bagazheve Hold", "Bagazhi Hold (kg)", "Çmimi Bagazhi (€)",
    "Çmimi Zgjedhja Ulëses (€)", "Çmimi Priority Boarding (€)", "Çmimi Sigurimi (€)",
    "Statusi", "Shënime", "Krijuar",
  ]];
  for (const f of flights) {
    flightRows.push([
      f.flightNumber, f.airline, f.fromCity, f.toCity,
      f.departureDate, f.departureTime, f.arrivalDate, f.arrivalTime,
      Number(f.adultPrice) || 0, Number(f.childPrice) || 0, Number(f.infantPrice) || 0, Number(f.tax) || 0,
      f.totalSeats, f.soldSeats, f.totalSeats - f.soldSeats,
      Number(f.cabinBaggageKg) || 0, f.checkedBaggageCount ?? 0, Number(f.checkedBaggageKg) || 0, Number(f.checkedBaggagePrice) || 0,
      Number(f.seatSelectionPrice) || 0, Number(f.priorityBoardingPrice) || 0, Number(f.insurancePrice) || 0,
      f.status, f.notes ?? "", fmt(f.createdAt),
    ]);
  }

  // ── 2. REZERVIMET ─────────────────────────────────────────────────────────
  const bookingRows: (string | number | null)[][] = [[
    "Ref Rezervimit", "PNR",
    "Klienti", "Email", "Telefoni",
    "Nr. Fluturimit", "Kompania", "Nga", "Deri", "Data Fluturimit", "Ora Nisjes",
    "Statusi", "Shënime",
    "Çmimi Neto (€)", "Markup (€)", "Komision (€)", "Çmimi Total (€)", "Paguar (€)", "Mbetur (€)",
    "Agjenti", "Email Agjentit",
    "Nr. Pasagjerësh", "Nr. Shtojcave",
    "Krijuar", "Përditësuar",
  ]];
  for (const b of bookings) {
    const fl = b.flightId ? flightMap.get(b.flightId) : null;
    const ag = b.agentId ? agentMap.get(b.agentId) : null;
    const bkPax = passengers.filter(p => p.bookingId === b.id);
    const paxCount = bkPax.length;
    const paxExtraCount = bkPax.reduce((n, p) => n
      + (p.baggageOption && p.baggageOption.toLowerCase() !== "none" && p.baggageOption.trim() !== "" ? 1 : 0)
      + (p.hasSeatSelection ? 1 : 0)
      + (p.hasPriorityBoarding ? 1 : 0)
      + (p.hasInsurance ? 1 : 0), 0);
    const extraCount = extras.filter(e => e.bookingId === b.id).length + paxExtraCount;
    const total = Number(b.totalAmount) || 0;
    const paid  = Number(b.paidAmount) || 0;
    bookingRows.push([
      b.bookingRef,
      b.pnr ?? "Not Issued",
      b.customerName, b.customerEmail ?? "", b.customerPhone ?? "",
      fl?.flightNumber ?? "", fl?.airline ?? "", fl?.fromCity ?? "", fl?.toCity ?? "",
      fl?.departureDate ?? "", fl?.departureTime ?? "",
      b.status, b.notes ?? "",
      Number(b.netPrice) || 0,
      Number(b.markup) || 0,
      Number(b.commission) || 0,
      total, paid, total - paid,
      ag?.name ?? "", ag?.email ?? "",
      paxCount, extraCount,
      fmt(b.createdAt), fmt(b.updatedAt),
    ]);
  }

  // ── 3. PASAGJERËT ─────────────────────────────────────────────────────────
  const paxRows: (string | number | string | null)[][] = [[
    "Ref Rezervimit", "PNR Rezervimit", "Fluturimi", "Nga → Deri",
    "Tipi", "Emri", "Mbiemri", "Emri i Plotë",
    "Data Lindjes", "Kombësia",
    "Nr. Pasaportës/ID", "Skadon Pasaporta",
    "Nr. Ulëses", "Opsioni Bagazhit",
    "Zgjedhja Ulëses", "Priority Boarding", "Sigurimi",
    "Kosto Shtesë (€)", "Krijuar",
  ]];
  for (const p of passengers) {
    const bk = bookingMap.get(p.bookingId);
    const fl = bk?.flightId ? flightMap.get(bk.flightId) : null;
    paxRows.push([
      bk?.bookingRef ?? "",
      bk?.pnr ?? "Not Issued",
      fl?.flightNumber ?? "",
      fl ? `${fl.fromCity} → ${fl.toCity}` : "",
      p.type === "adult" ? "Adult" : p.type === "child" ? "Fëmijë" : "Infant",
      p.firstName, p.lastName, `${p.firstName} ${p.lastName}`,
      p.dateOfBirth ?? "", p.nationality ?? "",
      p.passportNumber ?? "", p.passportExpiry ?? "",
      p.seatNumber ?? "", p.baggageOption ?? "",
      p.hasSeatSelection ? "Po" : "Jo",
      p.hasPriorityBoarding ? "Po" : "Jo",
      p.hasInsurance ? "Po" : "Jo",
      Number(p.extraCost) || 0, fmt(p.createdAt),
    ]);
  }

  // ── 4. PAGESAT ────────────────────────────────────────────────────────────
  const payRows: (string | number | null)[][] = [[
    "Ref Rezervimit", "PNR", "Klienti", "Fluturimi", "Nga → Deri",
    "Shuma (€)", "Tipi", "Metoda", "Statusi", "Referenca", "Shënime", "Data",
  ]];
  for (const p of payments) {
    const bk = bookingMap.get(p.bookingId);
    const fl = bk?.flightId ? flightMap.get(bk.flightId) : null;
    payRows.push([
      bk?.bookingRef ?? "",
      bk?.pnr ?? "Not Issued",
      bk?.customerName ?? "",
      fl?.flightNumber ?? "",
      fl ? `${fl.fromCity} → ${fl.toCity}` : "",
      Number(p.amount) || 0,
      p.isRefund ? "Rimbursim" : "Pagesë",
      p.method ?? "", p.status ?? "",
      p.reference ?? "", p.notes ?? "",
      fmt(p.createdAt),
    ]);
  }

  // ── 5. AGJENTËT ───────────────────────────────────────────────────────────
  const agentRows: (string | number | null)[][] = [[
    "Emri", "Email", "Telefoni", "Kompania",
    "Statusi", "Komision (%)", "Markup (%)",
    "Zbritje (%)", "Zbritje Fikse (€)", "Tipi Zbritjes",
    "Bilancë Kredit (€)",
    "Nr. Rezervimeve", "Rezervime Aktive", "Total Shitje (€)", "Total Paguar (€)", "Detyrime (€)",
    "Krijuar",
  ]];
  for (const a of agents) {
    const agBookings = bookings.filter(b => b.agentId === a.id);
    const activeBookings = agBookings.filter(b => !["cancelled"].includes(b.status));
    const totalSales = activeBookings.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
    const totalPaid  = activeBookings.reduce((s, b) => s + (Number(b.paidAmount) || 0), 0);
    agentRows.push([
      a.name, a.email, a.phone ?? "", a.company ?? "",
      a.status,
      Number(a.commission) || 0, Number(a.markup) || 0,
      Number(a.discountPercent) || 0, Number(a.discountFixed) || 0, a.discountType,
      Number(a.walletBalance) || 0,
      agBookings.length, activeBookings.length,
      totalSales, totalPaid, totalSales - totalPaid,
      fmt(a.createdAt),
    ]);
  }

  // ── 6. SHTOJCAT (Extras) ──────────────────────────────────────────────────
  const extrasRows: (string | number | null)[][] = [[
    "Ref Rezervimit", "PNR", "Klienti", "Pasagjeri", "Tipi", "Përshkrimi", "Shuma (€)", "Shtuar",
  ]];
  // Booking-level extras (bookingExtrasTable)
  for (const e of extras) {
    const bk = bookingMap.get(e.bookingId);
    extrasRows.push([
      bk?.bookingRef ?? "",
      bk?.pnr ?? "Not Issued",
      bk?.customerName ?? "",
      "",
      "Booking Extra",
      e.description,
      Number(e.amount) || 0,
      fmt(e.createdAt),
    ]);
  }
  // Passenger-level extras (baggage, seat, priority, insurance, etc.)
  for (const p of passengers) {
    const bk = bookingMap.get(p.bookingId);
    if (!bk) continue;
    const fl = bk.flightId ? flightMap.get(bk.flightId) : null;
    const paxName = `${p.firstName} ${p.lastName}`.trim();
    if (p.baggageOption && p.baggageOption.toLowerCase() !== "none" && p.baggageOption.trim() !== "") {
      const price = Number(fl?.checkedBaggagePrice) || 0;
      extrasRows.push([
        bk.bookingRef, bk.pnr ?? "Not Issued", bk.customerName, paxName,
        "Bagazh", p.baggageOption, price, fmt(p.createdAt),
      ]);
    }
    if (p.hasSeatSelection) {
      const price = Number(fl?.seatSelectionPrice) || 0;
      extrasRows.push([
        bk.bookingRef, bk.pnr ?? "Not Issued", bk.customerName, paxName,
        "Ulëse", `Zgjedhje ulëseje${p.seatNumber ? ` (${p.seatNumber})` : ""}`, price, fmt(p.createdAt),
      ]);
    }
    if (p.hasPriorityBoarding) {
      const price = Number(fl?.priorityBoardingPrice) || 0;
      extrasRows.push([
        bk.bookingRef, bk.pnr ?? "Not Issued", bk.customerName, paxName,
        "Priority", "Priority Boarding", price, fmt(p.createdAt),
      ]);
    }
    if (p.hasInsurance) {
      const price = Number(fl?.insurancePrice) || 0;
      extrasRows.push([
        bk.bookingRef, bk.pnr ?? "Not Issued", bk.customerName, paxName,
        "Sigurim", "Sigurim Udhëtimi", price, fmt(p.createdAt),
      ]);
    }
  }

  // ── 7. TRANSAKSIONET KREDIT ───────────────────────────────────────────────
  const creditRows: (string | number | null)[][] = [[
    "Agjenti", "Tipi", "Shuma (€)", "Ref Rezervimit", "Referenca", "Shënime", "Data",
  ]];
  for (const t of creditTx) {
    const ag = agentMap.get(t.agentId);
    creditRows.push([
      ag?.name ?? "", t.type,
      Number(t.amount) || 0,
      t.bookingRef ?? "", t.reference ?? "", t.notes ?? "",
      fmt(t.createdAt),
    ]);
  }

  // ── 8. RAPORT FINANCIAR ───────────────────────────────────────────────────
  const totalSales    = bookings.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0);
  const totalPaid     = bookings.reduce((s, b) => s + (Number(b.paidAmount) || 0), 0);
  const totalPending  = totalSales - totalPaid;
  const confirmed     = bookings.filter(b => b.status === "confirmed").length;
  const pending       = bookings.filter(b => b.status === "pending").length;
  const draft         = bookings.filter(b => b.status === "draft").length;
  const ticketed      = bookings.filter(b => b.status === "ticketed").length;
  const cancelled     = bookings.filter(b => b.status === "cancelled").length;
  const withPnr       = bookings.filter(b => !!b.pnr).length;
  const refunds       = payments.filter(p => p.status === "completed" && p.isRefund).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const finRows: (string | number | null)[][] = [
    ["Tregues", "Vlera"],
    ["━━ REZERVIMET ━━", ""],
    ["Total Rezervime", bookings.length],
    ["  Draft", draft],
    ["  Pending", pending],
    ["  Konfirmuara", confirmed],
    ["  Me Biletë (Ticketed)", ticketed],
    ["  Anuluara", cancelled],
    ["  Me PNR", withPnr],
    ["  Pa PNR (Not Issued)", bookings.length - withPnr],
    ["━━ FINANCIAR ━━", ""],
    ["Total Shitje (€)", totalSales],
    ["Total Paguar (€)", totalPaid],
    ["Detyrime (€)", totalPending],
    ["Rimbursime (€)", refunds],
    ["━━ TË TJERA ━━", ""],
    ["Total Pasagjerë", passengers.length],
    ["Total Fluturime", flights.length],
    ["Total Agjentë", agents.length],
    ["Total Pagesa", payments.length],
    ["Total Shtojca", extras.length],
    ["━━", ""],
    ["Përditësuar", new Date().toLocaleString("sq-AL", { timeZone: "Europe/Tirane" })],
  ];

  // Write all sheets in order
  await clearAndWrite(sheets, spreadsheetId, "Raport Financiar", finRows);
  await clearAndWrite(sheets, spreadsheetId, "Fluturimet", flightRows);
  await clearAndWrite(sheets, spreadsheetId, "Rezervimet", bookingRows);
  await clearAndWrite(sheets, spreadsheetId, "Pasagjerët", paxRows);
  await clearAndWrite(sheets, spreadsheetId, "Pagesat", payRows);
  await clearAndWrite(sheets, spreadsheetId, "Agjentët", agentRows);
  await clearAndWrite(sheets, spreadsheetId, "Shtojcat", extrasRows);
  await clearAndWrite(sheets, spreadsheetId, "Kredit Agjentësh", creditRows);

  console.log(`[gSheets] ✓ Sinkronizuar: ${bookings.length} rezervime (${withPnr} me PNR), ${passengers.length} pasagjerë, ${payments.length} pagesa, ${flights.length} fluturime`);
}
