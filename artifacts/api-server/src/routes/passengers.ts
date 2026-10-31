import { Router, type IRouter } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db, passengersTable, bookingChangeLogsTable, bookingsTable, flightsTable, paymentsTable, agentsTable, agentCreditTransactionsTable, bookingExtrasTable, paymentChangeLogsTable } from "@workspace/db";
import { normalizePassengerNames } from "../lib/nameFormat";
import {
  ListPassengersQueryParams,
  CreatePassengerBody,
  GetPassengerParams,
  UpdatePassengerParams,
  UpdatePassengerBody,
  DeletePassengerParams,
} from "@workspace/api-zod";
import { sendEmail, passengerChangedEmail } from "../lib/gmail.js";
import { getFullBooking } from "../lib/getFullBooking.js";
import { flipSoldOutIfFull } from "../lib/autoSoldOut.js";
import { recordSeatEvent } from "../lib/seatHistory.js";
import { triggerCpExportSoon } from "../lib/cpExport.js";
import { checkDuplicatePassengerTask } from "../lib/dupPassengerCheck.js";
import { revertTicketedToConfirmed } from "../lib/ticketedRevert.js";
import { roundWholeEuro, formatWholeEuro } from "../lib/money.js";
import type { TicketedBookingChange } from "../lib/ticketUpdateEmail.js";

async function logBookingChange(opts: {
  bookingId: number;
  userId?: number | null;
  userName?: string;
  userRole?: string | null;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}) {
  await db.insert(bookingChangeLogsTable).values({
    bookingId: opts.bookingId,
    userId: opts.userId ?? null,
    userName: opts.userName ?? "System",
    userRole: opts.userRole ?? null,
    action: opts.action,
    fieldName: opts.fieldName ?? null,
    oldValue: opts.oldValue ?? null,
    newValue: opts.newValue ?? null,
    note: opts.note ?? null,
  });
}

const PASSENGER_FIELD_LABELS: Record<string, string> = {
  firstName:           "Emri",
  lastName:            "Mbiemri",
  gender:              "Gjinia",
  dateOfBirth:         "Datëlindja",
  nationality:         "Kombësia",
  passportNumber:      "Nr. Pasaporte",
  passportExpiry:      "Skadimi Pasaporte",
  seatNumber:          "Vendi i Uljes",
  baggageOption:       "Bagazhi",
  hasSeatSelection:    "Zgjedhja e Vendit",
  hasPriorityBoarding: "Prioritet Boarding",
  hasInsurance:        "Sigurim",
  type:                "Tipi i Pasagjerit",
  ticketPrice:         "Çmimi i Biletës",
};

const router: IRouter = Router();

function formatPassenger(p: typeof passengersTable.$inferSelect) {
  return {
    ...p,
    extraCost: Number(p.extraCost),
    ticketPrice: p.ticketPrice != null ? Number(p.ticketPrice) : null,
    cancelled: (p as any).cancelled ?? false,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Rillogarit total-in e rezervimit duke PËRJASHTUAR pasagjerët e anuluar (cancelled=true).
 * Markup-i + ulja e agjentit janë TASHMË të palosura në ticketPrice të çdo pasagjeri në
 * krijim, ndaj NUK ri-zbatohen këtu (çmimi i shtypur mbetet final). Total = Σ ticketPrice
 * aktive + ekstra + taksa − ulja manuale e rezervimit.
 */
// Serializim për-rezervim: dy rillogaritje të njëkohshme (p.sh. ndryshohen 2
// pasagjerë shpejt njëri pas tjetrit) lexonin të dyja pagesat PARA se njëra të
// fuste rimbursimin → kredi e dyfishtë (-€232 ×2 te KTF3306, 30.07). Çdo thirrje
// pret të mbarojë e mëparshmja për të njëjtin rezervim.
const recalcChains = new Map<number, Promise<void>>();
type AfterCommitEffect = () => void;

function recalcBookingTotalExcludingCancelled(
  bookingId: number,
  client: any = db,
  afterCommit: AfterCommitEffect[] = [],
): Promise<void> {
  // Transactions which hold the booking FOR UPDATE lock are already serialized
  // by Postgres. Do not put them behind the in-process chain: a later transaction
  // may hold the row lock while waiting for an earlier chained transaction.
  if (client !== db) return doRecalcBookingTotal(bookingId, client, afterCommit);
  const prev = recalcChains.get(bookingId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    await doRecalcBookingTotal(bookingId, client, afterCommit);
    afterCommit.forEach(effect => effect());
  });
  recalcChains.set(bookingId, next);
  next.finally(() => { if (recalcChains.get(bookingId) === next) recalcChains.delete(bookingId); });
  return next;
}

async function doRecalcBookingTotal(
  bookingId: number,
  client: any,
  afterCommit: AfterCommitEffect[],
): Promise<void> {
  const [booking] = await client.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) return;
  const [flight] = await client.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
  if (!flight) return;
  const allPax = await client.select().from(passengersTable).where(eq(passengersTable.bookingId, bookingId)) as Array<typeof passengersTable.$inferSelect>;
  const activePax = allPax.filter((p: typeof passengersTable.$inferSelect) => !(p as any).cancelled);
  let ticketTotal = 0;
  let extraCostTotal = 0;
  for (const px of activePax) {
    const def = px.type === "child" ? flight.childPrice : px.type === "infant" ? flight.infantPrice : flight.adultPrice;
    ticketTotal += px.ticketPrice != null ? Number(px.ticketPrice) : Number(def ?? 0);
    extraCostTotal += Number(px.extraCost ?? 0);
  }
  const tax = Number(flight.tax ?? 0);
  const manualDiscount = Number((booking as any).discount ?? 0);
  // Shtojcat e rezervimit (booking_extras) duhen përfshirë GJITHMONË — pa këtë,
  // çdo ruajtje pasagjeri e fshinte shtojcën nga totali (bug KTF5007, 03.08.2026).
  const bookingExtras = await client.select().from(bookingExtrasTable).where(eq(bookingExtrasTable.bookingId, bookingId)) as Array<typeof bookingExtrasTable.$inferSelect>;
  const bookingExtrasTotal = bookingExtras.reduce((s: number, e: typeof bookingExtrasTable.$inferSelect) => s + Number((e as any).amount ?? 0), 0);
  const newTotal = roundWholeEuro(ticketTotal - manualDiscount + tax + extraCostTotal + bookingExtrasTotal);
  if (newTotal !== Number(booking.totalAmount)) {
    await client.update(bookingsTable).set({ totalAmount: String(newTotal) }).where(eq(bookingsTable.id, bookingId));
  }

  // --- Tepricë → kredi automatike në kuletën e agjentit ---
  // Nëse pas rillogaritjes totali është më i vogël se sa ka paguar agjenti
  // (netto, pa rimbursimet), diferenca i kthehet automatikisht agjentit si
  // kredi në kuletë — njësoj si logjika e uljes së çmimit te PATCH /bookings/:id.
  if (booking.agentId && booking.status !== "cancelled") {
    const payments = await client.select().from(paymentsTable).where(eq(paymentsTable.bookingId, bookingId)) as Array<typeof paymentsTable.$inferSelect>;
    const netPaid = payments
      .filter((p: typeof paymentsTable.$inferSelect) => p.status === "completed")
      .reduce((s: number, p: typeof paymentsTable.$inferSelect) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);

    if (netPaid > newTotal) {
      const refundAmt = Math.round((netPaid - newTotal) * 100) / 100;
      const refundNote = `Ulje çmimi (rillogaritje pasagjerësh): total i ri €${Math.round(newTotal)} (paguar €${Math.round(netPaid)})`;

      // 1. Pagesë rimbursimi te historia e pagesave të rezervimit
      const [recalcRefund] = await client.insert(paymentsTable).values({
        bookingId,
        amount: String(refundAmt),
        method: "credit",
        reference: null,
        notes: refundNote,
        status: "completed",
        isRefund: true,
      }).returning();
      if (recalcRefund) {
        afterCommit.push(() => {
          void db.insert(paymentChangeLogsTable).values({
            paymentId: recalcRefund.id,
            userName: "System",
            action: "created",
            newValue: `Rimbursim automatik €${Math.round(refundAmt)} (rillogaritje pasagjerësh)`,
            note: refundNote,
          }).catch(() => {});
        });
      }

      // 2. Kredito kuletën e agjentit + regjistro transaksionin
      const [agent] = await client.select().from(agentsTable).where(eq(agentsTable.id, booking.agentId));
      if (agent) {
        // Rritje ATOMIKE në SQL (jo lexo-pastaj-shkruaj) — shmang garat.
        await client.update(agentsTable)
          .set({ walletBalance: sql`${agentsTable.walletBalance} + ${refundAmt}` })
          .where(eq(agentsTable.id, booking.agentId));

        await client.insert(agentCreditTransactionsTable).values({
          agentId: booking.agentId,
          type: "refund",
          amount: String(refundAmt),
          bookingId,
          bookingRef: booking.bookingRef,
          reference: null,
          notes: refundNote,
        });
      }
    }
  }
}

class PassengerMutationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const CANCELLED_MUTATION_ERROR = "Rezervimi është i anuluar. Pasagjerët dhe vlerat e shitjes nuk mund të ndryshohen.";

async function lockBooking(client: any, bookingId: number) {
  const result: any = await client.execute(sql`
    SELECT id, status, flight_id AS "flightId"
    FROM bookings WHERE id = ${bookingId} FOR UPDATE
  `);
  return (result.rows ?? result)?.[0] as typeof bookingsTable.$inferSelect | undefined;
}

router.get("/passengers", async (req, res): Promise<void> => {
  const parsed = ListPassengersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Filtra + faqosje NË SERVER (raw query params, jashtë skemës së gjeneruar) —
  // faqja "Pasagjerët" mos t'i ngarkojë të 4 mijë rreshtat njëherësh.
  const q = req.query as Record<string, any>;
  const searchRaw = typeof q.search === "string" ? q.search.trim() : "";
  const typeRaw = typeof q.type === "string" && ["adult", "child", "infant"].includes(q.type) ? q.type : "";
  const natRaw = typeof q.nationality === "string" ? q.nationality.trim() : "";
  const limitNum = Number.parseInt(String(q.limit ?? ""), 10);
  const offsetNum = Number.parseInt(String(q.offset ?? ""), 10);
  const hasLimit = Number.isInteger(limitNum) && limitNum > 0;

  const conds: any[] = [];
  if (parsed.data.bookingId) conds.push(eq(passengersTable.bookingId, parsed.data.bookingId));
  if (typeRaw) conds.push(eq(passengersTable.type, typeRaw));
  if (natRaw) conds.push(ilike(passengersTable.nationality, `%${natRaw}%`));
  if (searchRaw) {
    const like = `%${searchRaw}%`;
    conds.push(or(
      ilike(sql`(${passengersTable.firstName} || ' ' || ${passengersTable.lastName})`, like),
      ilike(passengersTable.passportNumber, like),
      ilike(passengersTable.nationality, like),
      sql`EXISTS (SELECT 1 FROM bookings b WHERE b.id = ${passengersTable.bookingId} AND b.booking_ref ILIKE ${like})`,
    ));
  }

  let query = db.select().from(passengersTable).$dynamic();
  if (conds.length === 1) query = query.where(conds[0]);
  else if (conds.length > 1) query = query.where(sql.join(conds.map(c => sql`(${c})`), sql` AND `));

  query = query.orderBy(passengersTable.createdAt);
  if (hasLimit) {
    query = query.limit(Math.min(limitNum, 500));
    if (Number.isInteger(offsetNum) && offsetNum > 0) query = query.offset(offsetNum);
  }

  const passengers = await query;

  // Totali (me të njëjtat filtra) — kthehet në header që faqosja të dijë sa faqe ka.
  if (hasLimit) {
    let countQ = db.select({ n: sql<number>`count(*)::int` }).from(passengersTable).$dynamic();
    if (conds.length === 1) countQ = countQ.where(conds[0]);
    else if (conds.length > 1) countQ = countQ.where(sql.join(conds.map(c => sql`(${c})`), sql` AND `));
    const [{ n }] = await countQ;
    res.setHeader("X-Total-Count", String(n));
  }

  res.json(passengers.map(formatPassenger));
});

router.post("/passengers", async (req, res): Promise<void> => {
  const parsed = CreatePassengerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.bookingId) {
    res.status(400).json({ error: "bookingId is required" });
    return;
  }
  const bookingId = parsed.data.bookingId;
  // Foshnjat nuk zënë vend; vetëm jo-foshnjat ndikojnë te numri i vendeve të shitura.
  const isNonInfant = (parsed.data.type ?? "adult") !== "infant";
  let passenger: typeof passengersTable.$inferSelect;
  let flightIdForSeats: number | null = null;
  const afterCommit: AfterCommitEffect[] = [];
  try {
    passenger = await db.transaction(async tx => {
      const booking = await lockBooking(tx, bookingId);
      if (!booking) throw new PassengerMutationError(404, "Booking not found");
      if (booking.status === "cancelled") throw new PassengerMutationError(409, CANCELLED_MUTATION_ERROR);

      if (isNonInfant) {
        const [flight] = await tx.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
        if (flight && flight.totalSeats - flight.soldSeats < 1) {
          throw new PassengerMutationError(400, "Fluturimi është plot — s'mund të shtohet pasagjeri.");
        }
        if (flight) {
          await tx.update(flightsTable)
            .set({ soldSeats: sql`${flightsTable.soldSeats} + 1` })
            .where(eq(flightsTable.id, flight.id));
          flightIdForSeats = flight.id;
        }
      }

       const [created] = await tx.insert(passengersTable).values({
         ...normalizePassengerNames(parsed.data),
         ticketPrice: parsed.data.ticketPrice == null ? null : String(roundWholeEuro(Number(parsed.data.ticketPrice))),
         extraCost: String(roundWholeEuro(Number((req.body as any).extraCost ?? 0))),
        bookingId,
      } as any).returning();
      await recalcBookingTotalExcludingCancelled(bookingId, tx, afterCommit);
      return created;
    });
  } catch (error) {
    if (error instanceof PassengerMutationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }

  afterCommit.forEach(effect => effect());
  if (flightIdForSeats != null) {
    await flipSoldOutIfFull(flightIdForSeats);
    triggerCpExportSoon();
    void recordSeatEvent({ flightId: flightIdForSeats, type: "sold", seats: 1, req, note: `Shtim pasagjeri: ${passenger.firstName} ${passenger.lastName}` });
  }

  res.status(201).json(formatPassenger(passenger));

  // Kontroll automatik: pasagjer i dyfishtë në fluturim identik → task automatik.
  void checkDuplicatePassengerTask(bookingId);

  // Rezervim i BILETUAR + pasagjer i ri ⇒ kthehet në KONFIRMUAR (bileta rilëshohet).
  void revertTicketedToConfirmed(bookingId, req, `Pasagjer i ri (${parsed.data.firstName} ${parsed.data.lastName}) u shtua pas lëshimit`);

  logBookingChange({
    bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "passenger_added",
    note: `Pasagjer shtuar: ${parsed.data.firstName} ${parsed.data.lastName} (${parsed.data.type ?? "adult"})`,
  }).catch(() => {});
});

router.get("/passengers/:id", async (req, res): Promise<void> => {
  const params = GetPassengerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [passenger] = await db.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
  if (!passenger) {
    res.status(404).json({ error: "Passenger not found" });
    return;
  }

  res.json(formatPassenger(passenger));
});

router.patch("/passengers/:id", async (req, res): Promise<void> => {
  const params = UpdatePassengerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePassengerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Fetch once to locate the booking. Financial changes re-fetch after locking it.
  const [initialPassenger] = await db.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
  if (!initialPassenger) {
    res.status(404).json({ error: "Passenger not found" });
    return;
  }

  const priceAffectingFields = [
    "ticketPrice", "type", "baggageOption",
    "hasSeatSelection", "hasPriorityBoarding", "hasInsurance",
  ] as const;
  const extraFields = ["baggageOption", "hasSeatSelection", "hasPriorityBoarding", "hasInsurance"] as const;
  const hasPriceField = priceAffectingFields.some(field => field in parsed.data);
  let oldPassenger = initialPassenger;
  let passenger: typeof passengersTable.$inferSelect | undefined;
  const afterCommit: AfterCommitEffect[] = [];

  try {
    passenger = await db.transaction(async tx => {
      let booking: typeof bookingsTable.$inferSelect | undefined;
      if (hasPriceField) {
        booking = await lockBooking(tx, initialPassenger.bookingId);
        if (!booking) throw new PassengerMutationError(404, "Booking not found");
      }
      const [currentPassenger] = await tx.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
      if (!currentPassenger) throw new PassengerMutationError(404, "Passenger not found");
      oldPassenger = currentPassenger;

      const changesPriceField = priceAffectingFields.some(field => {
        if (!(field in parsed.data)) return false;
        const oldValue = (currentPassenger as any)[field];
        const newValue = (parsed.data as any)[field];
        if (field === "ticketPrice") {
          const oldPrice = oldValue == null || oldValue === "" ? null : Number(oldValue);
          const newPrice = newValue == null || newValue === "" ? null : Number(newValue);
          return oldPrice !== newPrice;
        }
        return oldValue !== newValue;
      });
      if (changesPriceField && booking?.status === "cancelled") {
        throw new PassengerMutationError(409, "Rezervimi është i anuluar. Çmimi, tipi dhe shtesat e pasagjerit nuk mund të ndryshohen.");
      }

      const updateData: Record<string, any> = { ...normalizePassengerNames(parsed.data) };
      if ("ticketPrice" in updateData) {
         updateData.ticketPrice = updateData.ticketPrice == null ? null : String(roundWholeEuro(Number(updateData.ticketPrice)));
      }
      if (extraFields.some(f => f in parsed.data)) {
        if (!booking) {
          [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, currentPassenger.bookingId));
        }
        const [flight] = booking
          ? await tx.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId))
          : [null];
        if (flight) {
          const merged = { ...currentPassenger, ...parsed.data };
          let newExtraCost = 0;
          if (merged.baggageOption === "checked" && flight.checkedBaggagePrice) newExtraCost += Number(flight.checkedBaggagePrice);
          if (merged.hasSeatSelection && flight.seatSelectionPrice) newExtraCost += Number(flight.seatSelectionPrice);
          if (merged.hasPriorityBoarding && flight.priorityBoardingPrice) newExtraCost += Number(flight.priorityBoardingPrice);
          if (merged.hasInsurance && flight.insurancePrice) newExtraCost += Number(flight.insurancePrice);
          updateData.extraCost = String(newExtraCost);
        }
      }

      const [updated] = await tx.update(passengersTable)
        .set(updateData)
        .where(eq(passengersTable.id, params.data.id))
        .returning();
      if (!updated) throw new PassengerMutationError(404, "Passenger not found");

      if (changesPriceField) {
        await recalcBookingTotalExcludingCancelled(updated.bookingId, tx, afterCommit);
      }
      return updated;
    });
  } catch (error) {
    if (error instanceof PassengerMutationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  afterCommit.forEach(effect => effect());

  if (!passenger) {
    res.status(404).json({ error: "Passenger not found" });
    return;
  }

  // Sinkronizo bookings.pnr nga PNR-të e pasagjerëve (rrjetë sigurie SERVER-SIDE).
  // Frontend-i e bën të njëjtën gjë, por nëse ajo kërkesë dështon/humbet, serveri e
  // garanton këtu: PNR i rezervimit rrjedh gjithmonë nga PNR-të e pasagjerëve aktivë.
  if ("pnr" in parsed.data) {
    const normPnr = (v: unknown) => String(v ?? "").trim().toUpperCase();
    if (normPnr((oldPassenger as any).pnr) !== normPnr((parsed.data as any).pnr)) {
      try {
        const paxAll = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, oldPassenger.bookingId));
        const uniq = Array.from(new Set(
          paxAll
            .filter(p => !(p as any).cancelled)
            .map(p => normPnr((p as any).pnr))
            .filter(v => v.length > 0)
        ));
        const derived = uniq.length === 0
          ? null
          : uniq.length === 1
            ? uniq[0]
            : uniq.map((p, i) => `PNR${i + 1} ${p}`).join(" / ");
        const [bk] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, oldPassenger.bookingId));
        const currentPnr = String(bk?.pnr ?? "").trim();
        if (bk && (derived ?? "") !== currentPnr) {
          await db.update(bookingsTable).set({ pnr: derived }).where(eq(bookingsTable.id, bk.id));
          logBookingChange({
            bookingId: bk.id,
            userId: (req as any).session?.userId ?? null,
            userName: (req as any).session?.userName ?? "System",
            userRole: (req as any).session?.role ?? null,
            action: "updated",
            fieldName: "PNR",
            oldValue: currentPnr || null,
            newValue: derived,
            note: "Sinkronizim automatik nga PNR e pasagjerëve",
          }).catch(() => {});
        }
      } catch (e: any) {
        req.log.error({ err: e, passengerId: passenger.id }, "PNR sync: dështoi sinkronizimi i bookings.pnr");
      }

    }
  }

  res.json(formatPassenger(passenger));

  // Detect which fields actually changed
  const changedFields = Object.keys(parsed.data).filter(key => {
    const oldVal = (oldPassenger as any)[key];
    const newVal = (parsed.data as any)[key];
    const norm = (v: any) => (v === null || v === undefined || v === "") ? null : v;
    return norm(oldVal) !== norm(newVal);
  });

  if (changedFields.length === 0) return;

  const logUserId = (req as any).session?.userId ?? null;
  const logUserName = (req as any).session?.userName ?? "Staff";
  const logUserRole = (req as any).session?.role ?? null;
  const paxLabel = `${passenger.firstName} ${passenger.lastName}`;

  const formatVal = (key: string, v: any): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v ? "Po" : "Jo";
    return String(v);
  };

  for (const key of changedFields) {
    const label = PASSENGER_FIELD_LABELS[key] ?? key;
    const oldV = formatVal(key, (oldPassenger as any)[key]);
    const newV = formatVal(key, (parsed.data as any)[key]);
    logBookingChange({
      bookingId: oldPassenger.bookingId,
      userId: logUserId,
      userName: logUserName,
      userRole: logUserRole,
      action: "passenger_updated",
      fieldName: `${label} — ${paxLabel}`,
      oldValue: oldV,
      newValue: newV,
    }).catch(() => {});
  }

  // RREGULL (31.07.2026): çdo ndryshim përmbajtjeje te pasagjeri (emër, PNR,
  // çmim bilete, shtesa/bagazh) në një rezervim të BILETUAR e kthen në
  // KONFIRMUAR. Një thirrje e vetme mbledh të gjitha ndryshimet e kërkesës.
  const REVERT_FIELDS = ["firstName", "lastName", "pnr", "ticketPrice", "baggageOption", "extraCost", "type"];
  const revertTriggers = changedFields.filter(f => REVERT_FIELDS.includes(f));
  if (revertTriggers.length > 0) {
    const labels = revertTriggers.map(f => PASSENGER_FIELD_LABELS[f] ?? f).join(", ");
    const ticketChanges: TicketedBookingChange[] = [];
    if (changedFields.includes("firstName") || changedFields.includes("lastName")) {
      ticketChanges.push({
        kind: "passenger_name",
        label: "Passenger Name",
        oldValue: `${oldPassenger.firstName} ${oldPassenger.lastName}`.trim(),
        newValue: `${passenger.firstName} ${passenger.lastName}`.trim(),
      });
    }
    if (changedFields.includes("pnr")) {
      ticketChanges.push({
        kind: "pnr",
        label: "PNR",
        oldValue: String((oldPassenger as any).pnr ?? "—").trim() || "—",
        newValue: String((passenger as any).pnr ?? "—").trim() || "—",
      });
    }
    if (changedFields.includes("ticketPrice")) {
      const formatTicketPrice = (value: unknown) => {
        const amount = Number(value);
        return Number.isFinite(amount) ? `€${Math.round(amount)}` : "—";
      };
      ticketChanges.push({
        kind: "ticket_price",
        label: "Ticket Price",
        oldValue: formatTicketPrice(oldPassenger.ticketPrice),
        newValue: formatTicketPrice(passenger.ticketPrice),
      });
    }
    void revertTicketedToConfirmed(
      oldPassenger.bookingId,
      req,
      `U ndryshua ${labels} (${paxLabel}) pas lëshimit`,
      ticketChanges,
    );
  }

  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo) {
    const full = await getFullBooking(oldPassenger.bookingId);
    if (full) {
      const oldPax = formatPassenger(oldPassenger) as Record<string, any>;
      const newPax = formatPassenger(passenger) as Record<string, any>;
      sendEmail(
        notifyTo,
        `Ndryshim Pasagjeri: ${full.bookingRef} — ${newPax.firstName} ${newPax.lastName}`,
        passengerChangedEmail(full, oldPax, newPax, changedFields)
      );
    }
  }
});

router.delete("/passengers/:id", async (req, res): Promise<void> => {
  const params = DeletePassengerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [initialPassenger] = await db.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
  if (!initialPassenger) {
    res.sendStatus(204);
    return;
  }
  let oldPassenger = initialPassenger;
  let flightIdForSeats: number | null = null;
  let changed = false;
  const afterCommit: AfterCommitEffect[] = [];
  try {
    await db.transaction(async tx => {
      const booking = await lockBooking(tx, initialPassenger.bookingId);
      if (!booking) throw new PassengerMutationError(404, "Booking not found");
      if (booking.status === "cancelled") throw new PassengerMutationError(409, CANCELLED_MUTATION_ERROR);
      const [current] = await tx.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
      if (!current || (current as any).cancelled) return;
      oldPassenger = current;
      await tx.update(passengersTable).set({ cancelled: true } as any).where(eq(passengersTable.id, params.data.id));
      if (current.type !== "infant") {
        await tx.update(flightsTable)
          .set({ soldSeats: sql`GREATEST(0, ${flightsTable.soldSeats} - 1)` })
          .where(eq(flightsTable.id, booking.flightId));
        flightIdForSeats = booking.flightId;
      }
      await recalcBookingTotalExcludingCancelled(current.bookingId, tx, afterCommit);
      changed = true;
    });
  } catch (error) {
    if (error instanceof PassengerMutationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }

  afterCommit.forEach(effect => effect());
  res.sendStatus(204);
  if (!changed) return;
  if (flightIdForSeats != null) {
    void recordSeatEvent({ flightId: flightIdForSeats, type: "cancelled", seats: 1, req, note: `Anulim pasagjeri: ${oldPassenger.firstName} ${oldPassenger.lastName}` });
  }

  logBookingChange({
    bookingId: oldPassenger.bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "passenger_cancelled",
    note: `Pasagjer i anuluar: ${oldPassenger.firstName} ${oldPassenger.lastName} (${oldPassenger.type ?? "adult"})`,
  }).catch(() => {});
});

// Endpoint i ri për të rikthyer një pasagjer të anuluar.
router.post("/passengers/:id/restore", async (req, res): Promise<void> => {
  const params = DeletePassengerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [initialPassenger] = await db.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
  if (!initialPassenger) {
    res.status(404).json({ error: "Passenger not found" });
    return;
  }
  let oldPassenger = initialPassenger;
  let flightIdForSeats: number | null = null;
  let changed = false;
  let restored: typeof passengersTable.$inferSelect;
  const afterCommit: AfterCommitEffect[] = [];
  try {
    restored = await db.transaction(async tx => {
      const booking = await lockBooking(tx, initialPassenger.bookingId);
      if (!booking) throw new PassengerMutationError(404, "Booking not found");
      if (booking.status === "cancelled") throw new PassengerMutationError(409, CANCELLED_MUTATION_ERROR);
      const [current] = await tx.select().from(passengersTable).where(eq(passengersTable.id, params.data.id));
      if (!current) throw new PassengerMutationError(404, "Passenger not found");
      oldPassenger = current;
      if (!(current as any).cancelled) return current;

      if (current.type !== "infant") {
        const [flight] = await tx.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
        if (flight && flight.totalSeats - flight.soldSeats < 1) {
          throw new PassengerMutationError(400, "Fluturimi është plot — s'mund të rikthehet pasagjeri.");
        }
        if (flight) {
          await tx.update(flightsTable)
            .set({ soldSeats: sql`${flightsTable.soldSeats} + 1` })
            .where(eq(flightsTable.id, booking.flightId));
          flightIdForSeats = booking.flightId;
        }
      }
      const [row] = await tx.update(passengersTable)
        .set({ cancelled: false } as any)
        .where(eq(passengersTable.id, params.data.id))
        .returning();
      await recalcBookingTotalExcludingCancelled(current.bookingId, tx, afterCommit);
      changed = true;
      return row;
    });
  } catch (error) {
    if (error instanceof PassengerMutationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }

  afterCommit.forEach(effect => effect());
  res.json(formatPassenger(restored));
  if (!changed) return;
  if (flightIdForSeats != null) {
    await flipSoldOutIfFull(flightIdForSeats);
    triggerCpExportSoon();
    void recordSeatEvent({ flightId: flightIdForSeats, type: "restored", seats: 1, req, note: `Rikthim pasagjeri: ${oldPassenger.firstName} ${oldPassenger.lastName}` });
  }

  logBookingChange({
    bookingId: oldPassenger.bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "passenger_restored",
    note: `Pasagjer i rikthyer: ${oldPassenger.firstName} ${oldPassenger.lastName} (${oldPassenger.type ?? "adult"})`,
  }).catch(() => {});
});

export default router;
