import assert from "node:assert/strict";
import { formatKytePrice } from "../src/pages/kyte-price.ts";

const format = (minor: number, decimals: number, code = "EUR") =>
  formatKytePrice({ priceMinor: minor, currency: { code, decimals } });
const numeric = (value: string) => value.replace(/[^\d,.-]/g, "").replace(/\./g, "");
assert.equal(numeric(format(12345, 2)), "123,45");
assert.equal(numeric(format(12345, 0)), "12345");
assert.equal(numeric(format(12345, 3)), "12,345");
assert.equal(format(NaN, 2), "Çmimi i padisponueshëm");
assert.equal(format(12345, -1), "Çmimi i padisponueshëm");
assert.equal(format(12345, 7), "Çmimi i padisponueshëm");
console.log("Kyte price formatting tests: OK");