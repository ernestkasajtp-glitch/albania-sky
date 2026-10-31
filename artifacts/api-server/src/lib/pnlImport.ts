import { isOfflineLuggageFile } from "./offlineImportFiles";
import { createSftpDeadline, SftpTimeoutError } from "./sftpDeadline";
import SftpClient from "ssh2-sftp-client";
import { db, bookingsTable, flightsTable, passengersTable, bookingChangeLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendEmail, bookingCreatedEmail, bookingSubject } from "./gmail.js";
import { getFullBooking } from "./getFullBooking.js";
import { flipSoldOutIfFull } from "./autoSoldOut.js";
import { recordImportAlert } from "./importAlerts.js";
import { recordSeatEvent } from "./seatHistory.js";
import { triggerCpExportSoon } from "./cpExport.js";
import { isModuleEnabled } from "./moduleControls.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LuggageRow {
  booking_ref: string;
  quantity: number;
  weight: number;
  price: number;
}

interface CpRow {
  origin: string;
  destination: string;
  flight_number: string;
  departure_date: string;
  booking_date: string;
  booking_ref: string;
  price: string;
  pnr_reference: string;
  first_name: string;
  last_name: string;
  gender: string;
  nationality: string;
  date_of_birth: string;
  birth_country: string;
  passport_number: string;
  passport_expiry_date: string;
  passport_country_of_issue: string;
  is_infant: string;
  status: string;
  had_sc: string;
  lugg_qty: string;
}

interface CpPassenger {
  firstName: string;
  lastName: string;
  type: "adult" | "child" | "infant";
  gender: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  luggQty: number;  // from lugg_qty in PNL — >0 means 20kg checked bag
  price: number;    // ticket price from PNL CSV (CitizenPlane's actual charge)
}

interface CpBooking {
  pnrReference: string;       // CPP9GMW — for display only
  cpBookingRef: string;       // 1869208 — unique CitizenPlane booking ID, used for dedup
  flightNumber: string;
  departureDateRaw: string;   // "2026-08-30, 18:05"
  departureDate: string;      // "2026-08-30"
  origin: string;
  destination: string;
  passengers: CpPassenger[];
}

export interface ImportResult {
  ok: boolean;
  filesProcessed: number;
  bookingsCreated: number;
  bookingsSkipped: number;
  errors: string[];
  // Raw CSV content of files that had at least one error, keyed by file name.
  // Used to attach a recovery copy to the in-system import alert, because the
  // source file is deleted from the SFTP right after processing.
  failedFileRaw?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// CSV parser — handles standard quoted CSV (CitizenPlane format)
// ---------------------------------------------------------------------------

function parseCsv(text: string): CpRow[] {
  // Strip UTF-8 BOM if present
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  // Detect delimiter: use semicolon if header line has more semicolons than commas
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  function splitRow(line: string, delim: string): string[] {
    const fields: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === delim && !inQuote) {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  // Normalize header: strip quotes, trim, lowercase, replace spaces with underscore
  const rawHeaders = splitRow(lines[0], delimiter);
  const headers = rawHeaders.map(h => h.replace(/"/g, "").trim().toLowerCase().replace(/\s+/g, "_"));

  logger.info({ headers, delimiter, totalCols: headers.length }, "PNL CSV: headers të normalizuar");

  const rows: CpRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitRow(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").replace(/"/g, "").trim();
    });
    rows.push(row as unknown as CpRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Luggage CSV parser — format: booking_ref,quantity,weight,price
// ---------------------------------------------------------------------------

export function parseLuggageCsv(text: string): LuggageRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        fields.push(cur); cur = "";
      } else { cur += ch; }
    }
    fields.push(cur);
    return fields;
  }

  const headers = splitRow(lines[0]).map(h => h.replace(/"/g, "").trim());
  const rows: LuggageRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").replace(/"/g, "").trim(); });

    const qty = parseInt(row["quantity"] ?? "0", 10);
    const weight = parseInt(row["weight"] ?? "0", 10);
    const price = parseFloat(row["price"] ?? "0");
    const ref = row["booking_ref"] ?? "";
    if (!ref) continue;
    rows.push({ booking_ref: ref, quantity: qty, weight, price });
  }

  return rows;
}

// Build a map booking_ref → LuggageRow from multiple luggage CSV files
export function buildLuggageMap(csvTexts: string[]): Map<string, LuggageRow> {
  const map = new Map<string, LuggageRow>();
  for (const text of csvTexts) {
    for (const row of parseLuggageCsv(text)) {
      map.set(row.booking_ref, row);
    }
  }
  return map;
}

function luggageDescription(weight: number): string {
  if (weight === 10) return "Priority 10kg";
  if (weight === 20) return "Bagazh 20kg";
  return `Bagazh ${weight}kg`;
}

// ---------------------------------------------------------------------------
// Passenger type determination
// ---------------------------------------------------------------------------

function calcAge(dob: string, referenceDate: string): number {
  // dob: "DD/MM/YYYY", referenceDate: "YYYY-MM-DD"
  const parts = dob.split("/");
  if (parts.length !== 3) return 99;
  const dobDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  const refDate = new Date(referenceDate);
  let age = refDate.getFullYear() - dobDate.getFullYear();
  const m = refDate.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < dobDate.getDate())) age--;
  return age;
}

function passengerType(row: CpRow, departureDate: string): "adult" | "child" | "infant" {
  if (row.is_infant === "true") return "infant";
  if (row.date_of_birth) {
    const age = calcAge(row.date_of_birth, departureDate);
    if (age < 2) return "infant";
    if (age < 12) return "child";
  }
  return "adult";
}

// ---------------------------------------------------------------------------
// Group CSV rows into bookings
// ---------------------------------------------------------------------------

function groupBookings(rows: CpRow[]): CpBooking[] {
  const map = new Map<string, CpBooking>();

  for (const row of rows) {
    // Use CitizenPlane's booking_ref (numeric) as the unique key — NOT pnr_reference
    // because the same pnr_reference can appear across multiple bookings
    const cpBookingRef = row.booking_ref?.trim();
    if (!cpBookingRef) continue;

    const pnr = row.pnr_reference?.trim() ?? "";

    // Skip cancelled bookings
    if (row.status?.trim().toUpperCase() === "CANCELED" || row.status?.trim().toUpperCase() === "CANCELLED") continue;

    // Parse departure date: "2026-08-30, 18:05" → "2026-08-30"
    const depDateRaw = row.departure_date?.trim() ?? "";
    const departureDate = depDateRaw.split(",")[0].trim(); // "2026-08-30"

    if (!map.has(cpBookingRef)) {
      map.set(cpBookingRef, {
        pnrReference: pnr,
        cpBookingRef,
        flightNumber: row.flight_number?.trim().replace(/\s+/g, "").toUpperCase(),
        departureDateRaw: depDateRaw,
        departureDate,
        origin: row.origin?.trim().toUpperCase(),
        destination: row.destination?.trim().toUpperCase(),
        passengers: [],
      });
    }

    const booking = map.get(cpBookingRef)!;
    booking.passengers.push({
      firstName: row.first_name?.trim(),
      lastName: row.last_name?.trim().toUpperCase(),
      type: passengerType(row, departureDate),
      gender: row.gender?.trim() || null,
      nationality: row.nationality?.trim() || null,
      dateOfBirth: row.date_of_birth?.trim() || null,
      passportNumber: row.passport_number?.trim() || null,
      passportExpiry: row.passport_expiry_date?.trim() || null,
      luggQty: parseInt(row.lugg_qty ?? "0", 10),
      price: parseFloat(row.price ?? "0"),
    });
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Booking reference generator
// ---------------------------------------------------------------------------

function generateRef(): string {
  const chars = "0123456789";
  let ref = "KTF";
  for (let i = 0; i < 4; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

async function getUniqueRef(): Promise<string> {
  let ref = generateRef();
  for (let i = 0; i < 10; i++) {
    const existing = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingRef, ref));
    if (existing.length === 0) return ref;
    ref = generateRef();
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Process CSV text directly (used by email import and manual import)
// ---------------------------------------------------------------------------

export async function importCpBookingsFromText(
  text: string,
  fileName: string,
  luggageMap?: Map<string, LuggageRow>,
  bodyHasPriority?: boolean,
): Promise<ImportResult> {
  const result: ImportResult = { ok: true, filesProcessed: 0, bookingsCreated: 0, bookingsSkipped: 0, errors: [], failedFileRaw: {} };

  const rows = parseCsv(text);
  if (rows.length === 0) {
    logger.warn({ fileName }, "Email Import: CSV bosh ose format i gabuar");
    result.errors.push(`${fileName}: CSV bosh ose format i gabuar`);
    result.failedFileRaw![fileName] = text;
    result.filesProcessed++;
    return result;
  }

  const bookings = groupBookings(rows);
  result.filesProcessed++;

  for (const booking of bookings) {
    try {
      const existingCheck = await db
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(sql`notes LIKE ${`%[CP_ID:${booking.cpBookingRef}]%`}`);

      if (existingCheck.length > 0) {
        result.bookingsSkipped++;
        logger.debug({ pnr: booking.pnrReference }, "Email Import: booking ekziston, anashkaluar");
      } else {
        // Priority: from email body OR from luggages CSV (weight=10)
        const lugg = luggageMap?.get(booking.cpBookingRef);
        const luggHasPriority = !!(lugg && lugg.weight === 10 && lugg.quantity > 0);
        const hasPriority = !!(bodyHasPriority || luggHasPriority);

        await importCpBooking(booking, fileName, luggageMap, hasPriority);
        result.bookingsCreated++;
        logger.info({ pnr: booking.pnrReference, fileName, hasPriority }, "Email Import: rezervim i ri importuar");
      }
    } catch (err: any) {
      const msg = `${fileName} [${booking.pnrReference}]: ${err?.message ?? String(err)}`;
      logger.error({ err, pnr: booking.pnrReference, fileName }, "Email Import: gabim gjatë krijimit të rezervimit");
      result.errors.push(msg);
      result.failedFileRaw![fileName] = text;
    }
  }

  return result;
}

export function getCitizenPlaneAgentId(): number | null {
  const id = process.env.CITIZENPLANE_AGENT_ID;
  return id ? Number(id) : null;
}

// ---------------------------------------------------------------------------
// Import a single CitizenPlane booking record into the database
// ---------------------------------------------------------------------------

async function importCpBooking(booking: CpBooking, fileName: string, luggageMap?: Map<string, LuggageRow>, hasPriority?: boolean): Promise<void> {
  const { pnrReference, cpBookingRef, flightNumber, departureDate, passengers, origin, destination } = booking;

  // Deduplicate by CitizenPlane's booking_ref (unique numeric ID)
  const existing = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(sql`notes LIKE ${`%[CP_ID:${cpBookingRef}]%`}`);
  if (existing.length > 0) {
    logger.debug({ cpBookingRef }, "PNL Import: rezervim ekziston, duke anashkaluar");
    return;
  }

  // Validate flight_number before querying DB — catches CSV parsing issues
  if (!flightNumber) {
    logger.error({ flightNumber, departureDate, pnrReference, cpBookingRef, origin, destination, fileName }, "PNL Import: flight_number bosh ose undefined — CSV parsing problem");
    throw new Error(`Numri i fluturimit mungon (bosh/undefined) për rezervimin ${pnrReference} [${cpBookingRef}] — ${origin}→${destination} datë ${departureDate}. Kontrolloni formatin e CSV-it të importit Offline.`);
  }

  // Find matching flight. Numri i fluturimit krahasohet I NORMALIZUAR (pa
  // hapësira, uppercase) sepse CSV-ja e CitizenPlane e sjell "W45102" ndërsa
  // në sistem fluturimi mund të jetë ruajtur "W4 5102" — krahasimi ekzakt
  // e humbte rezervimin ("fluturimi nuk u gjet") edhe pse fluturimi ekziston.
  const normFn = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const dayFlights = await db
    .select()
    .from(flightsTable)
    .where(eq(flightsTable.departureDate, departureDate));
  let candidates = dayFlights.filter(f => normFn(String(f.flightNumber || "")) === normFn(flightNumber));
  // Nëse ka më shumë se një kandidat me të njëjtin numër të normalizuar,
  // ngushto sipas rrugës (origin/destination nga CSV) para se të zgjedhësh.
  if (candidates.length > 1 && origin && destination) {
    const routeMatches = candidates.filter(f =>
      normFn(String(f.fromCity || "")).includes(normFn(origin)) &&
      normFn(String(f.toCity || "")).includes(normFn(destination)),
    );
    if (routeMatches.length > 0) candidates = routeMatches;
  }
  if (candidates.length > 1) {
    logger.error({ flightNumber, departureDate, pnrReference, candidateIds: candidates.map(f => f.id) }, "PNL Import: shumë fluturime kandidate — import i paqartë");
    throw new Error(`Fluturimi ${flightNumber} / ${departureDate} ka ${candidates.length} kandidatë të paqartë në sistem (${origin}→${destination}) — kontrolloni manualisht (ID: ${candidates.map(f => f.id).join(", ")}).`);
  }
  const flight = candidates[0];

  if (!flight) {
    logger.warn({ flightNumber, departureDate, pnrReference, fileName }, "PNL Import: fluturimi nuk u gjet");
    throw new Error(`Fluturimi ${flightNumber} / ${departureDate} nuk u gjet në sistem (${origin}→${destination})`);
  }

  // Check available seats (infants don't occupy seats).
  // OVERSELL POLICY: when CitizenPlane sold more seats than we have available
  // (oversell inside the export gap), the booking is imported ANYWAY — losing
  // the booking entirely is worse than exceeding capacity. The booking gets a
  // visible [MBISHITJE] marker in its notes and an admin alert is recorded.
  const nonInfantCount = passengers.filter(p => p.type !== "infant").length;
  const availableSeats = flight.totalSeats - flight.soldSeats;
  const oversellBy = nonInfantCount - Math.max(0, availableSeats);
  const isOversell = nonInfantCount > availableSeats;
  if (isOversell) {
    logger.warn({ flightNumber, departureDate, pnrReference, nonInfantCount, availableSeats }, "PNL Import: vende të pamjaftueshme — rezervimi importohet GJITHSESI si MBISHITJE");
  }

  // Get luggage info early so we can include its cost in totalAmount
  const lugg = luggageMap?.get(cpBookingRef);
  const fromLuggageMap = luggageMap !== undefined;
  const luggageCost = lugg && lugg.quantity > 0 ? lugg.quantity * lugg.price : 0;

  // Use CitizenPlane's actual per-passenger price from PNL CSV (not our flight DB prices)
  // This ensures totalAmount matches exactly what CitizenPlane charged the customer
  const ticketTotal = passengers.reduce((sum, p) => sum + p.price, 0);

  // For SFTP imports (no luggageMap), calculate baggage cost from flight's checkedBaggagePrice.
  // NOTE: CitizenPlane PNL repeats the TOTAL bag count on every passenger row (e.g. all rows show
  // "1" when there's 1 bag total). So we use the max (= the repeated total), not the count.
  const flightBagPrice = flight.checkedBaggagePrice != null ? Number(flight.checkedBaggagePrice) : 0;
  const pnlBaggageTotal = passengers.reduce((m, p) => Math.max(m, p.luggQty), 0);
  const sftpBaggageCost = !fromLuggageMap
    ? pnlBaggageTotal * flightBagPrice
    : 0;

  const totalAmount = ticketTotal + luggageCost + sftpBaggageCost;

  const cpAgentId = getCitizenPlaneAgentId();
  const firstPax = passengers[0];
  const customerName = `${firstPax.lastName} ${firstPax.firstName}`;
  const bookingRef = await getUniqueRef();

  const [newBooking] = await db
    .insert(bookingsTable)
    .values({
      bookingRef,
      pnr: null,
      flightId: flight.id,
      agentId: cpAgentId,
      customerName,
      customerEmail: null,
      customerPhone: null,
      status: "draft",
      totalAmount: String(Math.round(totalAmount)),
      paidAmount: "0",
      markup: "0",
      commission: "0",
      source: "CitizenPlane",
      notes: `[CP:${pnrReference}][CP_ID:${cpBookingRef}] Import automatik PNL: ${fileName} | ${origin}-${destination}${isOversell ? ` [MBISHITJE: kërkoheshin ${nonInfantCount} vende, të lira ${Math.max(0, availableSeats)}]` : ""}`,
    })
    .returning();

  // Distribute baggage and priority boarding by total quantity → assign to first N passengers.
  // CitizenPlane PNL repeats the TOTAL bag count on every passenger row (e.g. all rows show "1"
  // when there's 1 bag total, "2" when 2 bags total). So we treat lugg_qty as a shared total,
  // not per-passenger. Both email and SFTP imports use this logic.

  // How many passengers (starting from first) get 20kg checked bag?
  const baggageQty: number = fromLuggageMap
    ? (lugg && lugg.weight !== 10 && lugg.quantity > 0 ? lugg.quantity : 0)
    : pnlBaggageTotal;

  // How many passengers (starting from first) get priority boarding?
  const priorityQty: number = hasPriority
    ? (fromLuggageMap && lugg && lugg.weight === 10 && lugg.quantity > 0 ? lugg.quantity : 1)
    : 0;

  // Per-bag price for extraCost
  // - Email import (fromLuggageMap): use price from luggages CSV
  // - SFTP import: use flight's checkedBaggagePrice as fallback
  const perBagPrice: number = fromLuggageMap
    ? (lugg && lugg.weight !== 10 && lugg.quantity > 0 ? lugg.price : 0)
    : flightBagPrice;

  // Per-priority price for extraCost (10kg priority boarding from luggages CSV, weight == 10)
  const perPriorityPrice: number = (fromLuggageMap && lugg && lugg.weight === 10 && lugg.quantity > 0)
    ? lugg.price
    : 0;

  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i];
    const getBaggage = i < baggageQty;
    const getPriority = i < priorityQty;
    const extraCostVal = (getBaggage ? perBagPrice : 0) + (getPriority ? perPriorityPrice : 0);

    await db.insert(passengersTable).values({
      bookingId: newBooking.id,
      type: p.type,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth || null,
      baggageOption: getBaggage ? "checked" : null,
      hasPriorityBoarding: getPriority,
      extraCost: String(extraCostVal),
      ticketPrice: p.price > 0 ? String(Math.round(p.price)) : null,
    });
  }

  // Update sold seats (infants don't occupy a seat)
  const nonInfantPax = passengers.filter(p => p.type !== "infant").length;
  await db
    .update(flightsTable)
    .set({ soldSeats: sql`${flightsTable.soldSeats} + ${nonInfantPax}` })
    .where(eq(flightsTable.id, flight.id));
  await flipSoldOutIfFull(flight.id);
  if (nonInfantPax > 0) {
    void recordSeatEvent({ flightId: flight.id, type: "sold", seats: nonInfantPax, userName: "Import CP", note: `Rezervim ${bookingRef}` });
  }
  // A CitizenPlane-imported booking lowered available seats — push the updated
  // flight list back to CitizenPlane immediately (debounced), don't wait 30 min.
  triggerCpExportSoon();

  // Oversell: booking was imported beyond capacity — surface an admin alert so
  // the team can react (upgrade capacity, rebook, or resolve with the partner).
  if (isOversell) {
    await recordImportAlert({
      kind: "booking",
      source: "citizenplane",
      cpCode: pnrReference,
      fileName,
      reason: `MBISHITJE: Rezervimi ${pnrReference} (${customerName}, ${nonInfantCount} pax) u importua GJITHSESI në fluturimin ${flightNumber} / ${departureDate} (${origin}→${destination}) — kërkoheshin ${nonInfantCount} vende, të lira vetëm ${Math.max(0, availableSeats)} (tejkalim ${oversellBy}). Fluturimi tani është mbi kapacitet — verifikoni!`,
    });
  }

  // Log creation event for history
  db.insert(bookingChangeLogsTable).values({
    bookingId: newBooking.id,
    userId: null,
    userName: "System",
    userRole: null,
    action: "created",
    fieldName: null,
    oldValue: null,
    newValue: String(newBooking.status),
    note: `Rezervim i importuar automatikisht: ${bookingRef} (${fileName || "email"})`,
  }).catch(() => {});

  // Send individual booking notification email (non-blocking)
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo) {
    getFullBooking(newBooking.id).then(full => {
      if (full) {
        sendEmail(
          notifyTo,
          bookingSubject("New Booking CP", full, "en"),
          bookingCreatedEmail(full)
        ).catch(() => {});
      }
    }).catch(() => {});
  }

  logger.info(
    { bookingRef, pnrReference, flightNumber, departureDate, passengers: passengers.length, fileName },
    "PNL Import: rezervim i krijuar me sukses"
  );
}

// ---------------------------------------------------------------------------
// SFTP config
// ---------------------------------------------------------------------------

function getSftpConfig() {
  const host = process.env.CITIZENPLANE_FTP_HOST;
  const username = process.env.CITIZENPLANE_FTP_USER;
  const password = process.env.CITIZENPLANE_FTP_PASSWORD;
  const port = Number(process.env.CITIZENPLANE_FTP_PORT ?? "22");
  const processedPath = process.env.CITIZENPLANE_FTP_PROCESSED_PATH || null;

  // All paths to scan for incoming PNL/booking files
  const remotePaths = [
    process.env.CITIZENPLANE_FTP_PATH ?? "/flight-ingest",
    "/booking-export",
    "/flight-ingest-updates",
  ].filter((v, i, a) => v && a.indexOf(v) === i); // deduplicate

  if (!host || !username || !password) return null;

  return { host, username, password, port, remotePaths, processedPath };
}

// ---------------------------------------------------------------------------
// Process all files in one SFTP path — reused for every folder
// ---------------------------------------------------------------------------

async function processOnePath(
  sftp: SftpClient,
  timed: ReturnType<typeof createSftpDeadline>,
  remotePath: string,
  processedPath: string | null,
  result: ImportResult,
  automatic = false,
): Promise<void> {
  if (automatic && !(await isModuleEnabled("offlineFlights"))) return;
  let fileList: any[];
  try {
    fileList = await timed("list", () => sftp.list(remotePath));
  } catch (err: any) {
    if (err instanceof SftpTimeoutError) throw err;
    // Path might not exist or no permission — skip silently
    logger.debug({ remotePath, err: err.message }, "PNL Import: nuk u lexua folder-i (jo fatal)");
    return;
  }

  const pnlFiles = fileList.filter(
    f => f.type === "-" && /\.(csv|xlsx?)$/i.test(f.name)
      && !f.name.toLowerCase().startsWith("test_")
      && !isOfflineLuggageFile(f.name)
  );

  if (pnlFiles.length === 0) {
    logger.debug({ remotePath }, "PNL Import: nuk ka skedarë të rinj");
    return;
  }

  logger.info({ remotePath, count: pnlFiles.length }, "PNL Import: duke procesuar skedarë");

  for (const file of pnlFiles) {
    if (automatic && !(await isModuleEnabled("offlineFlights"))) return;
    const remoteFilePath = `${remotePath.replace(/\/$/, "")}/${file.name}`;

    try {
      const raw = await timed("get", () => sftp.get(remoteFilePath)) as Buffer;
      const text = raw.toString("utf-8");

      const rows = parseCsv(text);
      if (rows.length === 0) {
        logger.warn({ fileName: file.name, remotePath }, "PNL Import: CSV bosh ose format i gabuar");
        result.errors.push(`${file.name}: CSV bosh ose format i gabuar`);
        if (result.failedFileRaw) result.failedFileRaw[file.name] = text;
        result.filesProcessed++;
      } else {
        const bookings = groupBookings(rows);
        result.filesProcessed++;

        if (bookings.length === 0) {
          logger.warn({ fileName: file.name }, "PNL Import: nuk ka rezervime të vlefshme (të gjitha CANCELED?)");
        }

        for (const booking of bookings) {
          if (automatic && !(await isModuleEnabled("offlineFlights"))) return;
          try {
            const existingCheck = await db
              .select({ id: bookingsTable.id })
              .from(bookingsTable)
              .where(sql`notes LIKE ${`%[CP_ID:${booking.cpBookingRef}]%`}`);

            if (existingCheck.length > 0) {
              result.bookingsSkipped++;
              logger.debug({ pnr: booking.pnrReference }, "PNL Import: booking ekziston, anashkaluar");
            } else {
              await importCpBooking(booking, file.name);
              result.bookingsCreated++;
            }
          } catch (err: any) {
            const msg = `${file.name} [${booking.pnrReference}]: ${err?.message ?? String(err)}`;
            logger.error({ err, pnr: booking.pnrReference, fileName: file.name }, "PNL Import: gabim gjatë krijimit të rezervimit");
            result.errors.push(msg);
            if (result.failedFileRaw) result.failedFileRaw[file.name] = text;
          }
        }
      }

      // Move or delete processed file
      if (processedPath) {
        const dest = `${processedPath.replace(/\/$/, "")}/${file.name}`;
        try {
          await timed("rename", () => sftp.rename(remoteFilePath, dest));
          logger.info({ fileName: file.name }, "PNL Import: skedari u zhvendos te processed");
        } catch (err) {
          if (err instanceof SftpTimeoutError) throw err;
          logger.warn({ err, fileName: file.name }, "PNL Import: nuk u zhvendos skedari (jo fatal)");
        }
      } else {
        try {
          await timed("delete", () => sftp.delete(remoteFilePath));
          logger.info({ fileName: file.name }, "PNL Import: skedari u fshi pas procesimit");
        } catch (err) {
          if (err instanceof SftpTimeoutError) throw err;
          logger.warn({ err, fileName: file.name }, "PNL Import: nuk u fshi skedari (jo fatal)");
        }
      }
    } catch (err: any) {
      if (err instanceof SftpTimeoutError) throw err;
      const msg = `${file.name}: ${err?.message ?? String(err)}`;
      logger.error({ err, fileName: file.name }, "PNL Import: gabim gjatë leximit të skedarit");
      result.errors.push(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Main import runner — called by cron every 10 minutes
// ---------------------------------------------------------------------------

async function connectSftpWithRetry(
  config: NonNullable<ReturnType<typeof getSftpConfig>>,
  attempts = 3,
): Promise<{ sftp: SftpClient; timed: ReturnType<typeof createSftpDeadline> }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const sftp = new SftpClient("citizenplane-importer");
    // ssh2-sftp-client exposes the underlying ssh2 transport as `client`;
    // its public type declarations omit that property.
    const transport = (sftp as unknown as { client: { destroy(): void } }).client;
    const timed = createSftpDeadline(
      () => transport.destroy(),
      details => logger.info(details, "Offline import: SFTP operation"),
    );
    try {
      await timed("connect", () => sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 20000,
      }), 20_000);
      return { sftp, timed };
    } catch (err) {
      lastErr = err;
      try { await timed("end", () => sftp.end(), 5_000); } catch { transport.destroy(); }
      logger.warn(
        { attempt, attempts, err: err instanceof Error ? err.message : String(err) },
        "PNL Import: lidhja SFTP dështoi, riprovë",
      );
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  throw lastErr;
}

export async function runCitizenPlaneImport(automatic = false): Promise<ImportResult> {
  const config = getSftpConfig();
  if (!config) {
    logger.debug("PNL Import: kredencialet SFTP nuk janë konfiguruar, duke anashkaluar");
    return { ok: true, filesProcessed: 0, bookingsCreated: 0, bookingsSkipped: 0, errors: [] };
  }

  const result: ImportResult = { ok: true, filesProcessed: 0, bookingsCreated: 0, bookingsSkipped: 0, errors: [], failedFileRaw: {} };

  const { sftp, timed } = await connectSftpWithRetry(config);
  try {
    logger.info({ host: config.host, paths: config.remotePaths }, "PNL Import: u lidh me SFTP");

    for (const remotePath of config.remotePaths) {
      if (automatic && !(await isModuleEnabled("offlineFlights"))) break;
      await processOnePath(sftp, timed, remotePath, config.processedPath, result, automatic);
    }
  } finally {
    try { await timed("end", () => sftp.end(), 5_000); } catch { /* transport already destroyed on timeout */ }
  }

  return result;
}
