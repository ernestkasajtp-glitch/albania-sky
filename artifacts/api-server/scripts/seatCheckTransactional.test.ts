import assert from "node:assert/strict";

// The production DB schema is not required for this integration-style test:
// the helper receives a transaction-compatible mock below.
process.env.DATABASE_URL ??= "postgres://seat-check-test.invalid/seat_check";
const { applySeatCheckResultTransaction: applySeatCheckResult } = await import("../src/lib/seatCheckTransaction.js");
const { settingsTable } = await import("@workspace/db");
let monitoringDisabled = false;
const settingRows = () => monitoringDisabled
  ? [{ key: "googleMonitoringDisabled.42", value: "true" }] : [];

const checkedAt = new Date("2026-09-01T10:01:00.000Z");
const current = {
  id: 42,
  fromCity: "TIA",
  toCity: "LON",
  departureDate: "2026-09-02",
  flightNumber: "W61234",
  excludeFromGoogleRule: true,
  status: "open",
  seatAlert: "low_seats",
  seatAlertDetail: "Nuk ka 5 vende në Google",
  seatMissCount: 2,
  seatMissLastAt: new Date("2026-09-01T10:00:00.000Z"),
  seatGooglePrice: "100",
  seatCheckedAt: new Date("2026-09-01T10:00:00.000Z"),
};

let updateValues: Record<string, unknown> | null = null;
let historyInsertCount = 0;
const tx = {
  select: () => ({
    from: (table: unknown) => table === settingsTable ? {
      where: async () => settingRows(),
    } : ({
      where: () => ({
        for: async () => [current],
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      updateValues = values;
      return {
        where: () => ({
          returning: async () => [{ ...current, ...values }],
        }),
      };
    },
  }),
  insert: () => ({
    values: async () => {
      historyInsertCount++;
    },
  }),
};
const fakeDb = {
  transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
};

const result = await applySeatCheckResult({
  flightId: current.id,
  available: false,
  minSeats: 5,
  autoSoldOut: true,
  checkedAt,
  googlePrice: null,
  snapshot: {
    fromCity: current.fromCity,
    toCity: current.toCity,
    departureDate: current.departureDate,
    flightNumber: current.flightNumber,
    windowStart: "2026-09-01",
    windowEnd: "2026-09-04",
    requestStartedAt: new Date("2026-09-01T10:00:30.000Z"),
  },
}, fakeDb as never);

assert.equal(result.applied, true);
assert.equal(result.seatMissCount, 3);
assert.equal(result.transitionedToSoldOut, false);
assert.equal(result.status, "open");
assert.equal(updateValues?.seatMissCount, 3);
assert.equal(updateValues?.status, undefined);
assert.equal(historyInsertCount, 0);

const transitionCurrent = { ...current, excludeFromGoogleRule: false };
const operations: string[] = [];
const transitionTx = {
  select: () => ({
    from: (table: unknown) => table === settingsTable ? {
      where: async () => settingRows(),
    } : ({
      where: () => ({
        for: async () => [transitionCurrent],
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      operations.push("status-update");
      return {
        where: () => ({
          returning: async () => [{ ...transitionCurrent, ...values }],
        }),
      };
    },
  }),
  insert: () => ({
    values: async () => {
      operations.push("history-insert");
    },
  }),
};
const transition = await applySeatCheckResult({
  flightId: transitionCurrent.id,
  available: false,
  minSeats: 5,
  autoSoldOut: true,
  checkedAt,
  googlePrice: null,
  snapshot: {
    fromCity: transitionCurrent.fromCity,
    toCity: transitionCurrent.toCity,
    departureDate: transitionCurrent.departureDate,
    flightNumber: transitionCurrent.flightNumber,
    windowStart: "2026-09-01",
    windowEnd: "2026-09-04",
    requestStartedAt: new Date("2026-09-01T10:00:30.000Z"),
  },
}, {
  transaction: async (callback: (transaction: typeof transitionTx) => Promise<unknown>) => callback(transitionTx),
} as never);
assert.equal(transition.transitionedToSoldOut, true);
assert.deepEqual(operations, ["status-update", "history-insert"]);

monitoringDisabled = true;
operations.length = 0;
const late = await applySeatCheckResult({
  flightId: transitionCurrent.id, available: false, minSeats: 5, autoSoldOut: true,
  checkedAt, googlePrice: null,
  snapshot: {
    fromCity: transitionCurrent.fromCity, toCity: transitionCurrent.toCity,
    departureDate: transitionCurrent.departureDate, flightNumber: transitionCurrent.flightNumber,
    windowStart: "2026-09-01", windowEnd: "2026-09-04",
    requestStartedAt: new Date("2026-09-01T10:00:30.000Z"),
  },
}, {
  transaction: async (callback: (transaction: typeof transitionTx) => Promise<unknown>) => callback(transitionTx),
} as never);
assert.equal(late.applied, false, "late Google seats cannot write after the black cross is enabled");
assert.deepEqual(operations, [], "no sold-out transition or history write for disabled monitoring");

console.log("seatCheck transactional tests: OK");