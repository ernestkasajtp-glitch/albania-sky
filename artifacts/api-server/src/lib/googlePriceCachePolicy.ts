import { fullGoogleSchedule, type GoogleSchedule } from "./googleScheduleEvidence.js";

export type GooglePriceState = {
  price: number | null;
  routePrice: number | null;
  specific: boolean;
  stale: boolean;
};

type CachedPrice = {
  price: number | string | null;
  routePrice?: number | string | null;
  specific?: boolean;
  stale?: boolean;
};

function positivePrice(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

// Only the latest successful search supplies a current price. History is never
// a fallback: a valid empty search is verified/no-price, a failure is unverified.
export function computePriceWrite(
  fresh: { price: number | null; routePrice: number | null; specific: boolean; error?: boolean },
  // Accepted for existing callers; intentionally never used as a current price.
  _existingPrice?: number | null,
): GooglePriceState {
  if (fresh.error) return { price: null, routePrice: null, specific: false, stale: true };
  const price = positivePrice(fresh.price) ?? positivePrice(fresh.routePrice);
  return {
    price,
    routePrice: positivePrice(fresh.routePrice),
    specific: price != null && positivePrice(fresh.price) != null && fresh.specific,
    stale: false,
  };
}

export type GoogleScheduleAlertState = {
  scheduleAlert: string | null;
  scheduleAlertDetail: string | null;
  scheduleMissCount: number;
};

// Informational classification only: exact schedule without fare, changed
// schedule, or uncertain flight. No operational price/status/seat writes.
export function googleScheduleAlertForSearch(
  current: GoogleScheduleAlertState & GoogleSchedule,
  fresh: Parameters<typeof computePriceWrite>[0],
  schedule?: {
    googleCount: number;
    match: GoogleSchedule | null;
    missing?: boolean;
  },
): GoogleScheduleAlertState | null {
  const uncertain = (detail: string): GoogleScheduleAlertState => ({
    scheduleAlert: current.scheduleAlert === "time_changed" ? current.scheduleAlert : "price_retry",
    scheduleAlertDetail: current.scheduleAlert === "time_changed" ? current.scheduleAlertDetail : detail,
    scheduleMissCount: current.scheduleMissCount,
  });
  if (fresh.error) return uncertain("Kontrolli dështoi — gabim teknik, jo provë anulimi");
  const time = (value?: string | null) => {
    const m = value?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  };
  const dep = time(schedule?.match?.departureTime);
  const arr = time(schedule?.match?.arrivalTime);
  const oldDep = time(current.departureTime);
  const oldArr = time(current.arrivalTime);
  if (fullGoogleSchedule(schedule?.match) && dep && arr && oldDep && oldArr) {
    const match = schedule?.match;
    const dateChanged = fullGoogleSchedule(match) &&
      (match!.departureDate !== current.departureDate || match!.arrivalDate !== current.arrivalDate);
    if (dep !== oldDep || arr !== oldArr || dateChanged) return {
      scheduleAlert: "time_changed",
      scheduleAlertDetail: [
        fullGoogleSchedule(match)
          ? `Nisja ${current.departureDate} ${oldDep}→${match!.departureDate} ${dep}`
          : dep !== oldDep ? `Nisja ${oldDep}→${dep}` : "",
        fullGoogleSchedule(match)
          ? `Mbërritja ${current.arrivalDate} ${oldArr}→${match!.arrivalDate} ${arr}`
          : arr !== oldArr ? `Mbërritja ${oldArr}→${arr}` : "",
      ].filter(Boolean).join(", "),
      scheduleMissCount: 0,
    };
    // A route alternative's fare is not a fare for this exact flight.
    // A missing fare must never acknowledge an existing schedule notification.
    if (current.scheduleAlert === "time_changed") return {
      scheduleAlert: current.scheduleAlert, scheduleAlertDetail: current.scheduleAlertDetail,
      scheduleMissCount: 0,
    };
    const noExactFare = !(fresh.specific && fresh.price != null && fresh.price > 0);
    return {
      scheduleAlert: noExactFare ? "verified_no_price"
        : ["not_found", "verified_no_price", "price_retry"].includes(current.scheduleAlert ?? "") ? null : current.scheduleAlert,
      scheduleAlertDetail: noExactFare ? "Fluturimi u verifikua me të njëjtin kod dhe orare, por pa çmim"
        : ["not_found", "verified_no_price", "price_retry"].includes(current.scheduleAlert ?? "") ? null : current.scheduleAlertDetail,
      scheduleMissCount: 0,
    };
  }
  if (!schedule?.missing || (fresh.specific && fresh.price != null && fresh.price > 0)) {
    return uncertain("Pa rezultat të besueshëm të orarit — nuk është provë anulimi");
  }
  if (current.scheduleAlert === "time_changed") return {
    scheduleAlert: current.scheduleAlert, scheduleAlertDetail: current.scheduleAlertDetail,
    scheduleMissCount: current.scheduleMissCount + 1,
  };
  return {
    scheduleAlert: "not_found",
    scheduleAlertDetail: schedule?.googleCount
      ? "Nuk u gjet përputhje e plotë e fluturimit në Google"
      : "Pa rezultat të besueshëm — nuk është provë anulimi",
    scheduleMissCount: current.scheduleMissCount + 1,
  };
}

// Apply at every read boundary, including legacy rows that still retain a number
// alongside stale=true. Neither the old exact fare nor the old route fare leaks.
export function googlePriceResponse(row?: CachedPrice | null): GooglePriceState {
  if (row?.stale) return { price: null, routePrice: null, specific: false, stale: true };
  const price = positivePrice(row?.price);
  return {
    price,
    routePrice: positivePrice(row?.routePrice),
    specific: price != null && !!row?.specific,
    stale: false,
  };
}

// An existing exact-key row (even null or stale) is authoritative. Falling
// through it to an older route/DB row would resurrect a superseded price.
export function savedGooglePrice(
  specificRow?: CachedPrice | null,
  routeRow?: CachedPrice | null,
): number | null {
  return googlePriceResponse(specificRow ?? routeRow).price;
}

// A HTTP 200 is not necessarily a successful Google search. Both arrays must
// exist; genuinely empty arrays are a valid no-price result.
export function googleSearchItineraries(payload: unknown): Record<string, any>[] {
  if (!payload || typeof payload !== "object") throw new Error("Invalid Google search response");
  const body = payload as Record<string, any>;
  const applicationError = (value: Record<string, any>) =>
    value.success === false || value.status === false
    || (typeof value.status === "string" && /^(error|failed|failure)$/i.test(value.status))
    || (value.error != null && value.error !== false && value.error !== "")
    || (Array.isArray(value.errors) ? value.errors.length > 0 : !!value.errors);
  if (applicationError(body) || (body.data && applicationError(body.data))) {
    throw new Error("Google search returned an application error");
  }
  const itineraries = body.data?.itineraries;
  if (!Array.isArray(itineraries?.topFlights) || !Array.isArray(itineraries?.otherFlights)) {
    throw new Error("Google search response is missing itinerary arrays");
  }
  const all = [...itineraries.topFlights, ...itineraries.otherFlights].map(itinerary =>
    itinerary && typeof itinerary.price === "string" && itinerary.price.trim().toLowerCase() === "unavailable"
      ? { ...itinerary, price: null }
      : itinerary);
  if (all.some(itinerary => !itinerary || typeof itinerary !== "object" || Array.isArray(itinerary))) {
    throw new Error("Invalid Google itinerary");
  }
  if (all.some(itinerary => itinerary.price != null && (
    (typeof itinerary.price !== "number" && typeof itinerary.price !== "string")
    || !Number.isFinite(Number(itinerary.price))
  ))) throw new Error("Invalid Google itinerary price");
  return all;
}