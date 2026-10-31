import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, passengersTable, flightsTable, webhookLogsTable, settingsTable, bookingChangeLogsTable } from "@workspace/db";
import { normalizeFirstName, normalizeLastName } from "../lib/nameFormat";
import { checkDuplicatePassengerTask } from "../lib/dupPassengerCheck.js";

const router: IRouter = Router();

function generateRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "WH";
  for (let i = 0; i < 7; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

async function getWebhookSecret(): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "webhook_secret"));
  return rows[0]?.value ?? null;
}

router.post("/webhook/booking", async (req, res): Promise<void> => {
  const rawPayload = JSON.stringify(req.body);
  let logId: number | null = null;

  const insertLog = async (status: string, errorMessage?: string, bookingId?: number, bookingRef?: string) => {
    try {
      const [log] = await db.insert(webhookLogsTable).values({
        source: (req.body?.source as string) ?? "external",
        status,
        bookingId: bookingId ?? null,
        bookingRef: bookingRef ?? null,
        rawPayload,
        errorMessage: errorMessage ?? null,
      }).returning({ id: webhookLogsTable.id });
      return log?.id ?? null;
    } catch { return null; }
  };

  try {
    const secret = await getWebhookSecret();
    if (!secret) {
      await insertLog("error", "Webhook nuk është konfiguruar");
      res.status(503).json({ error: "Webhook nuk është aktivizuar" });
      return;
    }

    const provided =
      req.headers["x-webhook-secret"] ||
      req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "") ||
      req.body?.webhook_secret;

    if (!provided || provided !== secret) {
      await insertLog("unauthorized", "Çelës sekret i gabuar");
      res.status(401).json({ error: "Çelës sekret i pavlefshëm" });
      return;
    }

    const body = req.body as Record<string, any>;

    const flightId: number | null = body.flight_id ? Number(body.flight_id) : null;
    if (!flightId) {
      await insertLog("error", "flight_id mungon ose është i pavlefshëm");
      res.status(400).json({ error: "flight_id është i detyrueshëm" });
      return;
    }

    const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, flightId));
    if (!flight) {
      await insertLog("error", `Fluturimi me id ${flightId} nuk u gjet`);
      res.status(404).json({ error: `Fluturimi me id ${flightId} nuk ekziston` });
      return;
    }

    const customerName = body.customer_name || body.customerName || "I panjohur";
    const customerEmail = body.customer_email || body.customerEmail || null;
    const customerPhone = body.customer_phone || body.customerPhone || null;
    const totalAmount = String(body.total_amount ?? body.totalAmount ?? "0");
    const paidAmount = String(body.paid_amount ?? body.paidAmount ?? "0");
    const netPrice = body.net_price ?? body.netPrice ? String(body.net_price ?? body.netPrice) : null;
    const markup = String(body.markup ?? "0");
    const pnr = body.pnr ?? null;
    const notes = body.notes ?? null;
    const status = body.status ?? "confirmed";
    const agentId = body.agent_id ? Number(body.agent_id) : null;

    let bookingRef = body.booking_ref || body.bookingRef || null;
    if (!bookingRef) bookingRef = generateRef();

    const [booking] = await db.insert(bookingsTable).values({
      bookingRef,
      flightId,
      agentId,
      customerName,
      customerEmail,
      customerPhone,
      status,
      totalAmount,
      paidAmount,
      netPrice,
      markup,
      commission: "0",
      pnr,
      notes: notes ? `[Webhook] ${notes}` : "[Webhook] Importuar automatikisht",
    }).returning();

    const passengersRaw: any[] = body.passengers ?? body.pax ?? [];
    for (const p of passengersRaw) {
      await db.insert(passengersTable).values({
        bookingId: booking.id,
        type: p.type ?? "adult",
        firstName: normalizeFirstName(p.first_name ?? p.firstName ?? p.name?.split(" ")[0] ?? "Pa emër"),
        lastName: normalizeLastName(p.last_name ?? p.lastName ?? p.name?.split(" ").slice(1).join(" ") ?? ""),
        dateOfBirth: p.date_of_birth ?? p.dateOfBirth ?? null,
        nationality: p.nationality ?? null,
        passportNumber: p.passport_number ?? p.passportNumber ?? null,
        passportExpiry: p.passport_expiry ?? p.passportExpiry ?? null,
        seatNumber: p.seat_number ?? p.seatNumber ?? null,
        baggageOption: p.baggage_option ?? p.baggageOption ?? null,
        extraCost: String(p.extra_cost ?? p.extraCost ?? "0"),
      });
    }

    await db.insert(bookingChangeLogsTable).values({
      bookingId: booking.id,
      userId: null,
      userName: body.source ?? "Webhook",
      userRole: "webhook",
      action: "created",
      newValue: String(booking.status),
      note: `Rezervim i importuar nga webhook (${body.source ?? "external"})`,
    });

    // Kontroll automatik: pasagjer i dyfishtë në fluturim identik → task automatik.
    void checkDuplicatePassengerTask(booking.id);

    logId = await insertLog("success", undefined, booking.id, bookingRef);

    res.status(201).json({
      success: true,
      booking_id: booking.id,
      booking_ref: bookingRef,
      flight: { id: flight.id, origin: flight.fromCity, destination: flight.toCity },
      passengers_created: passengersRaw.length,
    });

  } catch (err: any) {
    await insertLog("error", err?.message ?? "Gabim i brendshëm");
    res.status(500).json({ error: "Gabim gjatë procesimit të webhook-ut" });
  }
});

export { router as webhookRouter };
