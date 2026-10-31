import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { db, kyteSandboxBookingsTable } from "@workspace/db";
import { kyteSandboxSessionFingerprint, openKyteSandboxBookingToken } from "../lib/kyteSandboxBookingToken";
import { requireKyteAdmin } from "./kyteSearch";

export const kyteSandboxBookingsRouter: IRouter = Router();

const KYTE_SANDBOX_BOOK_URL = "https://api.sandbox.gokyte.com/api/v3/flights/book";
const BOOKING_TIMEOUT_MS = 45_000;
const STALE_CREATING_MS = BOOKING_TIMEOUT_MS + 15_000;
const MAX_BOOKINGS_PER_PAGE = 50;

type Address = {
  addressLines: string[];
  city: string;
  stateProvinceCode?: string;
  postalCode?: string;
  countryCode: string;
  languageCode?: string;
};

type BookingPassengerInput = {
  firstName: string;
  lastName: string;
  title: string;
  gender: string;
  dateOfBirth?: string;
  contactInformation?: {
    email: string;
    phone: { countryCode: string; number: string };
    address?: Address;
  };
};

type BookingInput = {
  bookingToken: string;
  passengers: BookingPassengerInput[];
  address?: Address;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    date.getTime() <= Date.now();
}

function parseAddress(value: unknown): Address | null | undefined {
  if (value === undefined || value === null) return undefined;
  const address = record(value);
  if (!address || !Array.isArray(address.addressLines) ||
      address.addressLines.length < 1 || address.addressLines.length > 4 ||
      !address.addressLines.every(line => boundedText(line, 120)) ||
      !boundedText(address.city, 100) ||
      typeof address.countryCode !== "string" || !/^[A-Za-z]{2}$/.test(address.countryCode)) {
    return null;
  }
  const stateProvinceCode = address.stateProvinceCode == null || address.stateProvinceCode === ""
    ? undefined : boundedText(address.stateProvinceCode, 20);
  const postalCode = address.postalCode == null || address.postalCode === ""
    ? undefined : boundedText(address.postalCode, 24);
  const languageCode = address.languageCode == null || address.languageCode === ""
    ? undefined : boundedText(address.languageCode, 10);
  if ((address.stateProvinceCode != null && address.stateProvinceCode !== "" && !stateProvinceCode) ||
      (address.postalCode != null && address.postalCode !== "" && !postalCode) ||
      (address.languageCode != null && address.languageCode !== "" && !languageCode)) {
    return null;
  }
  return {
    addressLines: address.addressLines as string[],
    city: address.city as string,
    countryCode: address.countryCode.toUpperCase(),
    ...(stateProvinceCode ? { stateProvinceCode } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(languageCode ? { languageCode } : {}),
  };
}

function parseBookingInput(body: unknown): { value?: BookingInput; error?: string } {
  const input = record(body);
  if (!input) return { error: "Kërkesa për rezervim nuk është e vlefshme." };
  if (typeof input.bookingToken !== "string" || input.bookingToken.length < 32 ||
      input.bookingToken.length > 16_384) {
    return { error: "Shenja e ofertës Kyte mungon ose është e pavlefshme." };
  }
  if (!Array.isArray(input.passengers) || input.passengers.length < 1 || input.passengers.length > 9) {
    return { error: "Shtoni të dhënat e vlefshme për çdo pasagjer." };
  }

  const passengers: BookingPassengerInput[] = [];
  for (let index = 0; index < input.passengers.length; index += 1) {
    const passenger = record(input.passengers[index]);
    if (!passenger) return { error: `Të dhënat e pasagjerit ${index + 1} nuk janë të vlefshme.` };
    const firstName = boundedText(passenger.firstName, 100);
    const lastName = boundedText(passenger.lastName, 100);
    const title = boundedText(passenger.title, 24);
    const gender = boundedText(passenger.gender, 24);
    if (!firstName || !lastName || !title || !gender) {
      return { error: `Plotësoni emrin, mbiemrin, titullin dhe gjininë për pasagjerin ${index + 1}.` };
    }

    let dateOfBirth: string | undefined;
    if (passenger.dateOfBirth != null && passenger.dateOfBirth !== "") {
      if (!validCalendarDate(passenger.dateOfBirth)) {
        return { error: `Datëlindja e pasagjerit ${index + 1} nuk është e vlefshme.` };
      }
      dateOfBirth = passenger.dateOfBirth;
    }

    let contactInformation: BookingPassengerInput["contactInformation"];
    if (index === 0) {
      const contact = record(passenger.contactInformation);
      const email = boundedText(contact?.email, 254);
      const phone = record(contact?.phone);
      const rawCountryCode = boundedText(phone?.countryCode, 6);
      const rawPhoneNumber = boundedText(phone?.number, 32);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
          !rawCountryCode || !/^\+?[0-9]{1,4}$/.test(rawCountryCode) ||
          !rawPhoneNumber || !/^[0-9+().\-\s]{5,32}$/.test(rawPhoneNumber)) {
        return { error: "Vendosni email-in dhe numrin e vlefshëm të kontaktit për pasagjerin kryesor." };
      }
      const rawAddress = contact?.address ?? input.address;
      const address = parseAddress(rawAddress);
      if (rawAddress != null && !address) {
        return { error: "Adresa e kontaktit nuk është e vlefshme." };
      }
      const phoneNumber = rawPhoneNumber.replace(/[+().\-\s]/g, "");
      if (phoneNumber.replace(/\D/g, "").length < 5) {
        return { error: "Numri i kontaktit nuk është i vlefshëm." };
      }
      contactInformation = {
        email,
        phone: {
          countryCode: rawCountryCode.replace(/^\+/, ""),
          number: phoneNumber,
        },
        ...(address ? { address } : {}),
      };
    } else if (passenger.contactInformation != null) {
      return { error: "Të dhënat e kontaktit jepen vetëm për pasagjerin kryesor." };
    }

    passengers.push({
      firstName,
      lastName,
      title,
      gender,
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(contactInformation ? { contactInformation } : {}),
    });
  }
  return {
    value: {
      bookingToken: input.bookingToken,
      passengers,
      ...(passengers[0].contactInformation?.address
        ? { address: passengers[0].contactInformation.address }
        : {}),
    },
  };
}

function publicBooking(row: typeof kyteSandboxBookingsTable.$inferSelect) {
  return {
    id: row.id,
    offerId: row.offerId,
    status: row.status,
    providerBookingId: row.providerBookingId,
    providerStatus: row.providerStatus,
    offerPriceMinor: row.offerPriceMinor,
    currencyCode: row.providerCurrency ?? row.currencyCode,
    currencyDecimals: row.currencyDecimals,
    totalCost: row.providerTotalCost,
    currentBalance: row.providerCurrentBalance,
    ticketTimeLimit: row.ticketTimeLimit?.toISOString() ?? null,
    paid: false as const,
    message: row.safeMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function safeStatusMessage(status: number): string {
  if (status === 401 || status === 403) return "Kyte Sandbox nuk e pranoi konfigurimin e aksesit.";
  if (status === 404) return "Oferta Kyte nuk është më e disponueshme. Kryeni kërkim të ri.";
  return "Kyte refuzoi të dhënat e rezervimit. Kontrolloni emrin, datëlindjen dhe informacionin e kontaktit.";
}

function finiteDecimal(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  const integerPart = text.split(".")[0] ?? "";
  return text.length <= 32 && integerPart.length <= 14 &&
    /^\d+(?:\.\d{1,4})?$/.test(text) ? text : null;
}

const SAFE_PROVIDER_STATUSES = [
  "notTicketed", "not_ticketed", "created", "booked", "confirmed",
  "pending", "unconfirmed", "ticketed", "issued", "inProgress",
  "in_progress", "failed", "cancelled",
];

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function settleStaleIntent(
  row: typeof kyteSandboxBookingsTable.$inferSelect,
): Promise<typeof kyteSandboxBookingsTable.$inferSelect> {
  if (row.status !== "creating" || Date.now() - row.updatedAt.getTime() < STALE_CREATING_MS) return row;
  const [updated] = await db.update(kyteSandboxBookingsTable)
    .set({
      status: "unknown",
      safeMessage: "Përpjekja u ndërpre para se të regjistrohej përgjigjja e Kyte. Nuk do të ridërgohet automatikisht.",
      updatedAt: new Date(),
    })
    .where(and(eq(kyteSandboxBookingsTable.id, row.id), eq(kyteSandboxBookingsTable.status, "creating")))
    .returning();
  return updated ?? row;
}

function signedInAdminId(req: Request): number | null {
  const session = req.session as typeof req.session & { userId?: number | string };
  const userId = Number(session.userId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

kyteSandboxBookingsRouter.post("/kyte/sandbox/book", requireKyteAdmin, async (req, res): Promise<void> => {
  const parsed = parseBookingInput(req.body);
  if (!parsed.value) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const actorUserId = signedInAdminId(req);
  if (!actorUserId) {
    res.status(403).json({ error: "Sesioni administrativ nuk ka një identifikues të vlefshëm." });
    return;
  }
  const sessionSecret = process.env.SESSION_SECRET;
  const apiKey = process.env.KYTE_SANDBOX_API_KEY;
  if (!sessionSecret || sessionSecret.length < 16 || !apiKey || apiKey.length < 16) {
    res.status(503).json({ error: "Nuk është konfiguruar çelësi i sigurt për rezervimet Kyte Sandbox." });
    return;
  }
  const signingSecret = `${sessionSecret}\0${apiKey}`;
  const token = openKyteSandboxBookingToken(parsed.value.bookingToken, signingSecret);
  if (!token || token.userId !== actorUserId ||
      token.sessionFingerprint !== kyteSandboxSessionFingerprint(req.sessionID, signingSecret)) {
    res.status(400).json({ error: "Shenja e ofertës është e pavlefshme ose i përket një përdoruesi tjetër." });
    return;
  }

  const intent = and(
    eq(kyteSandboxBookingsTable.transactionId, token.transactionId),
    eq(kyteSandboxBookingsTable.offerId, token.offerId),
  );
  const [existing] = await db.select().from(kyteSandboxBookingsTable).where(intent).limit(1);
  if (existing) {
    const settled = await settleStaleIntent(existing);
    res.setHeader("Cache-Control", "no-store");
    res.status(settled.status === "creating" ? 202 : 200).json(publicBooking(settled));
    return;
  }
  if (Date.parse(token.expiresAt) <= Date.now()) {
    res.status(410).json({ error: "Oferta Kyte ka skaduar. Kryeni kërkim të ri për të shmangur rezervimin e një çmimi të vjetër." });
    return;
  }
  if (token.passengers.length !== parsed.value.passengers.length) {
    res.status(400).json({ error: "Numri i pasagjerëve nuk përputhet me ofertën e zgjedhur." });
    return;
  }

  const id = randomUUID();
  const [claimed] = await db.insert(kyteSandboxBookingsTable).values({
    id,
    actorUserId,
    offerId: token.offerId,
    transactionId: token.transactionId,
    currencyCode: token.currencyCode,
    currencyDecimals: token.currencyDecimals,
    offerPriceMinor: String(token.priceMinor),
    status: "creating",
  }).onConflictDoNothing({
    target: [kyteSandboxBookingsTable.transactionId, kyteSandboxBookingsTable.offerId],
  }).returning();

  if (!claimed) {
    const [raced] = await db.select().from(kyteSandboxBookingsTable).where(intent).limit(1);
    if (!raced) {
      res.status(409).json({ error: "Nuk u arrit të sigurohej tentativa e rezervimit. Provojeni përsëri pas pak." });
      return;
    }
    const settled = await settleStaleIntent(raced);
    res.setHeader("Cache-Control", "no-store");
    res.status(settled.status === "creating" ? 202 : 200).json(publicBooking(settled));
    return;
  }

  const providerPassengers = parsed.value.passengers.map((passenger, index) => ({
    id: token.passengers[index].id,
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    title: passenger.title.toLowerCase(),
    gender: passenger.gender.toLowerCase(),
    ...(passenger.dateOfBirth ? { dateOfBirth: passenger.dateOfBirth } : {}),
    ...(index === 0 && passenger.contactInformation
      ? {
          contactInformation: {
            email: passenger.contactInformation.email,
            phone: [{
              countryCode: passenger.contactInformation.phone.countryCode,
              number: passenger.contactInformation.phone.number,
              type: "Mobile",
            }],
          },
        }
      : {}),
  }));

  let finalRow: typeof kyteSandboxBookingsTable.$inferSelect;
  try {
    const response = await fetch(KYTE_SANDBOX_BOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-request-id": randomUUID(),
        "x-transaction-id": token.transactionId,
      },
      body: JSON.stringify({
        offerIds: [token.offerId],
        passengers: providerPassengers,
        ...(parsed.value.address ? { address: parsed.value.address } : {}),
        languageCode: parsed.value.address?.languageCode ?? "en",
      }),
      signal: AbortSignal.timeout(BOOKING_TIMEOUT_MS),
    });
    const providerData = record(await response.json().catch(() => null));
    // The current Kyte Book Flights response names its booking reference "id";
    // accept bookingId as well for compatible Sandbox response variants.
    const rawBookingId = providerData?.id ?? providerData?.bookingId;
    const bookingId = typeof rawBookingId === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(rawBookingId)
      ? rawBookingId
      : null;
    const rawProviderStatus = providerData?.ticketStatus ?? providerData?.status;
    const providerStatus = typeof rawProviderStatus === "string"
      ? SAFE_PROVIDER_STATUSES.find(status => status.toLowerCase() === rawProviderStatus.toLowerCase()) ?? null
      : null;
    const ticketTimeLimitValue = providerData?.ticketTimeLimit;
    const ticketTimeLimit = typeof ticketTimeLimitValue === "string" &&
      Number.isFinite(Date.parse(ticketTimeLimitValue))
      ? new Date(ticketTimeLimitValue)
      : null;
    const providerTotalCost = finiteDecimal(providerData?.totalCost);
    const providerCurrentBalance = finiteDecimal(providerData?.currentBalance);
    const rawProviderCurrency = record(providerData?.currency)?.code ?? providerData?.currency;
    const providerCurrency = typeof rawProviderCurrency === "string" &&
      /^[A-Z]{3}$/.test(rawProviderCurrency)
      ? rawProviderCurrency
      : null;

    let status: "created" | "failed" | "unknown";
    let message: string | null = null;
    if (bookingId && response.ok && providerStatus === "notTicketed") {
      status = "created";
    } else if (bookingId) {
      status = "unknown";
      message = "Kyte ktheu një referencë, por nuk konfirmoi gjendjen pa biletë. Verifikojeni në Kyte; kërkesa nuk do të ridërgohet automatikisht.";
    } else if ([400, 401, 403, 404, 422].includes(response.status)) {
      status = "failed";
      message = safeStatusMessage(response.status);
    } else {
      // Kyte can report booking errors with HTTP 200. Without a confirmed ID,
      // do not assume no booking was created and never automatically retry.
      status = "unknown";
      message = "Kyte nuk konfirmoi identifikuesin e rezervimit. Gjendja është e panjohur dhe kërkesa nuk do të ridërgohet automatikisht.";
    }

    const [updated] = await db.update(kyteSandboxBookingsTable)
      .set({
        status,
        providerBookingId: bookingId,
        providerStatus,
        providerTotalCost,
        providerCurrentBalance,
        providerCurrency,
        ticketTimeLimit,
        safeMessage: message,
        updatedAt: new Date(),
      })
      .where(and(eq(kyteSandboxBookingsTable.id, claimed.id), eq(kyteSandboxBookingsTable.status, "creating")))
      .returning();
    if (!updated) throw new Error("Kyte sandbox booking outcome was not persisted");
    finalRow = updated;
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    const message = timeout
      ? "Kyte nuk dha përgjigje brenda afatit. Gjendja është e panjohur dhe kërkesa nuk do të ridërgohet automatikisht."
      : "Nuk u konfirmua përgjigjja e Kyte. Gjendja është e panjohur dhe kërkesa nuk do të ridërgohet automatikisht.";
    req.log.error({
      errorName: error instanceof Error ? error.name : "UnknownError",
      attemptId: claimed.id,
      transactionId: token.transactionId,
    }, "Kyte Sandbox booking result is unknown");
    const [updated] = await db.update(kyteSandboxBookingsTable)
      .set({ status: "unknown", safeMessage: message, updatedAt: new Date() })
      .where(and(eq(kyteSandboxBookingsTable.id, claimed.id), eq(kyteSandboxBookingsTable.status, "creating")))
      .returning();
    finalRow = updated ?? {
      ...claimed,
      status: "unknown",
      safeMessage: message,
      updatedAt: new Date(),
    };
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(publicBooking(finalRow));
});

kyteSandboxBookingsRouter.get("/kyte/sandbox/bookings", requireKyteAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(kyteSandboxBookingsTable)
    .orderBy(desc(kyteSandboxBookingsTable.createdAt))
    .limit(MAX_BOOKINGS_PER_PAGE);
  const settled = await Promise.all(rows.map(settleStaleIntent));
  res.setHeader("Cache-Control", "no-store");
  res.json({ bookings: settled.map(publicBooking) });
});

kyteSandboxBookingsRouter.get("/kyte/sandbox/bookings/:id", requireKyteAdmin, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!validUuid(id)) {
    res.status(400).json({ error: "Identifikuesi i rezervimit nuk është i vlefshëm." });
    return;
  }
  const [row] = await db.select().from(kyteSandboxBookingsTable)
    .where(eq(kyteSandboxBookingsTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Rezervimi provë nuk u gjet." });
    return;
  }
  const settled = await settleStaleIntent(row);
  res.setHeader("Cache-Control", "no-store");
  res.json(publicBooking(settled));
});