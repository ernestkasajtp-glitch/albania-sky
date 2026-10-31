// "Fluturimet me Ndryshime Orari" — when a flight's schedule (departure OR
// arrival) changes and the flight has active bookings, a pending row is
// recorded here. The admin reviews the list, sees every affected recipient
// (agency or direct customer) with ALL their bookings on that flight, picks
// who gets notified and sends the email from the page. The email body carries
// the full flight details old → new (no PDF attachment); when the departure
// shifted more than FREE_CHANGE_HOURS the email also announces the right to a
// free date change.
import {
  db, flightsTable, bookingsTable, passengersTable, agentsTable,
  bookingUsersTable, scheduleChangesTable,
  type ScheduleChangeSentEntry,
} from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendEmail, cpRefOf } from "./gmail.js";
import { fmtAmPm } from "./timeFormat.js";

export const FREE_CHANGE_HOURS = 3;

type Sched = {
  departureDate: string; departureTime: string;
  arrivalDate: string; arrivalTime: string;
};

function schedOf(f: any): Sched {
  return {
    departureDate: String(f.departureDate ?? ""),
    departureTime: String(f.departureTime ?? ""),
    arrivalDate: String(f.arrivalDate ?? ""),
    arrivalTime: String(f.arrivalTime ?? ""),
  };
}

function sameSched(a: Sched, b: Sched): boolean {
  return a.departureDate === b.departureDate && a.departureTime === b.departureTime
    && a.arrivalDate === b.arrivalDate && a.arrivalTime === b.arrivalTime;
}

// Hours between two wall-clock date+time pairs (Europe/Tirane convention —
// we only ever compare two local wall-clock values, so plain Date math is fine).
export function schedDeltaHours(oldDate: string, oldTime: string, newDate: string, newTime: string): number {
  try {
    const o = new Date(`${oldDate}T${(oldTime || "00:00").slice(0, 5)}:00`);
    const n = new Date(`${newDate}T${(newTime || "00:00").slice(0, 5)}:00`);
    if (isNaN(o.getTime()) || isNaN(n.getTime())) return 0;
    return Math.abs(n.getTime() - o.getTime()) / 3_600_000;
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Recording — called fire-and-forget from every flight schedule write path.
// ---------------------------------------------------------------------------
export async function recordScheduleChange(
  before: any, after: any, source: "manual" | "sync"
): Promise<void> {
  try {
    const oldS = schedOf(before);
    const newS = schedOf(after);
    if (sameSched(oldS, newS)) return;

    // Only flights that actually have active bookings belong in the list.
    const active = await db.select({ id: bookingsTable.id }).from(bookingsTable)
      .where(and(eq(bookingsTable.flightId, after.id), ne(bookingsTable.status, "cancelled")))
      .limit(1);
    if (active.length === 0) return;

    const [pending] = await db.select().from(scheduleChangesTable)
      .where(and(eq(scheduleChangesTable.flightId, after.id), eq(scheduleChangesTable.status, "pending")));

    if (pending) {
      const origOld: Sched = {
        departureDate: pending.oldDepartureDate, departureTime: pending.oldDepartureTime,
        arrivalDate: pending.oldArrivalDate, arrivalTime: pending.oldArrivalTime,
      };
      if (sameSched(origOld, newS)) {
        // Schedule reverted to what passengers were originally sold — nothing to notify.
        await db.delete(scheduleChangesTable).where(eq(scheduleChangesTable.id, pending.id));
        return;
      }
      // Keep the ORIGINAL old side; only move the new side forward.
      await db.update(scheduleChangesTable).set({
        newDepartureDate: newS.departureDate, newDepartureTime: newS.departureTime,
        newArrivalDate: newS.arrivalDate, newArrivalTime: newS.arrivalTime,
        source, updatedAt: new Date(),
      }).where(eq(scheduleChangesTable.id, pending.id));
      return;
    }

    await db.insert(scheduleChangesTable).values({
      flightId: after.id,
      oldDepartureDate: oldS.departureDate, oldDepartureTime: oldS.departureTime,
      oldArrivalDate: oldS.arrivalDate, oldArrivalTime: oldS.arrivalTime,
      newDepartureDate: newS.departureDate, newDepartureTime: newS.departureTime,
      newArrivalDate: newS.arrivalDate, newArrivalTime: newS.arrivalTime,
      source,
    });
  } catch (err) {
    logger.error({ err }, "[schedule-change] failed to record schedule change");
  }
}

// ---------------------------------------------------------------------------
// Recipients — one entry per e-mail address, carrying ALL that recipient's
// bookings on the flight. Bookings with no reachable e-mail are grouped under
// email=null so the admin can see them (and chase them by phone).
// ---------------------------------------------------------------------------
export type ScheduleChangeRecipient = {
  email: string | null;
  agencyName: string | null; // null → direct customer
  bookings: Array<{
    id: number;
    bookingRef: string;
    customerName: string;
    cpRef: string | null;
    passengers: string[];
  }>;
};

export async function getScheduleChangeRecipients(flightId: number): Promise<ScheduleChangeRecipient[]> {
  const bookings = await db.select().from(bookingsTable)
    .where(and(eq(bookingsTable.flightId, flightId), ne(bookingsTable.status, "cancelled")));
  if (bookings.length === 0) return [];

  const bookingIds = bookings.map(b => b.id);
  const paxes = bookingIds.length
    ? await db.select().from(passengersTable)
        .where(and(inArray(passengersTable.bookingId, bookingIds), eq(passengersTable.cancelled, false)))
    : [];
  const paxByBooking = new Map<number, string[]>();
  for (const p of paxes) {
    const list = paxByBooking.get(p.bookingId) ?? [];
    list.push([p.firstName, p.lastName].filter(Boolean).join(" ").trim());
    paxByBooking.set(p.bookingId, list);
  }

  const agentIds = [...new Set(bookings.map(b => b.agentId).filter((v): v is number => v != null))];
  const agents = agentIds.length
    ? await db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds))
    : [];
  const agentById = new Map(agents.map(a => [a.id, a]));

  const buIds = [...new Set(bookings.filter(b => b.bookingUserId != null).map(b => b.bookingUserId as number))];
  const bus = buIds.length
    ? await db.select().from(bookingUsersTable).where(inArray(bookingUsersTable.id, buIds))
    : [];
  const buById = new Map(bus.map(u => [u.id, u]));

  const groups = new Map<string, ScheduleChangeRecipient>();

  for (const b of bookings) {
    let email: string | null = null;
    let agencyName: string | null = null;
    if (b.agentId != null) {
      const ag = agentById.get(b.agentId);
      agencyName = ag?.name ?? null;
      // Respect the agent's master email toggle — same convention as status emails.
      if (ag?.email && ag.notifyByEmail !== false) email = ag.email.trim().toLowerCase();
    }
    // Fallback chain: customerEmail, then booking-user email — also for agent
    // bookings whose agency has no usable email (missing or notifications off).
    if (!email) {
      const cust = (b.customerEmail ?? "").trim().toLowerCase();
      if (cust) email = cust;
      else if (b.bookingUserId != null) {
        const bu = buById.get(b.bookingUserId);
        if (bu?.email) email = bu.email.trim().toLowerCase();
      }
    }
    const fullBooking = { ...b, agentName: agencyName };
    // One email per mailbox: group strictly by email when we have one; bookings
    // without any reachable email are bucketed per agency for display.
    const k = email ?? `no-email|${agencyName ?? "-"}`;
    const g = groups.get(k) ?? { email, agencyName, bookings: [] };
    if (g.agencyName == null && agencyName != null) g.agencyName = agencyName;
    g.bookings.push({
      id: b.id,
      bookingRef: b.bookingRef,
      customerName: b.customerName,
      cpRef: cpRefOf(fullBooking),
      passengers: paxByBooking.get(b.id) ?? [],
    });
    groups.set(k, g);
  }

  // Recipients with an email first, then the "no email" bucket.
  return [...groups.values()].sort((a, b) => Number(a.email == null) - Number(b.email == null));
}

// ---------------------------------------------------------------------------
// Email body (Albanian, no PDF)
// ---------------------------------------------------------------------------
function fmtDateSq(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "-";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function schedRow(label: string, oldVal: string, newVal: string): string {
  const changed = oldVal !== newVal;
  return `<tr>
    <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;white-space:nowrap">${label}</td>
    <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;${changed ? "color:#991b1b;text-decoration:line-through" : "color:#334155"}">${oldVal || "-"}</td>
    <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;font-weight:${changed ? "700" : "400"};${changed ? "color:#166534;background:#f0fdf4" : "color:#334155"}">${newVal || "-"}</td>
  </tr>`;
}

export function scheduleChangeEmailHtml(opts: {
  flight: any;
  change: {
    oldDepartureDate: string; oldDepartureTime: string; oldArrivalDate: string; oldArrivalTime: string;
    newDepartureDate: string; newDepartureTime: string; newArrivalDate: string; newArrivalTime: string;
  };
  recipient: ScheduleChangeRecipient;
}): string {
  const { flight: f, change: c, recipient } = opts;
  const depDelta = schedDeltaHours(c.oldDepartureDate, c.oldDepartureTime, c.newDepartureDate, c.newDepartureTime);
  const freeChange = depDelta > FREE_CHANGE_HOURS;

  const bookingBlocks = recipient.bookings.map(b => `
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:8px 0;background:#f8fafc">
      <div style="font-size:13px;font-weight:700;color:#0f172a">
        Booking ${b.cpRef ?? b.bookingRef}
        ${b.cpRef ? "" : `<span style="font-weight:400;color:#64748b"> — ${b.customerName}</span>`}
      </div>
      ${b.passengers.length ? `<div style="font-size:12px;color:#475569;margin-top:4px">Passengers: ${b.passengers.join(", ")}</div>` : ""}
    </div>`).join("");

  const freeChangeBlock = freeChange ? `
    <div style="border:2px solid #f59e0b;background:#fffbeb;border-radius:10px;padding:14px 16px;margin:18px 0">
      <div style="font-weight:700;color:#92400e;font-size:14px;margin-bottom:4px">Free date change</div>
      <div style="color:#78350f;font-size:13px;line-height:1.5">
        Because the departure time has changed by more than ${FREE_CHANGE_HOURS} hours
        (${depDelta.toFixed(1).replace(/\.0$/, "")} hours), you are entitled to change your travel date
        <b>free of charge</b>. Please contact us as soon as possible to choose a new date.
      </div>
    </div>` : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <div style="background:#0f172a;color:#fff;border-radius:10px 10px 0 0;padding:18px 22px">
      <div style="font-size:17px;font-weight:700">FLIGHT SCHEDULE CHANGE NOTICE</div>
      <div style="color:#cbd5e1;font-size:13px;margin-top:3px">
        Flight ${f.flightNumber} — ${f.fromCity} → ${f.toCity}
      </div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px 22px">
      <p style="font-size:13px;color:#334155;line-height:1.6;margin:0 0 14px">
        Please be advised that the schedule of the flight on which you hold booked
        tickets has changed. The old and the new schedule are shown below:
      </p>
      <table style="border-collapse:collapse;width:100%">
        <tr>
          <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#f1f5f9;font-size:12px;color:#64748b;text-align:left"></th>
          <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#f1f5f9;font-size:12px;color:#64748b;text-align:left">Old schedule</th>
          <th style="padding:8px 12px;border:1px solid #e2e8f0;background:#f1f5f9;font-size:12px;color:#64748b;text-align:left">New schedule</th>
        </tr>
        ${schedRow("Departure date", fmtDateSq(c.oldDepartureDate), fmtDateSq(c.newDepartureDate))}
        ${schedRow("Departure time", fmtAmPm(c.oldDepartureTime), fmtAmPm(c.newDepartureTime))}
        ${schedRow("Arrival date", fmtDateSq(c.oldArrivalDate), fmtDateSq(c.newArrivalDate))}
        ${schedRow("Arrival time", fmtAmPm(c.oldArrivalTime), fmtAmPm(c.newArrivalTime))}
      </table>
      <table style="border-collapse:collapse;width:100%;margin-top:14px">
        <tr>
          <td style="padding:6px 12px;font-size:13px;color:#64748b">Flight</td>
          <td style="padding:6px 12px;font-size:13px;font-weight:600">${f.airline ?? ""} ${f.flightNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-size:13px;color:#64748b">Route</td>
          <td style="padding:6px 12px;font-size:13px;font-weight:600">${f.fromCity} → ${f.toCity}</td>
        </tr>
      </table>
      ${freeChangeBlock}
      <div style="margin-top:16px">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px">
          Your affected bookings (${recipient.bookings.length})
        </div>
        ${bookingBlocks}
      </div>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:18px 0 0">
        This is an automatic schedule-change notification. For any question or to
        change your travel date, please contact us at
        <a href="mailto:booking@albaniasky.com" style="color:#2563eb">booking@albaniasky.com</a>.
      </p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Sending — one email per selected recipient + one summary copy to the system
// booking mailbox (same address that receives confirmation/status emails).
// ---------------------------------------------------------------------------
export async function sendScheduleChangeEmails(changeId: number, selectedEmails: string[]): Promise<{
  sent: number; recipients: string[];
}> {
  const [change] = await db.select().from(scheduleChangesTable).where(eq(scheduleChangesTable.id, changeId));
  if (!change) throw new Error("Ndryshimi i orarit nuk u gjet");
  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, change.flightId));
  if (!flight) throw new Error("Fluturimi nuk u gjet");

  const wanted = new Set(selectedEmails.map(e => e.trim().toLowerCase()).filter(Boolean));
  const groups = (await getScheduleChangeRecipients(change.flightId))
    .filter(g => g.email && wanted.has(g.email));
  if (groups.length === 0) return { sent: 0, recipients: [] };

  const depRaw = String(change.newDepartureDate ?? "");
  const depDate = /^\d{4}-\d{2}-\d{2}$/.test(depRaw) ? depRaw.split("-").reverse().join(".") : depRaw;
  const subjectBase = `SCHEDULE CHANGE: ${flight.flightNumber} ${flight.fromCity}→${flight.toCity} ${depDate}`;

  // NJË EMAIL PËR ÇDO REZERVIM — jo të gjitha rezervimet në një email të vetëm.
  // Çdo rezervim i marrësit merr email-in e vet me referencën e tij në subjekt.
  const sentEntries: ScheduleChangeSentEntry[] = [];
  let firstHtml: string | null = null;
  for (const g of groups) {
    for (const b of g.bookings) {
      const single: ScheduleChangeRecipient = { email: g.email, agencyName: g.agencyName, bookings: [b] };
      const html = scheduleChangeEmailHtml({ flight, change, recipient: single });
      if (!firstHtml) firstHtml = html;
      const ref = b.cpRef ?? b.bookingRef;
      await sendEmail(g.email!, `${subjectBase} — Booking ${ref}`, html);
      sentEntries.push({
        email: g.email!,
        sentAt: new Date().toISOString(),
        bookingRefs: [ref],
      });
    }
  }

  // System copy — summary of who was notified.
  try {
    const adminCopy = (process.env.STATUS_EMAIL_ADMIN || "booking@albaniasky.com").trim().toLowerCase();
    if (adminCopy) {
      const lines = sentEntries.map(e =>
        `<li style="margin:4px 0;font-size:13px"><b>${e.email}</b> — ${e.bookingRefs.join(", ")}</li>`).join("");
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <p style="font-size:13px;color:#334155">U dërguan ${sentEntries.length} njoftime për ndryshimin e orarit
          të fluturimit <b>${flight.flightNumber} ${flight.fromCity}→${flight.toCity}</b> (një email për çdo rezervim):</p>
          <ul style="padding-left:18px;color:#0f172a">${lines}</ul>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:16px 0">
          <p style="font-size:12px;color:#64748b">Kopja e email-it që morën marrësit:</p>
          ${firstHtml ?? ""}
        </div>`;
      await sendEmail(adminCopy, `${subjectBase} — ${sentEntries.length} njoftime u dërguan`, html);
    }
  } catch (err) {
    logger.error({ err }, "[schedule-change] admin copy email failed");
  }

  const mergedLog = [...(change.sentLog ?? []), ...sentEntries];
  await db.update(scheduleChangesTable)
    .set({ status: "sent", sentLog: mergedLog, updatedAt: new Date() })
    .where(eq(scheduleChangesTable.id, changeId));

  return { sent: sentEntries.length, recipients: sentEntries.map(e => e.email) };
}
