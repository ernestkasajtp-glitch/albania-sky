import { db, flightsTable, bookingsTable, passengersTable, tasksTable, taskNotificationsTable, bookingUsersTable } from "@workspace/db";
import { and, eq, ne, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Kontroll automatik: pasagjer i dyfishtë në të njëjtin fluturim ─────────
//
// Kur krijohet një rezervim (ose shtohet një pasagjer), kontrollojmë nëse i
// njëjti pasagjer (emër + mbiemër) gjendet edhe në një rezervim tjetër aktiv
// për një fluturim IDENTIK. Rregulli i përputhjes së fluturimit:
//   data e nisjes + destinacioni + numri i fluturimit — të tre identikë
// (mund të jetë i njëjti fluturim ose një rresht tjetër fluturimi me të
// njëjtat vlera). Rezervimet dhe pasagjerët e anuluar nuk merren parasysh.
//
// Për çdo pasagjer të dyfishtë krijohet një task automatik (i deduplikuar me
// autoRuleKey per-pasagjer) që tregon kodin/kodet e rezervimeve të tjera ku
// gjendet i njëjti pasagjer, me njoftim in-app për admin + manager.

const normName = (s: string | null | undefined): string =>
  String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export async function checkDuplicatePassengerTask(bookingId: number): Promise<void> {
  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking || booking.status === "cancelled") return;
    const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
    if (!flight) return;

    const paxes = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.bookingId, bookingId), eq(passengersTable.cancelled, false)));
    if (paxes.length === 0) return;

    // Fluturime identike: datë + destinacion + numër fluturimi.
    const matchingFlights = await db.select({ id: flightsTable.id }).from(flightsTable)
      .where(and(
        eq(flightsTable.departureDate, flight.departureDate),
        eq(flightsTable.toCity, flight.toCity),
        eq(flightsTable.flightNumber, flight.flightNumber),
      ));
    const flightIds = matchingFlights.map(f => f.id);
    if (flightIds.length === 0) return;

    // Pasagjerët e rezervimeve TË TJERA aktive në këto fluturime.
    const others = await db.select({
      firstName: passengersTable.firstName,
      lastName: passengersTable.lastName,
      bookingRef: bookingsTable.bookingRef,
      bookingStatus: bookingsTable.status,
      customerName: bookingsTable.customerName,
    }).from(passengersTable)
      .innerJoin(bookingsTable, eq(passengersTable.bookingId, bookingsTable.id))
      .where(and(
        inArray(bookingsTable.flightId, flightIds),
        ne(bookingsTable.id, bookingId),
        ne(bookingsTable.status, "cancelled"),
        eq(passengersTable.cancelled, false),
      ));
    if (others.length === 0) return;

    // Gjej dublikatat për çdo pasagjer të rezervimit të ri.
    type Dup = { pax: typeof paxes[number]; refs: Array<{ ref: string; status: string; customer: string | null }> };
    const dups: Dup[] = [];
    for (const pax of paxes) {
      const key = normName(pax.firstName) + "|" + normName(pax.lastName);
      if (key === "|") continue;
      const seen = new Map<string, { ref: string; status: string; customer: string | null }>();
      for (const o of others) {
        if (normName(o.firstName) + "|" + normName(o.lastName) === key && o.bookingRef) {
          seen.set(o.bookingRef, { ref: o.bookingRef, status: o.bookingStatus, customer: o.customerName ?? null });
        }
      }
      if (seen.size > 0) dups.push({ pax, refs: Array.from(seen.values()) });
    }
    if (dups.length === 0) return;

    // Marrës të task-ut: manager (fallback admin), të dy si watchers — si te sold-out.
    const staff = await db.select().from(bookingUsersTable)
      .where(inArray(bookingUsersTable.role, ["admin", "manager"]));
    const adminId = staff.find(u => u.role === "admin")?.id ?? null;
    const managerId = staff.find(u => u.role === "manager")?.id ?? null;
    const creatorId = adminId ?? managerId;
    if (creatorId == null) return;
    const assigneeId = managerId ?? adminId!;
    const watchers = Array.from(new Set([adminId, managerId].filter((x): x is number => x != null)));

    const statusLabel = (s: string): string =>
      s === "draft" ? "Draft" : s === "pending" ? "Në pritje" : s === "confirmed" ? "Konfirmuar"
      : s === "ticketed" ? "Ticketed" : s;
    const flightLabel = `${flight.flightNumber} ${flight.fromCity}→${flight.toCity} më ${flight.departureDate}`;

    for (const d of dups) {
      const ruleKey = `dup_pax:${d.pax.id}`;
      const existing = await db.select({ id: tasksTable.id }).from(tasksTable)
        .where(eq(tasksTable.autoRuleKey, ruleKey)).limit(1);
      if (existing.length > 0) continue;

      const paxName = `${d.pax.firstName} ${d.pax.lastName}`.trim();
      const refList = d.refs
        .map(r => `• ${r.ref} (${statusLabel(r.status)}${r.customer ? ` — ${r.customer}` : ""})`)
        .join("\n");
      const title = `Pasagjer i dyfishtë: ${paxName} (${flight.flightNumber} ${flight.departureDate})`;
      const description =
        `Pasagjeri ${paxName} te rezervimi ${booking.bookingRef} gjendet edhe në ${d.refs.length === 1 ? "një rezervim tjetër ekzistues" : `${d.refs.length} rezervime të tjera ekzistuese`} për të njëjtin fluturim (${flightLabel}):\n\n` +
        `${refList}\n\n` +
        `Rregulli i përputhjes: data + destinacioni + numri i fluturimit identikë. Kontrolloni nëse është dublikatë e paqëllimshme.`;

      const [task] = await db.insert(tasksTable).values({
        title,
        description,
        status: "todo",
        priority: "high",
        assigneeId,
        creatorId,
        entityType: "booking",
        entityId: bookingId,
        labels: ["Pasagjer Dublikatë"],
        watchers,
        autoGenerated: true,
        autoRuleKey: ruleKey,
      }).returning();

      if (task && watchers.length > 0) {
        await db.insert(taskNotificationsTable).values(
          watchers.map(uid => ({
            userId: uid,
            taskId: task.id,
            type: "dup_pax",
            title: `Pasagjer i dyfishtë: ${paxName}`,
            body: `${booking.bookingRef} + ${d.refs.map(r => r.ref).join(", ")} — ${flightLabel}`,
          })),
        );
      }
    }
  } catch (err) {
    logger.error({ err, bookingId }, "[dup-pax] duplicate passenger check failed");
  }
}
