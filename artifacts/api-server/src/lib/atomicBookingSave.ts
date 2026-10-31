import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db, bookingsTable, passengersTable, paymentsTable, bookingExtrasTable,
  flightsTable, agentsTable, bookingChangeLogsTable, paymentChangeLogsTable,
  agentCreditTransactionsTable, flightSeatHistoryTable,
} from "@workspace/db";
import { CreatePassengerBody, UpdatePassengerBody, UpdateBookingBody, CreatePaymentBody, UpdatePaymentBody } from "@workspace/api-zod";
import { bookingSaveVersion } from "./bookingSaveVersion.js";
import { normalizePassengerNames } from "./nameFormat.js";
import { validateManualPaymentMethod } from "./manualPaymentMethod.js";
import type { TicketedBookingChange } from "./ticketUpdateEmail.js";

export class BookingSaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type SaveCommand = { path: string; method: string; body?: Record<string, any> };
export type SavePlan = { requestId: string; version: string; commands: SaveCommand[] };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const fail = (message: string, status = 400): never => { throw new BookingSaveError(status, message); };
const money = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fail("Vlerë monetare e pavlefshme.");
  return Math.round(n);
};
const paid = (rows: any[]) => rows.filter(p => p.status === "completed").reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
const seats = (rows: any[]) => rows.filter(p => !p.cancelled && p.type !== "infant").length;
const pick = (value: Record<string, any>, keys: string[]) => Object.fromEntries(keys.filter(k => k in value).map(k => [k, value[k]]));
const bookingFields = ["pnr", "netPrice", "totalAmount", "discount", "markup", "customerName", "customerEmail", "customerPhone", "notes", "agentId"];
const paxFields = ["firstName", "lastName", "type", "gender", "dateOfBirth", "nationality", "passportNumber", "passportExpiry", "seatNumber", "baggageOption", "pnr", "hasSeatSelection", "hasPriorityBoarding", "hasInsurance", "ticketPrice"];
const extraFields = ["baggageOption", "hasSeatSelection", "hasPriorityBoarding", "hasInsurance"];
const priceFields = ["ticketPrice", "type", ...extraFields];

/**
 * All writes, financial reconciliation and audit entries use the SAME tx.
 * No SMTP, network calls, response callbacks or detached writes are allowed here.
 * A receipt in the existing audit table makes lost-response retries idempotent.
 */
export async function saveBookingAtomically(
  id: number, plan: SavePlan, actor: { userId?: number; userName?: string; role?: string },
  permissions: Record<string, boolean>, client = db,
) {
  const fingerprint = createHash("sha256").update(JSON.stringify(plan.commands)).digest("hex");
  // Validate methods before opening the financial transaction (this helper only reads).
  const methods = new Map<string, string>();
  for (const command of plan.commands) {
    if (command.path.startsWith("/payments") && command.body?.method !== undefined) {
      const selected = await validateManualPaymentMethod(command.body.method, client);
      if ("error" in selected) fail(selected.error);
      else methods.set(command.body.method, selected.method);
    }
  }
  return client.transaction(async tx => {
    const [before] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, id)).for("update");
    if (!before) return fail("Rezervimi nuk u gjet.", 404);
    const [receipt] = await tx.select().from(bookingChangeLogsTable).where(and(
      eq(bookingChangeLogsTable.bookingId, id), eq(bookingChangeLogsTable.action, "atomic_save_receipt"),
      eq(bookingChangeLogsTable.newValue, plan.requestId),
    ));
    if (receipt) {
      if (receipt.note !== fingerprint || receipt.userId !== (actor.userId ?? null)) fail("Identifikuesi i ruajtjes është përdorur për ndryshime të tjera.", 409);
      return { results: JSON.parse(receipt.oldValue ?? "[]"), replay: true, revertedEventId: null as number | null, newPaymentIds: [] as number[], ticketChanges: [] as TicketedBookingChange[] };
    }
    const originalPax = await tx.select().from(passengersTable).where(eq(passengersTable.bookingId, id)).for("update");
    const originalPayments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id)).for("update");
    const originalExtras = await tx.select().from(bookingExtrasTable).where(eq(bookingExtrasTable.bookingId, id)).for("update");
    if (bookingSaveVersion(before, originalPax, originalPayments, originalExtras) !== plan.version) {
      fail("Rezervimi ka ndryshuar ndërkohë. Asnjë ndryshim nuk u ruajt. Rifresko dhe kontrollo vlerat para riprovimit.", 409);
    }
    const [flight] = await tx.select().from(flightsTable).where(eq(flightsTable.id, before.flightId)).for("update");
    if (!flight) return fail("Fluturimi nuk u gjet.", 404);
    const auditActor = { userId: actor.userId ?? null, userName: actor.userName ?? "Staff", userRole: actor.role ?? null };
    const audit = async (action: string, fieldName: string, oldValue: unknown, newValue: unknown, note?: string) => {
      const [row] = await tx.insert(bookingChangeLogsTable).values({
        bookingId: id, ...auditActor, action, fieldName,
        oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue), note: note ?? null,
      }).returning({ id: bookingChangeLogsTable.id });
      return row.id;
    };
    const diff = async (label: string, old: any, next: any, keys: string[]) => {
      const labels: Record<string, string> = { firstName: "Emri", lastName: "Mbiemri", ticketPrice: "Çmimi i Biletës", baggageOption: "Bagazhi", hasSeatSelection: "Zgjedhja e Vendit", hasPriorityBoarding: "Prioritet Boarding", hasInsurance: "Sigurim", pnr: "PNR" };
      const display = (v: any) => typeof v === "boolean" ? v ? "Po" : "Jo" : v;
      for (const key of keys) if (String(old?.[key] ?? "") !== String(next?.[key] ?? "")) {
        await audit(label.startsWith("Pasagjeri") ? "passenger_updated" : "updated", labels[key] ?? key, display(old?.[key]), display(next?.[key]), label);
      }
    };
    let pax = [...originalPax], payments = [...originalPayments], extras = [...originalExtras];
    const bookingPatch: Record<string, any> = {};
    const results: any[] = [], newPaymentIds: number[] = [];
    const seatEvents: { seats: number; type: string; note: string }[] = [];
    let recalc = false, ticketContentChanged = false, syncPnr = false, extraDelta = 0;
    const paymentAudit = async (old: any, row: any, action: string) => {
      await tx.insert(paymentChangeLogsTable).values({
        ...auditActor, paymentId: row.id, action,
        oldValue: old ? JSON.stringify(pick(old, ["amount", "method", "status", "reference", "notes", "payerType"])) : null,
        newValue: JSON.stringify(pick(row, ["amount", "method", "status", "reference", "notes", "payerType"])),
      });
      await audit(action === "created" ? "payment_added" : "payment_updated", `Pagesa #${row.id}`,
        old ? `${old.amount} · ${old.method} · ${old.status}` : null, `${row.amount} · ${row.method} · ${row.status}`);
    };
    for (const command of plan.commands) {
      const { method, path } = command;
      const body = command.body ?? {};
      if (before.status === "cancelled" && !(path === `/bookings/${id}` && method === "PATCH" && Object.keys(body).every(k => k === "notes"))) {
        fail("Rezervimi është i anuluar. Ndryshimet nuk mund të ruhen.", 409);
      }
      if (path === `/bookings/${id}` && method === "PATCH") {
        if (Object.keys(body).some(k => !bookingFields.includes(k))) fail("Fushë rezervimi e pambështetur.");
        const parsed = UpdateBookingBody.parse(body);
        const patch: Record<string, any> = { ...parsed };
        if ("netPrice" in patch && (patch.netPrice == null ? null : Number(patch.netPrice)) !== (before.netPrice == null ? null : Number(before.netPrice)) && actor.role !== "admin" && !permissions.can_edit_booking_net_price) fail("Nuk keni leje për ndryshimin e netos.", 403);
        if ("agentId" in patch && patch.agentId !== before.agentId && paid(originalPayments) > 0) fail("Agjencia nuk mund të ndryshohet kur rezervimi ka pagesa.");
        for (const key of ["netPrice", "totalAmount", "discount", "markup"]) if (key in patch) {
          patch[key] = patch[key] == null && key === "netPrice" ? null : String(money(patch[key]));
        }
        if ("discount" in patch) patch.discount = String(Math.max(0, Number(patch.discount)));
        Object.assign(bookingPatch, patch);
        ticketContentChanged ||= Object.keys(patch).some(k => ["customerName", "pnr", "totalAmount", "discount"].includes(k) && String(patch[k] ?? "") !== String((before as any)[k] ?? ""));
        results.push({ id });
      } else if (path === "/passengers" && method === "POST") {
        const data = CreatePassengerBody.parse(body);
        if (data.bookingId !== id) fail("Pasagjeri nuk i përket këtij rezervimi.", 403);
        const values: any = normalizePassengerNames(pick(data, paxFields));
        values.bookingId = id;
        values.ticketPrice = values.ticketPrice == null ? null : String(money(values.ticketPrice));
        if (values.ticketPrice !== null && Number(values.ticketPrice) < 0) fail("Çmimi i biletës nuk mund të jetë negativ.");
        values.extraCost = String(passengerExtras(values, flight));
        const [row] = await tx.insert(passengersTable).values(values).returning();
        pax.push(row); recalc = true; ticketContentChanged = true;
        await audit("passenger_added", "Pasagjeri", null, `${row.firstName} ${row.lastName}`);
        if (row.type !== "infant") seatEvents.push({ seats: 1, type: "sold", note: `Shto ${row.firstName} ${row.lastName}` });
        results.push(row);
      } else if (/^\/passengers\/\d+(\/restore)?$/.test(path)) {
        const pid = Number(path.split("/")[2]);
        const old = pax.find(p => p.id === pid);
        if (!old) return fail("Pasagjeri nuk i përket këtij rezervimi.", 403);
        let patch: Record<string, any>;
        if (method === "PATCH" && !path.endsWith("/restore")) {
          if (Object.keys(body).some(k => !paxFields.includes(k))) fail("Fushë pasagjeri e pambështetur.");
          patch = normalizePassengerNames(UpdatePassengerBody.parse(body));
          if ("ticketPrice" in patch) patch.ticketPrice = patch.ticketPrice == null ? null : String(money(patch.ticketPrice));
          if (patch.ticketPrice != null && Number(patch.ticketPrice) < 0) fail("Çmimi i biletës nuk mund të jetë negativ.");
          if (extraFields.some(k => k in patch)) patch.extraCost = String(passengerExtras({ ...old, ...patch }, flight));
          recalc ||= priceFields.some(k => k in patch && String(patch[k] ?? "") !== String((old as any)[k] ?? ""));
          syncPnr ||= "pnr" in patch;
        } else if (method === "DELETE" && !path.endsWith("/restore")) { patch = { cancelled: true }; recalc = true; }
        else if (method === "POST" && path.endsWith("/restore")) { patch = { cancelled: false }; recalc = true; }
        else return fail("Veprim pasagjeri i pavlefshëm.");
        const [row] = await tx.update(passengersTable).set(patch).where(eq(passengersTable.id, pid)).returning();
        const delta = seats([row]) - seats([old]);
        if (delta) seatEvents.push({ seats: Math.abs(delta), type: delta < 0 ? "cancelled" : old.cancelled ? "restored" : "sold", note: `${row.firstName} ${row.lastName}` });
        await diff(`Pasagjeri #${pid}`, old, row, [...paxFields, "cancelled", "extraCost"]);
        ticketContentChanged ||= Object.keys(patch).some(k => String(patch[k] ?? "") !== String((old as any)[k] ?? ""));
        pax = pax.map(p => p.id === pid ? row : p); results.push(row);
      } else if (path === `/bookings/${id}/extras` || new RegExp(`^/bookings/${id}/extras/\\d+$`).test(path)) {
        const extraId = Number(path.split("/")[4]);
        const old = extras.find(e => e.id === extraId);
        if (method !== "POST" && !old) return fail("Shtojca nuk i përket këtij rezervimi.", 403);
        if (method === "DELETE") {
          await tx.delete(bookingExtrasTable).where(eq(bookingExtrasTable.id, extraId));
          extras = extras.filter(e => e.id !== extraId); extraDelta -= Number(old!.amount);
          await audit("extra_deleted", "Shtojcë", `${old!.description} · ${old!.amount}`, null); results.push({ id: extraId });
        } else if (method === "POST" || method === "PATCH") {
          const description = typeof body.description === "string" ? body.description.trim() : "";
          const amount = money(body.amount);
          if (!description || amount <= 0) fail("Shtojca kërkon përshkrim dhe shumë pozitive.");
          const named = description.match(/—\s*(.+)$/)?.[1]?.trim().toLowerCase();
          const target = /^bagazh\b/i.test(description) && method === "POST"
            ? pax.find(p => !p.cancelled && (named ? `${p.firstName} ${p.lastName}`.toLowerCase() === named : pax.length === 1)) : undefined;
          if (target && target.baggageOption !== "checked") {
            const [row] = await tx.update(passengersTable).set({ baggageOption: "checked", extraCost: String(amount) }).where(eq(passengersTable.id, target.id)).returning();
            pax = pax.map(p => p.id === row.id ? row : p);
            await diff(`Pasagjeri #${row.id}`, target, row, ["baggageOption", "extraCost"]);
            extraDelta += amount; results.push({ id: row.id });
          } else {
            const [row] = method === "POST"
              ? await tx.insert(bookingExtrasTable).values({ bookingId: id, description, amount: String(amount) }).returning()
              : await tx.update(bookingExtrasTable).set({ description, amount: String(amount) }).where(eq(bookingExtrasTable.id, extraId)).returning();
            extras = method === "POST" ? [...extras, row] : extras.map(e => e.id === extraId ? row : e);
            extraDelta += amount - Number(old?.amount ?? 0);
            await audit(method === "POST" ? "extra_added" : "extra_updated", "Shtojcë", old ? `${old.description} · ${old.amount}` : null, `${description} · ${amount}`);
            results.push(row);
          }
        } else return fail("Veprim shtojce i pavlefshëm.");
        ticketContentChanged = true;
      } else if (/^\/payments(?:\/\d+)?$/.test(path)) {
        if (!["admin", "manager"].includes(actor.role ?? "")) fail("Nuk keni leje për pagesat.", 403);
        const paymentId = Number(path.split("/")[2]);
        const old = payments.find(p => p.id === paymentId);
        let row: typeof paymentsTable.$inferSelect;
        if (method === "POST" && path === "/payments") {
          const data = CreatePaymentBody.parse(body);
          if (data.bookingId !== id) fail("Pagesa nuk i përket rezervimit.", 403);
          [row] = await tx.insert(paymentsTable).values({ ...data, amount: String(money(data.amount)),
            method: methods.get(body.method)!, status: "completed", isRefund: false,
            payerType: body.payerType === "invoice" || body.payerType === "client" ? body.payerType : null,
          }).returning();
          payments.push(row); newPaymentIds.push(row.id);
        } else if (method === "PATCH" && old) {
          if (Object.keys(body).some(k => !["amount", "method", "reference", "notes", "status", "cancelNote", "payerType"].includes(k))) fail("Fushë pagese e pambështetur.");
          const data: any = UpdatePaymentBody.parse(body);
          if (data.status && !["completed", "cancelled"].includes(data.status)) fail("Status pagese i pavlefshëm.");
          if (data.status === "cancelled" && old.status !== "cancelled") {
            if (old.reference === "KREDIT-AUTO") fail("Kreditimi automatik nuk mund të anulohet.");
            if (!String(body.cancelNote ?? "").trim()) fail("Shënimi i anulimit është i detyrueshëm.");
            data.notes = `${old.notes ? `${old.notes}\n` : ""}[ANULUAR] ${String(body.cancelNote).trim()}`;
          }
          if (data.amount !== undefined) {
            if (!Number.isFinite(Number(data.amount))) fail("Shumë pagese e pavlefshme.");
            data.amount = String(data.amount); // Existing payment cents are preserved.
          }
          if (data.method !== undefined) data.method = methods.get(body.method)!;
          if ("payerType" in body) data.payerType = ["client", "invoice"].includes(body.payerType) ? body.payerType : null;
          [row] = await tx.update(paymentsTable).set(data).where(eq(paymentsTable.id, paymentId)).returning();
          payments = payments.map(p => p.id === paymentId ? row : p);
        } else return fail("Pagesa nuk i përket rezervimit ose veprimi është i pavlefshëm.", 403);
        await paymentAudit(old, row, old ? "updated" : "created"); results.push(row);
      } else return fail("Veprim i pambështetur në ruajtjen e rezervimit.");
    }
    const seatDelta = seats(pax) - seats(originalPax);
    if (seatDelta > 0 && flight.soldSeats + seatDelta > flight.totalSeats) fail("Fluturimi nuk ka vende të mjaftueshme. Asnjë ndryshim nuk u ruajt.");
    if (seatDelta || seatEvents.length) {
      const soldSeats = Math.max(0, flight.soldSeats + seatDelta);
      await tx.update(flightsTable).set({ soldSeats, ...(soldSeats >= flight.totalSeats && flight.status === "open" ? { status: "soldout" } : {}) }).where(eq(flightsTable.id, flight.id));
      for (const event of seatEvents) await tx.insert(flightSeatHistoryTable).values({
        flightId: flight.id, ...auditActor, eventType: event.type, seats: event.seats,
        totalSeats: flight.totalSeats, soldSeats, note: `${before.bookingRef} · ${event.note}`,
      });
    }
    if (syncPnr) {
      const pnrs = [...new Set(pax.filter(p => !p.cancelled).map(p => (p.pnr ?? "").trim().toUpperCase()).filter(Boolean))];
      bookingPatch.pnr = pnrs.length > 1 ? pnrs.map((pnr, i) => `PNR${i + 1} ${pnr}`).join(" / ") : pnrs[0] ?? null;
    }
    const discount = Number(bookingPatch.discount ?? before.discount);
    // Explicit sale wins; otherwise passenger changes derive ONE final total.
    if (bookingPatch.totalAmount === undefined) {
      bookingPatch.totalAmount = String(recalc
        ? money(pax.filter(p => !p.cancelled).reduce((sum, p) => sum + Number(p.ticketPrice ?? (p.type === "infant" ? flight.infantPrice : p.type === "child" ? flight.childPrice : flight.adultPrice) ?? 0) + Number(p.extraCost), 0)
          + Number(flight.tax) + extras.reduce((sum, e) => sum + Number(e.amount), 0) - discount)
        : extraDelta || discount !== Number(before.discount)
          ? money(Number(before.totalAmount) + extraDelta - (discount - Number(before.discount)))
          : Number(before.totalAmount));
    }
    const finalAgentId = bookingPatch.agentId === undefined ? before.agentId : bookingPatch.agentId;
    if (Number(bookingPatch.totalAmount) < 0) fail("Totali i shitjes nuk mund të jetë negativ.");
    const excess = Math.max(0, Math.round((paid(payments) - Number(bookingPatch.totalAmount)) * 100) / 100);
    if (finalAgentId && excess > 0 && (Number(bookingPatch.totalAmount) !== Number(before.totalAmount) || plan.commands.some(c => c.path.startsWith("/payments")))) {
      const [agent] = await tx.select().from(agentsTable).where(eq(agentsTable.id, finalAgentId)).for("update");
      if (!agent) return fail("Agjencia nuk u gjet.", 404);
      const note = `Kreditim nga tepricë pas ruajtjes së plotë — ${before.bookingRef}`;
      const [refund] = await tx.insert(paymentsTable).values({
        bookingId: id, amount: String(excess), method: "credit", status: "completed", isRefund: true, reference: "KREDIT-AUTO", notes: note,
      }).returning();
      payments.push(refund); await paymentAudit(null, refund, "created");
      await tx.update(agentsTable).set({ walletBalance: sql`${agentsTable.walletBalance} + ${String(excess)}::numeric` }).where(eq(agentsTable.id, finalAgentId));
      await tx.insert(agentCreditTransactionsTable).values({
        agentId: finalAgentId, type: "credit", amount: String(excess), bookingId: id, bookingRef: before.bookingRef,
        reference: "KREDIT-AUTO", notes: note, invoiceCode: refund.invoiceCode?.replace(/-(\d+)$/, "-CRD$1"),
      });
    }
    bookingPatch.paidAmount = String(Math.max(0, paid(payments)));
    let revertedEventId: number | null = null;
    if (before.status === "ticketed" && ticketContentChanged) {
      Object.assign(bookingPatch, { status: "confirmed", ticketEmailPending: false, ticketEmailSentAt: null, airlineTicketUrl: null, ticketSearchNote: null, ticketSearchNoteAt: null });
      revertedEventId = await audit("status_changed", "Statusi", "Biletuar", "Konfirmuar", "Përmbajtja e rezervimit ndryshoi gjatë ruajtjes.");
    }
    const [after] = await tx.update(bookingsTable).set(bookingPatch).where(eq(bookingsTable.id, id)).returning();
    const ticketChanges: TicketedBookingChange[] = [];
    for (const row of pax) {
      const old = originalPax.find(p => p.id === row.id);
      if (!old) continue;
      const name = `${row.firstName} ${row.lastName}`;
      const oldName = `${old.firstName} ${old.lastName}`;
      if (name !== oldName) ticketChanges.push({ kind: "passenger_name", label: "Pasagjeri", oldValue: oldName, newValue: name });
      if ((row.pnr ?? "") !== (old.pnr ?? "")) ticketChanges.push({ kind: "pnr", label: name, oldValue: old.pnr ?? "", newValue: row.pnr ?? "" });
      if (Number(row.ticketPrice) !== Number(old.ticketPrice)) ticketChanges.push({ kind: "ticket_price", label: name, oldValue: String(old.ticketPrice ?? ""), newValue: String(row.ticketPrice ?? "") });
    }
    if (before.pnr !== after.pnr && !ticketChanges.some(c => c.kind === "pnr")) ticketChanges.push({ kind: "pnr", label: "PNR", oldValue: before.pnr ?? "", newValue: after.pnr ?? "" });
    if (before.totalAmount !== after.totalAmount && !ticketChanges.some(c => c.kind === "ticket_price")) ticketChanges.push({ kind: "ticket_price", label: "Çmimi i shitjes", oldValue: before.totalAmount, newValue: after.totalAmount });
    await diff("Rezervimi", before, after, [...bookingFields, "paidAmount"]);
    // Receipt is inside the transaction and is excluded from user-facing history.
    await tx.insert(bookingChangeLogsTable).values({
      bookingId: id, ...auditActor, action: "atomic_save_receipt", newValue: plan.requestId,
      oldValue: JSON.stringify(results.map(r => ({ id: r.id }))), note: fingerprint,
    });
    return { results, replay: false, revertedEventId, newPaymentIds, ticketChanges };
  });
}

function passengerExtras(p: any, flight: any) {
  return (p.baggageOption === "checked" ? Number(flight.checkedBaggagePrice ?? 0) : 0)
    + (p.hasSeatSelection ? Number(flight.seatSelectionPrice ?? 0) : 0)
    + (p.hasPriorityBoarding ? Number(flight.priorityBoardingPrice ?? 0) : 0)
    + (p.hasInsurance ? Number(flight.insurancePrice ?? 0) : 0);
}