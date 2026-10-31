import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { kyteSandboxSessionFingerprint, sealKyteSandboxBookingToken } from "../lib/kyteSandboxBookingToken";

export const kyteSearchRouter: IRouter = Router();

const KYTE_SANDBOX_URL = "https://api.sandbox.gokyte.com/api/v3/flights/shop";
const KYTE_SANDBOX_BOOK_URL = "https://api.sandbox.gokyte.com/api/v3/flights/book";
const SEARCH_TIMEOUT_MS = 45_000;
const MAX_PASSENGERS = 9;

// Keep the authorization attached to this route so it cannot be mounted unprotected.
export function requireKyteAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as typeof req.session & { source?: string };
  if (!session?.role || !["admin", "manager", "agent_staff"].includes(session.role) || session.source === "be") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  next();
}

type SearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  childAges: number[];
  infantAges: number[];
  nonStop: boolean;
};

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseSearch(body: unknown): { value?: SearchInput; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Kërkesë e pavlefshme." };
  const input = body as Record<string, unknown>;
  const origin = typeof input.origin === "string" ? input.origin.trim().toUpperCase() : "";
  const destination = typeof input.destination === "string" ? input.destination.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) {
    return { error: "Zgjidh dy kode të ndryshme aeroportesh me nga 3 shkronja." };
  }
  if (!validDate(input.departureDate)) return { error: "Data e nisjes nuk është e vlefshme." };
  const returnDate = input.returnDate === "" || input.returnDate == null ? undefined : input.returnDate;
  if (returnDate !== undefined && (!validDate(returnDate) || returnDate < input.departureDate)) {
    return { error: "Data e kthimit duhet të jetë e vlefshme dhe jo para nisjes." };
  }
  const adults = input.adults;
  const childAges = input.childAges ?? [];
  const infantAges = input.infantAges ?? [];
  if (!Number.isInteger(adults) || (adults as number) < 1 ||
      !Array.isArray(childAges) || !childAges.every(age => Number.isInteger(age) && age >= 2 && age <= 17) ||
      !Array.isArray(infantAges) || !infantAges.every(age => Number.isInteger(age) && age >= 0 && age <= 1)) {
    return { error: "Vendos numrin e të rriturve dhe moshën e çdo fëmije/foshnje." };
  }
  if ((adults as number) + childAges.length + infantAges.length > MAX_PASSENGERS ||
      infantAges.length > (adults as number)) {
    return { error: "Lejohen deri në 9 pasagjerë dhe jo më shumë foshnje se të rritur." };
  }
  if (input.nonStop !== undefined && typeof input.nonStop !== "boolean") {
    return { error: "Filtri i fluturimeve direkte nuk është i vlefshëm." };
  }
  return {
    value: {
      origin, destination, departureDate: input.departureDate,
      returnDate: returnDate as string | undefined,
      adults: adults as number, childAges, infantAges,
      nonStop: input.nonStop === true,
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function providerMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 15).map(item => {
    const data = record(item);
    return text(data?.message) || text(data?.detail) || text(data?.code) || (typeof item === "string" ? item : "Njoftim nga Kyte");
  }).map(message => message.slice(0, 300));
}

function normalizeResponse(
  raw: unknown,
  searchedAt: string,
  bookingContext: { userId: number; sessionFingerprint: string; signingSecret: string; transactionId: string; passengerCount: number },
) {
  const data = record(raw);
  const offers = record(data?.offers);
  const solutions = record(data?.flightSolutions);
  if (!data || !offers || !solutions) throw new Error("Kyte returned an unexpected search response");

  const normalized = Object.values(offers).map(value => {
    const offer = record(value);
    const currency = record(offer?.currency);
    if (!offer || typeof offer.id !== "string" || !Array.isArray(offer.flightSolutions) ||
        typeof offer.totalPrice !== "number" || !Number.isFinite(offer.totalPrice) ||
        !Number.isSafeInteger(offer.totalPrice) || offer.totalPrice < 0 ||
        !currency || typeof currency.code !== "string" ||
        !/^[A-Z]{3}$/.test(currency.code) ||
        typeof currency.decimals !== "number" ||
        !Number.isInteger(currency.decimals) || currency.decimals < 0 || currency.decimals > 6) {
      throw new Error("Kyte returned an invalid offer");
    }
    const journeys = offer.flightSolutions.map(id => {
      const solution = record(solutions[text(id)]);
      if (!solution || !Array.isArray(solution.segments)) {
        throw new Error("Kyte returned a missing flight solution");
      }
      const segments = solution.segments.map(value => {
        const segment = record(value);
        const departure = record(segment?.departure);
        const arrival = record(segment?.arrival);
        const marketingCarrier = record(segment?.marketingCarrier);
        const departureAirport = record(departure?.airport);
        const arrivalAirport = record(arrival?.airport);
        if (!segment || !departure || !arrival || !departureAirport || !arrivalAirport) {
          throw new Error("Kyte returned an invalid flight segment");
        }
        return {
          flightNumber: `${text(marketingCarrier?.code)}${text(segment.flightNumber)}`,
          carrier: text(marketingCarrier?.name) || text(marketingCarrier?.code),
          departure: { airport: text(departureAirport.code), date: text(departure.date), time: text(departure.time) },
          arrival: { airport: text(arrivalAirport.code), date: text(arrival.date), time: text(arrival.time) },
        };
      });
      return {
        segments,
        totalDurationMinutes: typeof solution.totalDuration === "number" ? solution.totalDuration : null,
      };
    });
    const offerPassengers = Array.isArray(offer.passengers) ? offer.passengers : [];
    const passengerBindings = offerPassengers.map(value => {
      const passenger = record(value);
      return {
        id: text(passenger?.id),
        type: text(passenger?.type),
      };
    });
    const passengerSlots = offerPassengers.map(value => {
      const passenger = record(value);
      const age = passenger?.age;
      return {
        id: text(passenger?.id),
        type: text(passenger?.type),
        ...(typeof age === "number" && Number.isSafeInteger(age) && age >= 0 && age <= 120
          ? { age }
          : {}),
      };
    });
    const offerExpiry = Date.parse(text(offer.expiration));
    const providerExpiresAt = Number.isFinite(offerExpiry) ? new Date(offerExpiry).toISOString() : null;
    const hasValidPassengerBindings = passengerBindings.length === bookingContext.passengerCount &&
      passengerBindings.every(passenger => passenger.id.length > 0 && passenger.type.length > 0) &&
      new Set(passengerBindings.map(passenger => passenger.id)).size === passengerBindings.length &&
      providerExpiresAt !== null && Date.parse(providerExpiresAt) > Date.now();
    const bookingToken = hasValidPassengerBindings && providerExpiresAt
      ? sealKyteSandboxBookingToken({
          version: 1,
          userId: bookingContext.userId,
          sessionFingerprint: bookingContext.sessionFingerprint,
          offerId: offer.id,
          transactionId: bookingContext.transactionId,
          passengers: passengerBindings,
          priceMinor: offer.totalPrice,
          currencyCode: currency.code,
          currencyDecimals: currency.decimals,
          expiresAt: providerExpiresAt,
        }, bookingContext.signingSecret)
      : null;
    return {
      id: offer.id,
      airline: text(offer.owner) || text(record(offer.owner)?.name) ||
        text(record(offer.owner)?.code) || journeys[0]?.segments[0]?.carrier || "",
      priceMinor: offer.totalPrice,
      currency: { code: currency.code, decimals: currency.decimals },
      expiresAt: providerExpiresAt,
      bookingToken,
      bookingTokenExpiresAt: bookingToken ? providerExpiresAt : null,
      passengerSlots,
      journeys,
    };
  });
  return {
    offers: normalized,
    warnings: providerMessages(data.warnings),
    errors: providerMessages(data.errors),
    searchedAt,
  };
}

kyteSearchRouter.post("/kyte/search", requireKyteAdmin, async (req, res): Promise<void> => {
  const parsed = parseSearch(req.body);
  if (!parsed.value) { res.status(400).json({ error: parsed.error }); return; }
  const sessionSecret = process.env.SESSION_SECRET;
  const apiKey = process.env.KYTE_SANDBOX_API_KEY;
  if (!sessionSecret || sessionSecret.length < 16 || !apiKey || apiKey.length < 16) {
    res.status(503).json({ error: "Nuk është konfiguruar çelësi i sigurt për rezervimet Kyte Sandbox." });
    return;
  }
  // Both independent server-only secrets contribute to the short-lived token key.
  const signingSecret = `${sessionSecret}\0${apiKey}`;
  const session = req.session as typeof req.session & { userId?: number | string };
  const userId = Number(session.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(403).json({ error: "Sesioni administrativ nuk ka një identifikues të vlefshëm." });
    return;
  }

  const input = parsed.value;
  const journeys = [
    { departureAirport: input.origin, arrivalAirport: input.destination, date: { main: input.departureDate } },
    ...(input.returnDate
      ? [{ departureAirport: input.destination, arrivalAirport: input.origin, date: { main: input.returnDate } }]
      : []),
  ];
  const passengers = [
    ...Array.from({ length: input.adults }, () => ({})),
    ...input.childAges.map(age => ({ age })),
    ...input.infantAges.map(age => ({ age })),
  ];
  const transactionId = randomUUID();
  try {
    const response = await fetch(KYTE_SANDBOX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-request-id": randomUUID(),
        "x-transaction-id": transactionId,
      },
      body: JSON.stringify({
        journeys, passengers,
        exactMatch: true, nonStopFlight: input.nonStop,
        cabinType: "economy", flexibility: "lowest", fareType: "public",
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      req.log.warn({ status: response.status, transactionId }, "Kyte sandbox search failed");
      const message = response.status === 403
        ? "Kyte Sandbox nuk lejon akses nga ky server (403). Kontrollo aktivizimin e çelësit dhe IP-në e lejuar te Kyte."
        : response.status === 401
          ? "Kyte Sandbox nuk e pranoi çelësin API (401)."
          : `Kyte refuzoi kërkimin (statusi ${response.status}). Provo aeroportet ose datën tjetër.`;
      res.status(502).json({ error: message });
      return;
    }
    const result = normalizeResponse(await response.json(), new Date().toISOString(), {
      userId,
      sessionFingerprint: kyteSandboxSessionFingerprint(req.sessionID, signingSecret),
      signingSecret,
      transactionId,
      passengerCount: passengers.length,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, transactionId }, "Kyte sandbox search error");
    const timeout = error instanceof Error && error.name === "TimeoutError";
    res.status(timeout ? 504 : 502).json({
      error: timeout ? "Kërkimi në Kyte zgjati shumë. Provo sërish." : "Nuk u mor përgjigje e vlefshme nga Kyte. Provo sërish.",
    });
  }
});