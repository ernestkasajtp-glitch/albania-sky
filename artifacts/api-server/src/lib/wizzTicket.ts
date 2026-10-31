// Wizzair ticket-confirmation email fetcher.
//
// Kur një rezervim kalon në status "ticketed", kërkojmë në inbox-in e biletave
// (TICKET_INBOX_USER / TICKET_INBOX_PASS — llogari e veçantë Gmail ku vijnë
// konfirmimet nga noreply@wizzair.com) email-in "Your travel itinerary: <PNR>".
// Për çdo PNR përdoret VETËM email-i më i fundit i vlefshëm. Kontrolli bëhet
// pasagjer më pasagjer: PDF ruhet vetëm për ata që ekzistojnë në email-in e
// fundit; të tjerët shënohen "Pa email".
//
// SHUMË PNR NË NJË REZERVIM: një rezervim mund të ketë disa PNR (p.sh.
// "PNR1 NMWP5J / PNR2 ESBFWX" me pasagjerë të ndarë sipas PNR-it individual).
// Kërkimi bëhet PËR ÇDO PNR VEÇMAS — me emrat dhe numrin e pasagjerëve që i
// përkasin atij PNR-i: pasagjerët e të njëjtit PNR duhet të gjenden në të
// njëjtin email. Ruhet një PDF për çdo PNR (aq bileta sa ka PNR); URL-të
// ruhen të bashkuara me presje te bookings.airline_ticket_url. Rezultatet e
// pjesshme ruhen dhe rikontrollohen automatikisht.
import { ImapFlow } from "imapflow";
import { simpleParser, type MailAttachment } from "mailparser";
import { execFile } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, bookingChangeLogsTable, groupTicketSalesTable, groupTicketsTable, settingsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { notifyDataChanged } from "./liveEvents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ticketsUploadDir = path.join(__dirname, "..", "uploads", "tickets");

// ── Config ───────────────────────────────────────────────────────────────────
export function getInboxConfig(): { user: string; pass: string } | null {
  const user = (process.env.TICKET_INBOX_USER || "").trim();
  // App Password i Gmail shpesh ngjitet me hapësira ("abcd efgh ...") — hiqi.
  const pass = (process.env.TICKET_INBOX_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

// ── Parser i email-it të Wizzair ─────────────────────────────────────────────
export interface WizzLeg {
  flightNumber: string;      // normalizuar: "W45126"
  fromCode: string;          // "DTM"
  toCode: string;            // "TIA"
  fromName: string;          // "Dortmund"
  toName: string;            // "Tirana"
  depDate: string;           // "2026-07-18" (ISO)
  depTime: string;           // "14:25"
  arrDate: string;
  arrTime: string;
}

export interface WizzItinerary {
  pnr: string;
  passengers: { first: string; last: string }[];
  legs: WizzLeg[];
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normFlightNo(s: string): string {
  return (s || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/** "18/07/2026" ose "18.07.2026" → "2026-07-18" */
function ddmmyyyyToIso(s: string): string {
  const m = s.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Parson HTML-në e email-it "Your travel itinerary" të Wizzair.
 * Strategjia: heqim tag-et duke i kthyer në ndarës "|", pastaj regex mbi
 * tekstin e sheshtë — struktura e tabelave të Wizzair është stabile.
 */
export function parseWizzairItinerary(html: string): WizzItinerary | null {
  if (!html) return null;
  const flat = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/\|(\s*\|)+/g, "|");

  // Kodi i konfirmimit — anglisht ose gjermanisht ("Flugbestätigungscode";
  // umlaut-i lexohet me [^:|]{0,24} që të mos varet nga encoding-u i entiteteve)
  const pnrMatch = flat.match(/(?:Flight confirmation code|Flugbest[^:|]{0,24}code):\s*\|?\s*([A-Z0-9]{6})/i);
  const pnr = pnrMatch ? pnrMatch[1].toUpperCase() : "";
  if (!pnr) return null;

  // Pasagjerët: |MR|Guxim|TAFHASAJ|DTM-TIA| — titujt e mundshëm të Wizzair
  // (qeliza opsionale midis mbiemrit dhe rrugës, për variante të template-it)
  const passengers: { first: string; last: string }[] = [];
  const paxRe = /\|\s*(MR|MRS|MS|MISS|MSTR|CHD|CHILD|INF|INFANT)\s*\|\s*([^|]{1,50}?)\s*\|\s*([^|]{1,50}?)\s*\|(?:\s*\|)?\s*[A-Z]{3}-[A-Z]{3}\s*\|/gi;
  let pm: RegExpExecArray | null;
  while ((pm = paxRe.exec(flat)) !== null) {
    const first = pm[2].trim();
    const last = pm[3].trim();
    if (first && last) passengers.push({ first, last });
  }

  // Segmentet: GOING OUT / COMING BACK
  const legs: WizzLeg[] = [];
  // Emri i aeroportit mund të përmbajë vetë kllapa — p.sh. "Pisa (Tuscany) (PSA)" —
  // prandaj emri lexohet me [^|]+ (greedy) dhe kodi merret nga kllapat e FUNDIT të qelizës.
  const legRe = /(GOING OUT|COMING BACK)\s*\|\s*Flight Number:\s*([A-Z0-9 ]{2,10}?)\s*\|(?:[^|]*\|)*?\s*Departs from:\s*\|\s*Arrives to:\s*\|(?:\s*\|)?\s*([^|]+)\((\w{3})\)\s*\|\s*([^|]+)\((\w{3})\)\s*\|(?:\s*\|)?\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/gi;
  // Varianti gjerman i template-it: "HINFLUG | Flugnummer: W4 5108 | Abflug von: |
  // Ankunft in: | Hamburg – Terminal 2 (HAM) | Tirana (TIA) | 30.06.2026 16:20 | ..."
  // (RÜCKFLUG lexohet me R[^|]{0,8}CKFLUG që të mos varet nga encoding-u i Ü-së)
  const legReDe = /(HINFLUG|R[^|]{0,8}CKFLUG)\s*\|\s*Flugnummer:\s*([A-Z0-9 ]{2,10}?)\s*\|(?:[^|]*\|)*?\s*Abflug von:\s*\|\s*Ankunft in:\s*\|(?:\s*\|)?\s*([^|]+)\((\w{3})\)\s*\|\s*([^|]+)\((\w{3})\)\s*\|(?:\s*\|)?\s*(\d{2}[./]\d{2}[./]\d{4})\s+(\d{2}:\d{2})\s*\|\s*(\d{2}[./]\d{2}[./]\d{4})\s+(\d{2}:\d{2})/gi;
  let lm: RegExpExecArray | null;
  for (const re of [legRe, legReDe]) {
    while ((lm = re.exec(flat)) !== null) {
      legs.push({
        flightNumber: normFlightNo(lm[2]),
        fromName: lm[3].trim(),
        fromCode: lm[4].toUpperCase(),
        toName: lm[5].trim(),
        toCode: lm[6].toUpperCase(),
        depDate: ddmmyyyyToIso(lm[7]),
        depTime: lm[8],
        arrDate: ddmmyyyyToIso(lm[9]),
        arrTime: lm[10],
      });
    }
  }

  if (legs.length === 0 || passengers.length === 0) return null;
  return { pnr, passengers, legs };
}

// ── Përputhja me rezervimin ──────────────────────────────────────────────────
export interface MatchResult {
  ok: boolean;
  leg?: WizzLeg;
  mismatches: string[];
}

export function matchItineraryToBooking(
  itin: WizzItinerary,
  expectedPnr: string,
  flight: { flightNumber: string; fromCity: string; toCity: string; departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string },
  paxList: { firstName: string; lastName: string; type: string; cancelled?: boolean | null }[],
): MatchResult {
  const mismatches: string[] = [];

  const wantPnr = (expectedPnr || "").trim().toUpperCase();
  if (!wantPnr || wantPnr !== itin.pnr) {
    mismatches.push(`PNR nuk përputhet (sistemi: ${wantPnr || "—"}, email: ${itin.pnr})`);
  }

  // Gjej segmentin që përputhet me fluturimin e sistemit
  const sysFlightNo = normFlightNo(flight.flightNumber);
  const sysFrom = (flight.fromCity || "").trim().toUpperCase();
  const sysTo = (flight.toCity || "").trim().toUpperCase();
  const leg = itin.legs.find(l => l.fromCode === sysFrom && l.toCode === sysTo)
    ?? itin.legs.find(l => l.flightNumber === sysFlightNo);

  if (!leg) {
    mismatches.push(`Asnjë segment në email nuk përputhet me rrugën ${sysFrom}-${sysTo}`);
    return { ok: false, mismatches };
  }

  if (leg.flightNumber !== sysFlightNo) {
    mismatches.push(`Kodi i fluturimit: sistemi ${flight.flightNumber}, email ${leg.flightNumber}`);
  }
  if (leg.fromCode !== sysFrom || leg.toCode !== sysTo) {
    mismatches.push(`Destinacionet: sistemi ${sysFrom}-${sysTo}, email ${leg.fromCode}-${leg.toCode}`);
  }
  if (leg.depDate !== flight.departureDate) {
    mismatches.push(`Data e nisjes: sistemi ${flight.departureDate}, email ${leg.depDate}`);
  }
  if (leg.depTime !== flight.departureTime) {
    mismatches.push(`Orari i nisjes: sistemi ${flight.departureTime}, email ${leg.depTime}`);
  }
  if (leg.arrDate !== flight.arrivalDate) {
    mismatches.push(`Data e mbërritjes: sistemi ${flight.arrivalDate}, email ${leg.arrDate}`);
  }
  if (leg.arrTime !== flight.arrivalTime) {
    mismatches.push(`Orari i mbërritjes: sistemi ${flight.arrivalTime}, email ${leg.arrTime}`);
  }

  // Pasagjerët: çdo pasagjer jo-i-anuluar i KËTIJ PNR-i duhet të gjendet në
  // email-in e këtij PNR-i (pasagjerët e të njëjtit PNR = i njëjti email).
  // (Email-i mund të ketë MË SHUMË pasagjerë — p.sh. rezervim grupi — kjo s'është gabim.)
  const required = paxList.filter(p => !p.cancelled);
  for (const p of required) {
    if (p.type === "infant") continue; // foshnjat s'listohen gjithmonë në tabelën e Wizzair
    if (!itineraryHasPax(itin, p.firstName, p.lastName)) {
      mismatches.push(`Pasagjeri "${p.firstName} ${p.lastName}" nuk u gjet në email`);
    }
  }

  return { ok: mismatches.length === 0, leg, mismatches };
}

/** A gjendet pasagjeri (me emër, edhe i përmbysur) në listën e email-it? */
export function itineraryHasPax(itin: WizzItinerary, firstName: string, lastName: string): boolean {
  const key = `${normName(firstName)} ${normName(lastName)}`;
  for (const p of itin.passengers) {
    if (`${normName(p.first)} ${normName(p.last)}` === key) return true;
    if (`${normName(p.last)} ${normName(p.first)}` === key) return true;
  }
  return false;
}

/**
 * Nxjerr kandidatët e PNR-ve nga fusha e lirë bookings.pnr — token-e 6-shkronjëshe
 * alfanumerike (p.sh. "PNR1 NMWP5J / PNR2 ESBFWX" → ["NMWP5J","ESBFWX"]).
 */
export function extractPnrTokens(s: string | null | undefined): string[] {
  const tokens = (s || "").toUpperCase().match(/\b[A-Z0-9]{6}\b/g) || [];
  return [...new Set(tokens.filter(t => /[A-Z]/.test(t)))];
}

// ── PDF: render IDENTIK i HTML-së së email-it me Chromium headless ──────────
// Kërkesë e përdoruesit: bileta e ruajtur duhet të jetë kopje 1:1 e email-it
// të Wizzair (logo, ngjyra, layout) — jo PDF sintetik. Prandaj HTML-ja
// origjinale e email-it renderohet në PDF me Chromium (--print-to-pdf).

function findChromium(): string | null {
  const candidates = [
    (process.env.CHROMIUM_BIN || "").trim(),
    "/usr/local/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch { /* provo tjetrin */ }
  }
  return null;
}

/** Zëvendëson imazhet inline "cid:xxx" të email-it me data-URI që të shfaqen në PDF. */
function inlineCidImages(html: string, attachments: MailAttachment[] | undefined): string {
  let out = html;
  for (const att of attachments || []) {
    if (!att.contentId || !att.content) continue;
    const cid = String(att.contentId).replace(/[<>]/g, "");
    const dataUri = `data:${att.contentType || "image/png"};base64,${att.content.toString("base64")}`;
    out = out.split(`cid:${cid}`).join(dataUri);
  }
  return out;
}

/**
 * Siguri: HTML-ja e email-it është përmbajtje e palës së tretë. Hiqen skriptet,
 * event-handler-ët (onload etj.), URL-të javascript: dhe iframe/object/embed
 * PARA renderimit, që Chrome të mos ekzekutojë asnjë kod nga email-i.
 * (Flamuri --blink-settings=scriptEnabled=false prish --print-to-pdf në Chrome 150,
 * prandaj sanitizimi bëhet këtu në kod.)
 */
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<(iframe|object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/((?:href|src|action)\s*=\s*["']?)\s*javascript:/gi, "$1blocked:");
}

/**
 * Pret email-in që PDF-ja të përmbajë VETËM pjesën e biletës (logo, kodi i
 * konfirmimit, pasagjerët, detajet e fluturimit) — pa reklamat poshtë
 * (Booking.com, makina me qira, banera admaster, footer). Kërkesë e përdoruesit.
 *
 * Si punon: gjendet fundi i segmentit të fundit të fluturimit (GOING OUT /
 * COMING BACK pas "Flight details") dhe pritet te tabela e parë e reklamave pas tij.
 * Nëse asnjë shënjues reklame s'gjendet, kthehet HTML-ja e plotë (fail-open).
 */
function trimWizzEmailForPdf(html: string): string {
  const fdIdx = html.search(/Flight details/i);
  if (fdIdx < 0) return html;

  // Fundi i segmentit të fundit (GOING OUT ose COMING BACK)
  let searchStart = fdIdx;
  const legRe = /GOING OUT|COMING BACK/gi;
  legRe.lastIndex = fdIdx;
  let m: RegExpExecArray | null;
  while ((m = legRe.exec(html)) !== null) searchStart = m.index + m[0].length;

  // Shënjuesit e reklamave — i pari që shfaqet pas segmentit të fundit fiton
  const adMarkers = [
    "booking.com/searchresults",
    "YOU ARE PROTECTED",
    "admaster.lxm-group.com",
    "Earn WIZZ Credit",
    "Car hire in",
    "BOOK A HOTEL",
  ];
  let cutMarker = -1;
  for (const marker of adMarkers) {
    const idx = html.indexOf(marker, searchStart);
    if (idx >= 0 && (cutMarker < 0 || idx < cutMarker)) cutMarker = idx;
  }
  if (cutMarker < 0) return html;

  // Prije te hapja e tabelës që përmban shënjuesin (mos lër tabelë gjysmake)
  const tableStart = html.lastIndexOf("<table", cutMarker);
  if (tableStart <= searchStart) return html;
  return html.slice(0, tableStart) + "</body></html>";
}

/**
 * Modifikon tabelën "Passenger info" të email-it PARA renderimit në PDF
 * (kërkesë e përdoruesit 03.08.2026):
 *  1) Heq rreshtat e pasagjerëve që NUK janë në sistem për këtë rezervim
 *     (email-i i grupit mund të ketë persona të tjerë — ata s'duhen në PDF).
 *  2) Zbrazet kolona "Seat" (numri i sedilës nga email-i nuk duhet).
 * ASNJË ndryshim tjetër në përmbajtje. Në çdo rast të papritur (struktura e
 * tabelës ndryshe, asnjë rresht i njohur, të gjithë do hiqeshin) kthehet
 * HTML-ja ORIGJINALE e paprekur — kurrë PDF e prishur ose bosh.
 */
export function filterWizzPaxForPdf(
  html: string,
  allowedPax: { firstName: string; lastName: string }[],
): string {
  try {
    if (allowedPax.length === 0) return html;
    const allowed = new Set<string>();
    for (const p of allowedPax) {
      allowed.add(`${normName(p.firstName)} ${normName(p.lastName)}`);
      allowed.add(`${normName(p.lastName)} ${normName(p.firstName)}`);
    }

    // Zona e tabelës së pasagjerëve: nga "Passenger info" deri te "Flight details"
    const startIdx = html.search(/Passenger info/i);
    const endIdx = html.search(/Flight details/i);
    if (startIdx < 0 || endIdx <= startIdx) return html;
    const region = html.slice(startIdx, endIdx);

    const cellText = (td: string): string =>
      td.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();

    const TITLE_RE = /^(MR|MRS|MS|MISS|MSTR|CHD|CHILD|INF|INFANT)$/i;
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let paxRowsSeen = 0;
    let paxRowsKept = 0;
    let dropping = false; // po heqim rreshtat vazhdues të pasagjerit aktual?

    const newRegion = region.replace(rowRe, (row) => {
      const tds = row.match(/<td[\s\S]*?(?:<\/td>|\/>)/gi) || [];
      const texts = tds.map(cellText);

      // Rreshti i kokës: zbraz etiketën "Seat" (kolona mbetet, pa numra)
      if (texts.some(t => /^First name$/i.test(t))) {
        dropping = false;
        return row.replace(/(>)\s*Seat\s*(<)/, "$1$2");
      }
      // Rresht ndarës / bosh — mbahet gjithmonë
      if (texts.every(t => t === "") || /colspan/i.test(row)) { return row; }

      // Rresht pasagjeri: >=6 qeliza, emër+mbiemër në pozicionet 1,2 dhe rrugë XXX-XXX
      const looksPax = tds.length >= 6 && texts.slice(0, 4).some(t => /^[A-Z]{3}-[A-Z]{3}$/.test(t))
        && (TITLE_RE.test(texts[0]) || texts[0] === "");
      if (looksPax) {
        paxRowsSeen++;
        const key = `${normName(texts[1])} ${normName(texts[2])}`;
        const keep = allowed.has(key);
        dropping = !keep;
        if (!keep) return "";
        paxRowsKept++;
        // Zbraz qelizën e fundit (Seat) pa prekur asgjë tjetër
        const lastTd = tds[tds.length - 1];
        const blanked = lastTd.replace(/(<td[^>]*>)[\s\S]*(<\/td>)/i, "$1$2");
        return row.replace(lastTd, blanked);
      }

      // Rresht vazhdues (segmenti i kthimit i të njëjtit pasagjer, me rowspan):
      // ndiqet vendimi i pasagjerit të fundit
      if (dropping) return "";
      if (tds.length >= 3 && texts.some(t => /^[A-Z]{3}-[A-Z]{3}$/.test(t))) {
        const lastTd = tds[tds.length - 1];
        const blanked = lastTd.replace(/(<td[^>]*>)[\s\S]*(<\/td>)/i, "$1$2");
        return row.replace(lastTd, blanked);
      }
      return row;
    });

    // Siguri: nëse s'u njoh asnjë rresht pasagjeri, ose do fshiheshin TË GJITHË,
    // mos prek asgjë — më mirë PDF identike me email-in sesa e zbrazët/e prishur.
    if (paxRowsSeen === 0 || paxRowsKept === 0) return html;

    return html.slice(0, startIdx) + newRegion + html.slice(endIdx);
  } catch {
    return html;
  }
}

export async function renderEmailHtmlToPdf(
  rawHtml: string,
  allowedPax: { firstName: string; lastName: string }[] = [],
  strictPaxFilter = false,
): Promise<Buffer> {
  const filteredHtml = filterWizzPaxForPdf(rawHtml, allowedPax);
  if (strictPaxFilter) {
    // Rezultati i pjesshëm s'mund të bëjë fail-open: nëse filtri nuk garanton
    // që PDF-ja përmban VETËM pasagjerët e lejuar, mos gjenero asnjë PDF.
    const filteredItinerary = parseWizzairItinerary(filteredHtml);
    const allowedKeys = new Set<string>();
    for (const p of allowedPax) {
      allowedKeys.add(`${normName(p.firstName)} ${normName(p.lastName)}`);
      allowedKeys.add(`${normName(p.lastName)} ${normName(p.firstName)}`);
    }
    const hasUnexpectedPax = !filteredItinerary || filteredItinerary.passengers.some(p =>
      !allowedKeys.has(`${normName(p.first)} ${normName(p.last)}`),
    );
    const isMissingAllowedPax = !filteredItinerary || allowedPax.some(p =>
      !itineraryHasPax(filteredItinerary, p.firstName, p.lastName),
    );
    if (hasUnexpectedPax || isMissingAllowedPax) {
      throw new Error("Filtrimi i sigurt i pasagjerëve dështoi — PDF-ja e pjesshme nuk u ruajt");
    }
  }
  const html = trimWizzEmailForPdf(sanitizeEmailHtml(filteredHtml));
  const bin = findChromium();
  if (!bin) {
    throw new Error("Chromium s'u gjet në server — instalo chromium ose vendos CHROMIUM_BIN");
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wizzpdf-"));
  const htmlPath = path.join(tmpDir, "email.html");
  const pdfPath = path.join(tmpDir, "email.pdf");
  fs.writeFileSync(htmlPath, html);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        bin,
        [
          "--headless",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          "--no-pdf-header-footer",
          // Prit deri 15s "kohë virtuale" që imazhet remote të ngarkohen para printimit
          "--virtual-time-budget=15000",
          `--print-to-pdf=${pdfPath}`,
          `file://${htmlPath}`,
        ],
        { timeout: 90000 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    return fs.readFileSync(pdfPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Kërkimi në inbox + ruajtja ───────────────────────────────────────────────
export interface FetchTicketResult {
  found: boolean;
  reason?: string;         // shqip, për UI
  url?: string;            // të gjitha URL-të, të bashkuara me presje
  urls?: string[];         // një URL për çdo PNR/biletë
  matchedCount?: number;   // pasagjerë me biletë në email-in më të fundit
  expectedCount?: number;  // pasagjerë aktivë (pa infant) që presin biletë
  missingPassengers?: string[];
  retryable?: boolean;     // gabim teknik: inbox cursor-i s'duhet avancuar
}

/**
 * Kërkon në inbox email-in e konfirmimit për një rezervim dhe, nëse gjithçka
 * përputhet, ruan PDF-në dhe përditëson bookings.airline_ticket_url.
 * I sigurt të thirret fire-and-forget — s'hedh kurrë përjashtim.
 */
// Guard: mos hap dy sesione IMAP paralele për të njëjtin rezervim
// (trigger-i i statusit, butoni manual dhe skaneri periodik mund të mbivendosen)
const inFlightBookings = new Set<number>();

const REASON_IN_PROGRESS = "Kërkimi për këtë rezervim është tashmë në proces";

export async function fetchWizzTicketForBooking(bookingId: number): Promise<FetchTicketResult> {
  const result = await fetchWizzTicketInner(bookingId);
  // Ruaj rezultatin e fundit si shënim të përhershëm te rezervimi (kutia afër
  // butonit "Kërko Biletën në Email") — mos e mbishkruaj kur kërkimi s'u ekzekutua fare.
  if (result.reason !== REASON_IN_PROGRESS) {
    const n = result.urls?.length ?? 0;
    const note = result.found
      ? (result.reason ?? (n > 1 ? `U gjetën ${n} bileta (një për çdo PNR) dhe u ruajtën si PDF` : "Bileta u gjet dhe u ruajt si PDF"))
      : (result.reason ?? "Bileta nuk u gjet");
    try {
      const [prev] = await db.select({ note: bookingsTable.ticketSearchNote })
        .from(bookingsTable).where(eq(bookingsTable.id, bookingId));
      // updatedAt ruhet siç është — shënimi s'duhet ta rifreskojë (skaneri periodik
      // përdor updatedAt për dritaren 45-ditore dhe prioritetin "më të rinjtë")
      await db.update(bookingsTable)
        .set({ ticketSearchNote: note, ticketSearchNoteAt: new Date(), updatedAt: sql`${bookingsTable.updatedAt}` })
        .where(eq(bookingsTable.id, bookingId));
      notifyDataChanged("bookings");
      // Gjurmë e PËRHERSHME në Historikun e rezervimit sa herë që rezultati i
      // kërkimit NDRYSHON (jo çdo riprovë e cron-it me të njëjtin mesazh), që
      // të shihet më vonë se çfarë ka ndodhur me PNR-in edhe pasi bileta
      // gjendet dhe shënimi i fundit mbishkruhet. Suksesi regjistrohet veç
      // (rreshti "Bileta Wizz" më poshtë), prandaj këtu vetëm dështimet.
      if (!result.found && prev && (prev.note ?? null) !== note) {
        await db.insert(bookingChangeLogsTable).values({
          bookingId,
          userId: null,
          userName: "Sistemi",
          userRole: null,
          action: "ticket_search",
          fieldName: null,
          oldValue: null,
          newValue: null,
          note,
        }).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, bookingId }, "WizzTicket: shënimi i rezultatit nuk u ruajt dot");
    }
  }
  return result;
}

// Heq biletën e ruajtur nga rezervimi (kur statusi kthehet nga "ticketed"
// mbrapsht). Fshin PDF-të nga disku (best-effort), pastron airline_ticket_url
// + shënimin e kërkimit, dhe lë gjurmë në Historik. Kështu, kur rezervimi
// bëhet përsëri "ticketed", kërkimi nis NGA E PARA me të dhënat aktuale
// (orari i ri i fluturimit përfshirë) — s'kthehet kurrë bileta e vjetër.
export async function clearSavedWizzTicket(bookingId: number, reasonNote: string): Promise<void> {
  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking?.airlineTicketUrl) return;

    const fileNames = booking.airlineTicketUrl
      .split(",")
      .map(u => u.trim())
      .filter(Boolean)
      .map(u => path.basename(u));

    await db.update(bookingsTable)
      .set({
        airlineTicketUrl: null,
        ticketSearchNote: reasonNote,
        ticketSearchNoteAt: new Date(),
        updatedAt: sql`${bookingsTable.updatedAt}`,
      })
      .where(eq(bookingsTable.id, bookingId));
    notifyDataChanged("bookings");

    for (const name of fileNames) {
      // vetëm emra të sigurt skedari — asnjë path traversal
      if (!/^[A-Za-z0-9._-]+\.pdf$/i.test(name)) continue;
      try { fs.unlinkSync(path.join(ticketsUploadDir, name)); } catch { /* best-effort */ }
    }

    await db.insert(bookingChangeLogsTable).values({
      bookingId,
      userId: null,
      userName: "Sistemi",
      userRole: null,
      action: "updated",
      fieldName: "Bileta Wizz",
      oldValue: fileNames.join(", ") || null,
      newValue: null,
      note: reasonNote,
    }).catch(() => {});

    logger.info({ bookingId, fileNames }, "WizzTicket: bileta e ruajtur u hoq");
  } catch (err) {
    logger.warn({ err, bookingId }, "WizzTicket: heqja e biletës së ruajtur dështoi");
  }
}

// Kontroll integriteti — thirret nga skaneri periodik: gjen rezervimet "ticketed"
// me biletë të ruajtur, verifikon që PDF-të ekzistojnë në disk, dhe kur mungojnë
// e heq biletën (shënim "nuk u gjet" + Historik) që kërkimi të rifillojë vetiu.
export async function sweepMissingSavedTickets(): Promise<number> {
  let cleared = 0;
  try {
    const rows = await db.select({ id: bookingsTable.id, url: bookingsTable.airlineTicketUrl })
      .from(bookingsTable)
      .where(sql`${bookingsTable.status} = 'ticketed' AND ${bookingsTable.airlineTicketUrl} IS NOT NULL`)
      .limit(1000);
    for (const r of rows) {
      const names = (r.url ?? "").split(",").map(u => path.basename(u.trim())).filter(Boolean);
      const missing = names.filter(n => !fs.existsSync(path.join(ticketsUploadDir, n)));
      if (missing.length === 0) continue;
      await clearSavedWizzTicket(r.id, `Bileta e ruajtur nuk u gjet më në sistem (mungon skedari PDF: ${missing.join(", ")}) — kërkimi në email rifillon nga e para`);
      cleared++;
    }
    if (cleared > 0) logger.warn({ cleared }, "WizzTicket: bileta të ruajtura me PDF që mungon u pastruan");
  } catch (err) {
    logger.error({ err }, "WizzTicket: kontrolli i integritetit të biletave dështoi");
  }
  return cleared;
}

const WIZZ_INBOX_CURSOR_KEY = "wizz_ticket_inbox_cursor_v1";
const WIZZ_INBOX_BOOTSTRAP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface WizzInboxCursor {
  uidValidity: string;
  lastUid: number;
}

async function readWizzInboxCursor(): Promise<WizzInboxCursor | null> {
  const [row] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, WIZZ_INBOX_CURSOR_KEY));
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    const lastUid = Number(parsed.lastUid);
    const uidValidity = String(parsed.uidValidity ?? "");
    if (!uidValidity || !Number.isSafeInteger(lastUid) || lastUid < 0) return null;
    return { uidValidity, lastUid };
  } catch {
    return null;
  }
}

async function saveWizzInboxCursor(cursor: WizzInboxCursor): Promise<void> {
  const value = JSON.stringify(cursor);
  const [existing] = await db.select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, WIZZ_INBOX_CURSOR_KEY));
  if (existing) {
    await db.update(settingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(settingsTable.key, WIZZ_INBOX_CURSOR_KEY));
  } else {
    await db.insert(settingsTable).values({ key: WIZZ_INBOX_CURSOR_KEY, value });
  }
}

async function findBookingsForIncomingWizzPnrs(pnrs: string[]): Promise<number[]> {
  if (pnrs.length === 0) return [];
  const pnrList = sql.join(pnrs.map(pnr => sql`${pnr}`), sql`, `);
  const rows = await db.selectDistinct({ id: bookingsTable.id })
    .from(bookingsTable)
    .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(and(
      eq(bookingsTable.status, "ticketed"),
      sql`${bookingsTable.ticketSearchExcluded} IS NOT TRUE`,
      sql`${flightsTable.airline} ILIKE '%wizz%'`,
      sql`${flightsTable.departureDate}::date >= CURRENT_DATE - INTERVAL '2 days'`,
      sql`(
        EXISTS (
          SELECT 1
          FROM unnest(regexp_split_to_array(UPPER(COALESCE(${bookingsTable.pnr}, '')), '[^A-Z0-9]+')) token
          WHERE token IN (${pnrList})
        )
        OR EXISTS (
          SELECT 1 FROM passengers p
          WHERE p.booking_id = ${bookingsTable.id}
            AND p.cancelled IS NOT TRUE
            AND UPPER(BTRIM(COALESCE(p.pnr, ''))) IN (${pnrList})
        )
        OR EXISTS (
          SELECT 1
          FROM passengers p
          JOIN group_ticket_sales gts ON gts.booking_passenger_id = p.id
          LEFT JOIN group_tickets gt ON gt.id = gts.group_ticket_id
          WHERE p.booking_id = ${bookingsTable.id}
            AND p.cancelled IS NOT TRUE
            AND UPPER(COALESCE(NULLIF(BTRIM(gts.pnr_new), ''), NULLIF(BTRIM(gt.pnr_original), ''), '')) IN (${pnrList})
        )
      )`,
    ))
    .orderBy(bookingsTable.id);
  return rows.map(row => row.id);
}

export interface WizzInboxScanResult {
  initialized: boolean;
  emailsChecked: number;
  pnrs: string[];
  bookingIds: number[];
}

export function canCommitWizzInboxCursor(results: FetchTicketResult[]): boolean {
  return results.every(result => result.retryable !== true);
}

export function selectWizzEmailCandidate<T, P>(
  candidates: T[],
  isFullMatch: (candidate: T) => boolean,
  matchedPassengers: (candidate: T) => P[],
): { candidate: T; matched: P[]; full: boolean } | null {
  const fullCandidate = candidates.find(isFullMatch);
  if (fullCandidate) {
    return { candidate: fullCandidate, matched: matchedPassengers(fullCandidate), full: true };
  }
  const latestCandidate = candidates[0];
  if (!latestCandidate) return null;
  const matched = matchedPassengers(latestCandidate);
  return matched.length > 0 ? { candidate: latestCandidate, matched, full: false } : null;
}

export function selectWizzEmailForUnassignedPassenger<T>(
  selectedCandidate: T | null,
  candidates: T[],
  matchesPassenger: (candidate: T) => boolean,
): T | null {
  if (selectedCandidate) return matchesPassenger(selectedCandidate) ? selectedCandidate : null;
  return candidates.find(matchesPassenger) ?? null;
}

export function extractPnrFromWizzItinerarySubject(subject: string): string | null {
  const match = subject.match(/(?:travel itinerary|reiseroute)\s*[:\-]?\s*([A-Z0-9]{5,8})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Lexon vetëm email-et Wizz të mbërritura pas UID watermark-it të fundit.
 * Për çdo PNR të ri rikontrollon vetëm rezervimet që e përdorin atë PNR.
 * Watermark-i ruhet pasi radha mbaron; një crash mund të shkaktojë retry të
 * sigurt, por nuk mund ta humbasë email-in duke e shënuar para kohe.
 */
export async function scanNewWizzTicketEmails(): Promise<WizzInboxScanResult> {
  const config = getInboxConfig();
  if (!config) return { initialized: false, emailsChecked: 0, pnrs: [], bookingIds: [] };

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  let cursor: WizzInboxCursor | null = null;
  let uidValidity = "";
  let maxUid = 0;
  let initialized = false;
  const pnrs = new Set<string>();
  let emailsChecked = 0;

  try {
    cursor = await readWizzInboxCursor();
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    uidValidity = String(mailbox.uidValidity ?? "");
    maxUid = Math.max(0, Number(mailbox.uidNext ?? 1) - 1);

    const cursorIsValid = !!cursor && cursor.uidValidity === uidValidity && cursor.lastUid <= maxUid;
    initialized = !cursorIsValid;
    const searchResult = cursorIsValid
      ? await client.search(
          { from: "wizzair.com", uid: `${Math.max(1, cursor!.lastUid + 1)}:*` },
          { uid: true },
        )
      : await client.search(
          { from: "wizzair.com", since: new Date(Date.now() - WIZZ_INBOX_BOOTSTRAP_LOOKBACK_MS) },
          { uid: true },
        );
    const uids = (Array.isArray(searchResult) ? searchResult : [])
      .filter(uid => Number.isSafeInteger(uid) && uid > 0 && uid <= maxUid)
      .sort((a, b) => a - b);

    if (uids.length > 0) {
      // Një komandë IMAP për të gjithë header-ët, jo një round-trip për çdo UID.
      // HTML/PDF shkarkohet më pas vetëm për rezervimet e PNR-ve të gjetura.
      for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
        if (!msg.envelope) continue;
        emailsChecked++;
        const senderAddr = msg.envelope.from?.[0]?.address || "";
        if (!/@wizzair\.com$/i.test(senderAddr)) continue;
        const pnr = extractPnrFromWizzItinerarySubject(msg.envelope.subject || "");
        if (pnr) pnrs.add(pnr);
      }
    }
    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch {}
    logger.error({ err }, "WizzTicket: leximi i email-eve të reja dështoi");
    throw err;
  }

  const pnrList = [...pnrs];
  const bookingIds = await findBookingsForIncomingWizzPnrs(pnrList);
  const bookingResults: FetchTicketResult[] = [];
  for (const bookingId of bookingIds) {
    try {
      bookingResults.push(await fetchWizzTicketForBooking(bookingId));
    } catch (err: any) {
      bookingResults.push({
        found: false,
        reason: `Gabim i papritur gjatë radhës: ${err?.message || String(err)}`,
        retryable: true,
      });
    }
  }
  if (!canCommitWizzInboxCursor(bookingResults)) {
    logger.warn(
      { pnrs: pnrList, bookingIds },
      "WizzTicket: cursor-i nuk avancohet sepse të paktën një rezervim dështoi përkohësisht",
    );
    throw new Error("Radha e email-eve Wizz pati gabim të përkohshëm; do të riprovohet");
  }

  await saveWizzInboxCursor({ uidValidity, lastUid: maxUid });
  logger.info(
    { initialized, emailsChecked, pnrs: pnrList.length, bookings: bookingIds.length, lastUid: maxUid },
    "WizzTicket: email-et e reja u kontrolluan",
  );
  return { initialized, emailsChecked, pnrs: pnrList, bookingIds };
}

async function fetchWizzTicketInner(bookingId: number): Promise<FetchTicketResult> {
  if (inFlightBookings.has(bookingId)) {
    return { found: false, reason: REASON_IN_PROGRESS, retryable: true };
  }
  inFlightBookings.add(bookingId);
  try {
    const config = getInboxConfig();
    if (!config) return { found: false, reason: "Inbox-i i biletave s'është konfiguruar (TICKET_INBOX_USER/PASS)", retryable: true };

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) return { found: false, reason: "Rezervimi nuk u gjet" };
    if (booking.ticketSearchExcluded) {
      return { found: false, reason: "Ky rezervim është i përjashtuar nga kërkimi në email" };
    }
    if (booking.airlineTicketUrl) {
      // Verifiko që skedarët PDF ekzistojnë vërtet në disk — nëse ndonjë mungon,
      // hiqe biletën e ruajtur (me shënim + Historik) dhe rifillo kërkimin nga e para.
      const savedNames = booking.airlineTicketUrl.split(",").map(u => path.basename(u.trim())).filter(Boolean);
      const missing = savedNames.filter(n => !fs.existsSync(path.join(ticketsUploadDir, n)));
      if (missing.length > 0) {
        await clearSavedWizzTicket(bookingId, `Bileta e ruajtur nuk u gjet më në sistem (mungon skedari PDF: ${missing.join(", ")}) — kërkimi në email rifillon nga e para`);
      }
      // Edhe kur PDF-ja ekziston, vazhdo kërkimin: i njëjti PNR mund të vijë
      // përsëri nga Wizz me pasagjerë të ndryshëm. Email-i MË I FUNDIT është
      // autoritar dhe mund ta zhvlerësojë PDF-në e vjetër.
    }

    const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
    if (!flight) return { found: false, reason: "Fluturimi nuk u gjet" };
    if (!/wizz/i.test(flight.airline)) return { found: false, reason: "Fluturimi nuk është i Wizzair" };

    if (!/^[A-Za-z0-9-]+$/.test(booking.bookingRef)) {
      return { found: false, reason: "Referenca e rezervimit përmban karaktere të palejuara" };
    }

    const allPax = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, bookingId));
    const activePax = allPax.filter(p => !p.cancelled);
    if (activePax.length === 0) return { found: false, reason: "Rezervimi s'ka pasagjerë aktivë" };

    // PNR efektiv për çdo pasagjer: pnr-i vetjak → pnr-i i shitjes së grupit → (asnjë)
    const paxIds = allPax.map(p => p.id);
    const groupSales = paxIds.length > 0
      ? await db.select({
          bookingPassengerId: groupTicketSalesTable.bookingPassengerId,
          pnrNew: groupTicketSalesTable.pnrNew,
          pnrOriginal: groupTicketsTable.pnrOriginal,
        })
        .from(groupTicketSalesTable)
        .leftJoin(groupTicketsTable, eq(groupTicketSalesTable.groupTicketId, groupTicketsTable.id))
        .where(inArray(groupTicketSalesTable.bookingPassengerId, paxIds))
        .orderBy(desc(groupTicketSalesTable.createdAt))
      : [];
    const groupPnrByPax = new Map<number, string>();
    for (const s of groupSales) {
      if (s.bookingPassengerId == null || groupPnrByPax.has(s.bookingPassengerId)) continue;
      const gp = ((s.pnrNew ?? "").trim() || (s.pnrOriginal ?? "").trim()).toUpperCase();
      if (gp) groupPnrByPax.set(s.bookingPassengerId, gp);
    }
    const validPnr = (s: string) => /^[A-Z0-9]{5,8}$/.test(s);
    const effectivePnr = (p: typeof allPax[number]): string | null => {
      const own = (p.pnr || "").trim().toUpperCase();
      if (validPnr(own)) return own;
      const gp = groupPnrByPax.get(p.id) || "";
      if (validPnr(gp)) return gp;
      return null;
    };

    // Grupet: PNR → pasagjerët e atij PNR-i (ata duhet të jenë në të njëjtin email)
    const groups = new Map<string, typeof allPax>();
    const unassigned: typeof allPax = [];
    for (const p of activePax) {
      const ep = effectivePnr(p);
      if (ep) {
        if (!groups.has(ep)) groups.set(ep, []);
        groups.get(ep)!.push(p);
      } else {
        unassigned.push(p);
      }
    }

    // Kandidatët: PNR-të e pasagjerëve + token-et nga fusha e lirë bookings.pnr
    // (rendi: si në fushën e rezervimit, pastaj të tjerët)
    const tokenPnrs = extractPnrTokens(booking.pnr).filter(validPnr);
    const candidatePnrs: string[] = [];
    for (const t of tokenPnrs) if (!candidatePnrs.includes(t)) candidatePnrs.push(t);
    for (const g of groups.keys()) if (!candidatePnrs.includes(g)) candidatePnrs.push(g);
    if (candidatePnrs.length === 0) {
      return { found: false, reason: "Rezervimi s'ka PNR të vlefshëm — vendos PNR-in më parë" };
    }

    // Rast klasik: një PNR i vetëm — të gjithë pasagjerët pa PNR i përkasin atij
    if (candidatePnrs.length === 1 && unassigned.length > 0) {
      const only = candidatePnrs[0];
      if (!groups.has(only)) groups.set(only, []);
      groups.get(only)!.push(...unassigned);
      unassigned.length = 0;
    }

    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });

    // Një sesion IMAP — për çdo PNR kontrollohen deri në 5 email-et më të
    // fundit të vlefshme. Mjafton që njëri prej tyre të përputhet me rezervimin.
    const foundEmails = new Map<string, { itin: WizzItinerary; html: string }[]>();
    try {
      await client.connect();
      await client.mailboxOpen("INBOX", { readOnly: true });

      for (const pnr of candidatePnrs) {
        // Kërkim i shënjestruar: subjekti përmban PNR-in ("Your travel itinerary: XXXXXX")
        const uids = await client.search({ from: "wizzair.com", subject: pnr });
        if (!Array.isArray(uids) || uids.length === 0) continue;

        // Nga më i riu te më i vjetri — ruaj deri në 5 email-e që parsohen
        // dhe verifikohen si email real Wizz për këtë PNR.
        const candidates: { itin: WizzItinerary; html: string }[] = [];
        for (const uid of uids.slice().reverse()) {
          if (candidates.length >= 5) break;
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: false });
          if (!msg || typeof msg === "boolean" || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          // Subjekti i itinerarit sipas gjuhës së email-it: EN "Your travel itinerary",
          // DE "Ihre Reiseroute" — verifikimi real bëhet nga parsimi + PNR më poshtë
          if (!/travel itinerary|reiseroute/i.test(parsed.subject || "")) continue;
          // Siguri: verifiko adresën REALE të dërguesit (kërkimi IMAP "from" është
          // vetëm substring dhe mund të mashtrohet me p.sh. fake-wizzair.com.evil.net)
          const senderAddr = parsed.from?.value?.[0]?.address || "";
          if (!/@wizzair\.com$/i.test(senderAddr)) continue;
          const html = typeof parsed.html === "string" ? parsed.html : "";
          const candidate = parseWizzairItinerary(html);
          if (!candidate || candidate.pnr !== pnr) continue;
          // Ruaj HTML-në origjinale të email-it (me imazhet cid: të inlinuar)
          // që PDF-ja të jetë kopje identike e email-it — ASNJË edit përmbajtjeje.
          candidates.push({ itin: candidate, html: inlineCidImages(html, parsed.attachments) });
        }
        if (candidates.length > 0) foundEmails.set(pnr, candidates);
      }
      await client.logout();
    } catch (imapErr: any) {
      try { await client.logout(); } catch {}
      logger.error({ err: imapErr, bookingId }, "WizzTicket: gabim IMAP");
      return { found: false, reason: `Gabim lidhjeje me inbox-in: ${imapErr.responseText || imapErr.message}`, retryable: true };
    }

    // Për çdo PNR zgjidhet email-i i parë që përputhet me të gjithë grupin.
    // Nëse asnjë email nuk është i plotë, përdoret kandidati me më shumë
    // pasagjerë të përputhur për të ruajtur gjendjen e pjesshme ekzistuese.
    const selected = new Map<string, { itin: WizzItinerary; html: string }>();
    const matchedByPnr = new Map<string, typeof allPax>();
    const matchedPaxIds = new Set<number>();
    const missingPax = new Map<number, typeof allPax[number]>();
    const problems: string[] = [];

    const addMatched = (pnr: string, pax: typeof allPax[number]) => {
      matchedPaxIds.add(pax.id);
      missingPax.delete(pax.id);
      const list = matchedByPnr.get(pnr) ?? [];
      if (!list.some(x => x.id === pax.id)) list.push(pax);
      matchedByPnr.set(pnr, list);
    };

    for (const [pnr, paxGroup] of groups) {
      const expectedGroup = paxGroup.filter(p => !p.cancelled && p.type !== "infant");
      const candidates = foundEmails.get(pnr) ?? [];
      if (candidates.length === 0) {
        for (const p of expectedGroup) missingPax.set(p.id, p);
        problems.push(`PNR ${pnr}: email-i "Your travel itinerary: ${pnr}" nuk u gjet`);
        continue;
      }

      const selection = selectWizzEmailCandidate(
        candidates,
        cand => {
          const match = matchItineraryToBooking(cand.itin, pnr, flight, expectedGroup);
          return match.ok && !!match.leg;
        },
        cand => {
          const flightMatch = matchItineraryToBooking(cand.itin, pnr, flight, []);
          if (!flightMatch.ok || !flightMatch.leg) return [];
          return expectedGroup.filter(p => itineraryHasPax(cand.itin, p.firstName, p.lastName));
        },
      );
      if (!selection) {
        for (const p of expectedGroup) missingPax.set(p.id, p);
        const mismatchDetails = candidates
          .map(candidate => matchItineraryToBooking(candidate.itin, pnr, flight, expectedGroup).mismatches.join("; "))
          .filter(Boolean);
        const uniqueDetails = [...new Set(mismatchDetails)].slice(0, 3);
        problems.push(
          `PNR ${pnr}: email-i u gjet, por nuk përputhet me rezervimin${uniqueDetails.length ? ` — ${uniqueDetails.join(" | ")}` : ""}`,
        );
        continue;
      }
      selected.set(pnr, selection.candidate);
      const matchedIds = new Set(selection.matched.map(p => p.id));
      for (const p of expectedGroup) {
        if (matchedIds.has(p.id)) {
          addMatched(pnr, p);
        } else {
          missingPax.set(p.id, p);
          problems.push(`PNR ${pnr}: pasagjeri "${p.firstName} ${p.lastName}" nuk u gjet në email-in që përputhet`);
        }
      }
    }

    // Pasagjerët pa PNR të caktuar: kërkohen në cilindo email kandidat.
    for (const p of unassigned) {
      if (p.type === "infant") continue;
      let covered = false;
      for (const [pnr, candidates] of foundEmails) {
        const cand = selectWizzEmailForUnassignedPassenger(
          selected.get(pnr) ?? null,
          candidates,
          cand => {
            if (!itineraryHasPax(cand.itin, p.firstName, p.lastName)) return false;
            const match = matchItineraryToBooking(cand.itin, pnr, flight, []);
            return match.ok && !!match.leg;
          },
        );
        if (cand) {
          covered = true;
          if (!selected.has(pnr)) selected.set(pnr, cand);
          addMatched(pnr, p);
        }
        if (covered) break;
      }
      if (!covered) {
        missingPax.set(p.id, p);
        problems.push(`Pasagjeri "${p.firstName} ${p.lastName}" nuk u gjet në asnjë email të PNR-ve ${candidatePnrs.join(", ")}`);
      }
    }

    const expectedPax = activePax.filter(p => p.type !== "infant");
    // Çdo pasagjer aktiv jo-infant që s'u përputh më lart është "Pa email".
    for (const p of expectedPax) {
      if (!matchedPaxIds.has(p.id)) missingPax.set(p.id, p);
    }
    const matchedCount = matchedPaxIds.size;
    const expectedCount = expectedPax.length;
    const missingNames = [...missingPax.values()].map(p => `${p.firstName} ${p.lastName}`.trim());
    const uniqueProblems = [...new Set(problems)];
    const partialReason = [
      `Emaili më i fundit: ${matchedCount} ${matchedCount === 1 ? "biletë ekzistuese" : "bileta ekzistuese"}, ${missingNames.length} pa email${missingNames.length ? `. Pa email: ${missingNames.join(", ")}` : ""}`,
      uniqueProblems.length ? `Detajet: ${uniqueProblems.join(" | ")}` : "",
    ].filter(Boolean).join(". ");

    // Cilat email-e ruhen si PDF: email-et më të fundit ku u gjet të paktën
    // një pasagjer i këtij rezervimi.
    const pnrsToSave = candidatePnrs.filter(pnr => selected.has(pnr));
    if (pnrsToSave.length === 0) {
      if (booking.airlineTicketUrl) {
        await clearSavedWizzTicket(bookingId, partialReason);
      }
      return {
        found: false,
        reason: partialReason,
        matchedCount,
        expectedCount,
        missingPassengers: missingNames,
      };
    }

    // Rendero TË GJITHA PDF-të para se të ruhet gjë — asnjë gjendje gjysmake
    const rendered: { pnr: string; fileName: string; pdf: Buffer }[] = [];
    for (const pnr of pnrsToSave) {
      try {
        // PDF-ja shfaq VETËM pasagjerët e këtij rezervimi që gjenden në email-in
        // më të fundit; personat e tjerë të email-it hiqen.
        const matchedForPnr = matchedByPnr.get(pnr) ?? [];
        const pdf = await renderEmailHtmlToPdf(
          selected.get(pnr)!.html,
          matchedForPnr.map(p => ({ firstName: p.firstName, lastName: p.lastName })),
          missingNames.length > 0,
        );
        rendered.push({ pnr, fileName: `${booking.bookingRef}-${pnr}.pdf`, pdf });
      } catch (renderErr: any) {
        logger.error({ err: renderErr, bookingId, pnr }, "WizzTicket: renderimi i PDF-së dështoi");
        // Ruaj prefiksin standard të rezultatit të pjesshëm që UI + cron të
        // vazhdojnë ta njohin si "X ekzistuese / Y pa email", edhe kur PDF-ja
        // bllokohet me fail-closed për siguri.
        const reason = `${partialReason}. PDF s'u gjenerua dot nga email-i më i fundit (PNR ${pnr}): ${renderErr.message}`;
        if (booking.airlineTicketUrl) await clearSavedWizzTicket(bookingId, reason);
        return {
          found: false,
          reason,
          matchedCount,
          expectedCount,
          missingPassengers: missingNames,
          retryable: true,
        };
      }
    }

    fs.mkdirSync(ticketsUploadDir, { recursive: true });
    const urls: string[] = [];
    for (const r of rendered) {
      fs.writeFileSync(path.join(ticketsUploadDir, r.fileName), r.pdf);
      urls.push(`/api/uploads/tickets/${r.fileName}`);
    }
    const url = urls.join(",");

    // Fshi PDF-të e vjetra që s'janë më pjesë e rezultatit të email-it të fundit.
    const newNames = new Set(rendered.map(r => r.fileName));
    for (const oldUrl of (booking.airlineTicketUrl ?? "").split(",").map(x => x.trim()).filter(Boolean)) {
      const oldName = path.basename(oldUrl);
      if (newNames.has(oldName) || !/^[A-Za-z0-9._-]+\.pdf$/i.test(oldName)) continue;
      try { fs.unlinkSync(path.join(ticketsUploadDir, oldName)); } catch { /* best-effort */ }
    }

    await db.update(bookingsTable)
      .set({ airlineTicketUrl: url, updatedAt: sql`${bookingsTable.updatedAt}` })
      .where(eq(bookingsTable.id, bookingId));
    notifyDataChanged("bookings");

    const complete = missingNames.length === 0 && matchedCount === expectedCount;
    // Mos mbush Historikun me të njëjtin sukses në çdo rikontroll periodik.
    // Ndryshimet e rezultatit të pjesshëm regjistrohen nga ticket_search note.
    if ((booking.airlineTicketUrl ?? "") !== url) {
      await db.insert(bookingChangeLogsTable).values({
        bookingId,
        userId: null,
        userName: "Sistemi",
        userRole: null,
        action: "updated",
        fieldName: "Bileta Wizz",
        oldValue: booking.airlineTicketUrl,
        newValue: rendered.map(r => r.fileName).join(", "),
        note: complete
          ? (rendered.length > 1
            ? `${rendered.length} bileta (një për çdo PNR) u gjetën në email dhe u ruajtën si PDF`
            : "Konfirmimi i biletës u gjet në email dhe u ruajt si PDF")
          : `${partialReason}. PDF u ruajt vetëm për pasagjerët që ekzistojnë në email-in më të fundit`,
      }).catch(() => {});
    }

    logger.info({ bookingId, pnrs: pnrsToSave, urls, matchedCount, expectedCount }, "WizzTicket: email-i më i fundit u kontrollua");
    return {
      found: complete,
      url,
      urls,
      reason: complete ? undefined : partialReason,
      matchedCount,
      expectedCount,
      missingPassengers: missingNames,
    };
  } catch (err: any) {
    logger.error({ err, bookingId }, "WizzTicket: gabim i papritur");
    return { found: false, reason: `Gabim i papritur: ${err.message}`, retryable: true };
  } finally {
    inFlightBookings.delete(bookingId);
  }
}
