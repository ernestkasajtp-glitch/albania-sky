export type SeatCheckStateInput = {
  status: string;
  seatMissCount: number | null | undefined;
  available: boolean;
  valid: boolean;
  autoSoldOut: boolean;
  excluded: boolean;
  minSeats: number;
  threshold: number;
  checkedAt: Date;
  googlePrice: number | null;
};

export const SEAT_MISS_THRESHOLD = 3;

export type SeatCheckSkipReason = "identity_changed" | "outside_window" | "stale_result";

export type SeatCheckFlightSnapshot = {
  fromCity: string;
  toCity: string;
  departureDate: string;
  flightNumber: string;
  windowStart: string;
  windowEnd: string;
  requestStartedAt: Date;
};

export type SeatCheckCurrentFlight = {
  fromCity: string;
  toCity: string;
  departureDate: string;
  flightNumber: string;
  seatCheckedAt: Date | null;
};

function identityPart(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase().trim();
}

/**
 * Guard a delayed Google observation against a row that was edited or
 * superseded while the upstream request was in flight.
 */
export function seatCheckSkipReason(
  current: SeatCheckCurrentFlight,
  snapshot: SeatCheckFlightSnapshot,
): SeatCheckSkipReason | null {
  if (
    identityPart(current.fromCity) !== identityPart(snapshot.fromCity) ||
    identityPart(current.toCity) !== identityPart(snapshot.toCity) ||
    identityPart(current.flightNumber) !== identityPart(snapshot.flightNumber) ||
    current.departureDate !== snapshot.departureDate
  ) {
    return "identity_changed";
  }
  if (current.departureDate < snapshot.windowStart || current.departureDate > snapshot.windowEnd) {
    return "outside_window";
  }
  // A result already committed after this request began belongs to a newer
  // overlapping check. Do not let an old in-flight response count again.
  if (current.seatCheckedAt && current.seatCheckedAt.getTime() > snapshot.requestStartedAt.getTime()) {
    return "stale_result";
  }
  return null;
}

export type SeatCheckStateUpdate = {
  counted: boolean;
  seatAlert: string | null;
  seatAlertDetail: string | null;
  seatMissCount: number;
  seatMissLastAt: Date | null;
  seatGooglePrice: number | null;
  status: string;
  oldStatus: string;
  transitionedToSoldOut: boolean;
};

/**
 * Apply one validated Google seat observation to the stored state.
 *
 * This is intentionally a small, side-effect-free state transition. The
 * database writer wraps it in a row-locking transaction so automatic and
 * manual checks cannot overwrite one another's counter.
 */
export function deriveSeatCheckState(input: SeatCheckStateInput): SeatCheckStateUpdate {
  const {
    status,
    seatMissCount,
    available,
    valid,
    autoSoldOut,
    excluded,
    minSeats,
    threshold,
    checkedAt,
    googlePrice,
  } = input;
  const oldCount = Math.max(0, Number.isFinite(Number(seatMissCount)) ? Number(seatMissCount) : 0);

  if (!valid) {
    return {
      counted: false,
      seatAlert: null,
      seatAlertDetail: null,
      seatMissCount: oldCount,
      seatMissLastAt: null,
      seatGooglePrice: null,
      status,
      oldStatus: status,
      transitionedToSoldOut: false,
    };
  }

  if (available) {
    return {
      counted: true,
      seatAlert: null,
      seatAlertDetail: null,
      seatMissCount: 0,
      seatMissLastAt: null,
      seatGooglePrice: googlePrice,
      status,
      oldStatus: status,
      transitionedToSoldOut: false,
    };
  }

  // Once the threshold is reached the counter stays truthful at 3/3. This is
  // especially important for excluded flights, which continue to be checked
  // but are intentionally protected from the status transition.
  const nextCount = Math.min(threshold, oldCount + 1);
  const canTransition =
    autoSoldOut &&
    !excluded &&
    status !== "soldout" &&
    status !== "cancelled" &&
    nextCount >= threshold;

  return {
    counted: true,
    seatAlert: "low_seats",
    seatAlertDetail: `Nuk ka ${minSeats} vende në Google`,
    seatMissCount: nextCount,
    seatMissLastAt: checkedAt,
    seatGooglePrice: googlePrice,
    status: canTransition ? "soldout" : status,
    oldStatus: status,
    transitionedToSoldOut: canTransition,
  };
}