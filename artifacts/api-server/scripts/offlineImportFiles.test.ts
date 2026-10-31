import assert from "node:assert/strict";
import { isOfflineLuggageFile, isOfflineLuggageError } from "../src/lib/offlineImportFiles";

assert.equal(isOfflineLuggageFile("luggages_2104787.csv"), true);
assert.equal(isOfflineLuggageFile("LUGGAGES_2104799.CSV"), true);
for (const name of ["pnl_2104787.csv", "bookings.csv", "luggages_pnl.xlsx", "pnl_luggages_123.csv"]) {
  assert.equal(isOfflineLuggageFile(name), false, name);
}
assert.equal(isOfflineLuggageError("luggages_2104787.csv [CPKX99YY]: Numri i fluturimit mungon"), true);
assert.equal(isOfflineLuggageError("luggages_2104787.csv: CSV bosh ose format i gabuar"), true);
assert.equal(isOfflineLuggageError("pnl_2104787.csv [CPKX99YY]: Numri i fluturimit mungon"), false);
assert.equal(isOfflineLuggageError("pnl_2104787.csv [CPKX99YY]: fluturimi nuk u gjet"), false);
console.log("Offline baggage classification: passed; real booking failures preserved");
