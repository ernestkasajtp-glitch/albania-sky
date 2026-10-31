import { Router } from "express";
import { SaveWholeBookingBody } from "@workspace/api-zod";
import { BookingSaveError, saveBookingAtomically } from "../lib/atomicBookingSave.js";
import { getFullBooking, sendAgentStatusEmail } from "./bookings.js";
import { getEffectivePermissions } from "./permissions.js";
import { notifyDataChanged } from "../lib/liveEvents.js";
import { scheduleExcelSync } from "../lib/excelSync.js";
import { scheduleGSheetsSync } from "../lib/googleSheets.js";
import { triggerCpExportSoon } from "../lib/cpExport.js";
import { checkDuplicatePassengerTask } from "../lib/dupPassengerCheck.js";
import { sendPaymentInvoice } from "../lib/invoice.js";
import { sendEmail, bookingUpdatedEmail } from "../lib/gmail.js";

export const bookingSaveRouter = Router();
bookingSaveRouter.post("/bookings/:id/save", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = SaveWholeBookingBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Plani i ruajtjes është i pavlefshëm." }); return;
  }
  const session = (req as any).session;
  try {
    const permissions = session.role === "admin" ? {} : await getEffectivePermissions(session.role, session.userId);
    const result = await saveBookingAtomically(id, parsed.data, session, permissions);
    const booking = await getFullBooking(id);
    res.json({ results: result.results, booking });
    if (!result.replay) {
      notifyDataChanged("bookings"); notifyDataChanged("agents");
      scheduleExcelSync(); scheduleGSheetsSync(); triggerCpExportSoon();
      void checkDuplicatePassengerTask(id).catch(error => req.log.error({ err: error }, "Duplicate passenger check after save failed"));
      for (const paymentId of result.newPaymentIds) void sendPaymentInvoice(paymentId).catch(error => req.log.error({ err: error }, "Payment invoice after save failed"));
      if (booking && result.revertedEventId) void sendAgentStatusEmail(booking, "confirmed", result.revertedEventId, result.ticketChanges).catch(error => req.log.error({ err: error }, "Ticket update email after save failed"));
      if (booking && process.env.NOTIFY_EMAIL) void sendEmail(process.env.NOTIFY_EMAIL,
        `Ndryshim Rezervimi: ${booking.bookingRef} — ${booking.customerName}`,
        bookingUpdatedEmail(booking, ["Ruajtje e plotë"]));
    }
  } catch (error) {
    if (res.headersSent) { req.log.error({ err: error }, "Post-save notification failed"); return; }
    if (error instanceof BookingSaveError) res.status(error.status).json({ error: error.message });
    else if (error instanceof Error && error.name === "ZodError") res.status(400).json({ error: error.message });
    else throw error;
  }
});