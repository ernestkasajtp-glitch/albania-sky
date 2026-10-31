import type { Request } from "express";
import { db, bookingsTable, bookingChangeLogsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { clearSavedWizzTicket } from "./wizzTicket.js";
import { getFullBooking } from "./getFullBooking.js";
import type { TicketedBookingChange } from "./ticketUpdateEmail.js";

/**
 * RREGULL (31.07.2026, kërkesë e userit): nëse një rezervim është BILETUAR dhe
 * ndryshon PËRMBAJTJA e tij (emër pasagjeri, çmim shitjeje, shtesa/extras,
 * pasagjer i ri, PNR), rezervimi kthehet automatikisht në KONFIRMUAR —
 * bileta duhet lëshuar dhe dërguar përsëri me ndryshimet e reja.
 * Regjistrohet në historik + dërgohet email statusi + hiqet bileta Wizz e ruajtur.
 *
 * Kthen true nëse u bë kthimi (booking ishte "ticketed").
 */
export async function revertTicketedToConfirmed(
  bookingId: number,
  req: Request,
  reason: string,
  changes: TicketedBookingChange[] = [],
): Promise<boolean> {
  try {
    // Kalim ATOMIK: vetëm NJË fitues edhe nën kërkesa të njëkohshme —
    // UPDATE i kushtëzuar me RETURNING; efektet anësore vetëm nëse u ndryshua.
    const reverted = await db.update(bookingsTable)
      .set({ status: "confirmed", ticketEmailPending: false, ticketEmailSentAt: null })
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "ticketed")))
      .returning({ id: bookingsTable.id });
    if (reverted.length === 0) return false;
    const [statusEvent] = await db.insert(bookingChangeLogsTable).values({
      bookingId,
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "System",
      userRole: (req as any).session?.role ?? null,
      action: "status_changed",
      fieldName: "Statusi",
      oldValue: "Ticketed",
      newValue: "Konfirmuar",
      note: `${reason} — bileta duhet lëshuar përsëri`,
    }).returning({ id: bookingChangeLogsTable.id });
    void clearSavedWizzTicket(bookingId, `Bileta e ruajtur u hoq — ${reason}, statusi u kthye në Konfirmuar`);
    try {
      // Import dinamik për të shmangur ciklin lib ↔ routes/bookings.
      const { sendAgentStatusEmail } = await import("../routes/bookings.js");
      const fullBk = await getFullBooking(bookingId);
      if (fullBk) void sendAgentStatusEmail(fullBk, "confirmed", statusEvent.id, changes);
    } catch { /* email s'bllokon */ }
    return true;
  } catch (e) {
    (req as any).log?.error?.({ err: e, bookingId }, "revertTicketedToConfirmed dështoi");
    return false;
  }
}
