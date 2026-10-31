// "Fluturimet me Ndryshime Orari" — admin/manager page. Lists flights whose
// schedule changed while they had active bookings; the admin picks per-recipient
// checkboxes and sends the notification emails from here.
import { Router, type IRouter } from "express";
import { db, flightsTable, scheduleChangesTable } from "@workspace/db";
import { eq, desc, count, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getScheduleChangeRecipients, sendScheduleChangeEmails, schedDeltaHours, FREE_CHANGE_HOURS,
} from "../lib/scheduleChangeNotify.js";

const router: IRouter = Router();

// Sidebar badge: number of pending schedule changes.
router.get("/schedule-changes/count", async (_req, res): Promise<void> => {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(scheduleChangesTable)
    .where(eq(scheduleChangesTable.status, "pending"));
  res.json({ count: Number(cnt) });
});

// List: pending first (with recipients preview), then recently handled.
router.get("/schedule-changes", async (req, res): Promise<void> => {
  try {
    const includeHandled = req.query.all === "1";
    const rows = await db.select().from(scheduleChangesTable)
      .orderBy(desc(scheduleChangesTable.updatedAt))
      .limit(200);
    const filtered = includeHandled ? rows : rows.filter(r => r.status === "pending");

    const flightIds = [...new Set(filtered.map(r => r.flightId))];
    const flights = flightIds.length
      ? await db.select().from(flightsTable).where(inArray(flightsTable.id, flightIds))
      : [];
    const flightById = new Map(flights.map(f => [f.id, f]));

    const out = [];
    for (const r of filtered) {
      const f = flightById.get(r.flightId);
      if (!f) continue;
      const recipients = r.status === "pending" || includeHandled
        ? await getScheduleChangeRecipients(r.flightId)
        : [];
      const depDelta = schedDeltaHours(r.oldDepartureDate, r.oldDepartureTime, r.newDepartureDate, r.newDepartureTime);
      out.push({
        id: r.id,
        flightId: r.flightId,
        flight: {
          id: f.id, airline: f.airline, flightNumber: f.flightNumber,
          fromCity: f.fromCity, toCity: f.toCity,
          departureDate: f.departureDate, departureTime: f.departureTime,
          arrivalDate: f.arrivalDate, arrivalTime: f.arrivalTime,
        },
        oldDepartureDate: r.oldDepartureDate, oldDepartureTime: r.oldDepartureTime,
        oldArrivalDate: r.oldArrivalDate, oldArrivalTime: r.oldArrivalTime,
        newDepartureDate: r.newDepartureDate, newDepartureTime: r.newDepartureTime,
        newArrivalDate: r.newArrivalDate, newArrivalTime: r.newArrivalTime,
        source: r.source,
        status: r.status,
        sentLog: r.sentLog ?? [],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        departureDeltaHours: Math.round(depDelta * 10) / 10,
        freeChangeEligible: depDelta > FREE_CHANGE_HOURS,
        recipients,
      });
    }
    res.json(out);
  } catch (err) {
    logger.error({ err }, "[schedule-changes] list failed");
    res.status(500).json({ error: "Gabim gjatë leximit të ndryshimeve të orarit" });
  }
});

// Send emails to the selected recipients.
router.post("/schedule-changes/:id/send", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID i pavlefshëm" }); return; }
  const emails: unknown = req.body?.emails;
  if (!Array.isArray(emails) || emails.length === 0 || !emails.every(e => typeof e === "string")) {
    res.status(400).json({ error: "Zgjidhni të paktën një marrës" }); return;
  }
  try {
    const result = await sendScheduleChangeEmails(id, emails as string[]);
    if (result.sent === 0) {
      res.status(400).json({ error: "Asnjë marrës i vlefshëm me email nuk u gjet" }); return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, changeId: id }, "[schedule-changes] send failed");
    res.status(500).json({ error: "Dërgimi i email-eve dështoi" });
  }
});

// Dismiss without sending.
router.patch("/schedule-changes/:id/dismiss", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID i pavlefshëm" }); return; }
  const [row] = await db.update(scheduleChangesTable)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(scheduleChangesTable.id, id))
    .returning({ id: scheduleChangesTable.id });
  if (!row) { res.status(404).json({ error: "Nuk u gjet" }); return; }
  res.json({ ok: true });
});

export default router;
