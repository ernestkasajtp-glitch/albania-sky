import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { generateInvoicePdf, generateCreditInvoicePdf, generateBatchInvoicePdf } from "../src/lib/invoicePdf.js";

// Run with TZ=UTC to prove the new payment date is explicitly Europe/Tirane.
const out = resolve(process.cwd(), "../../generated-artifacts/invoice-payment-date");
mkdirSync(out, { recursive: true });
const dates = {
  invoiceCode: "INV-DEMO-001",
  date: new Date("2026-10-09T16:55:00Z"),
  paymentDate: new Date("2026-10-04T08:15:00Z"),
};
async function verify(name: string, buffer: Buffer, label = "PAYMENT DATE") {
  const file = resolve(out, `${name}.pdf`);
  writeFileSync(file, buffer);
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  assert.match(text, new RegExp(`${label}:\\s+04 October 2026 10:15 AM`));
  assert.match(text, /09 October 2026/); // Existing invoice header stays independent.
  assert.doesNotMatch(text, new RegExp(`${label}:\\s+09 October`));
  console.log(`PASS ${name}: original header date + independent recorded payment date`);
}
await verify("single-confirmed", await generateInvoicePdf({
  ...dates, amount: 300, method: "card", bookingRef: "KTF0001", customerName: "Demo Passenger",
  routeFrom: "DTM", routeTo: "PRN", airline: "Demo Air", flightNumber: "AB123",
  departureDate: "2026-12-24", total: 300, paid: 300, due: 0, confirmed: true,
}));
await verify("refund", await generateInvoicePdf({
  ...dates, amount: 30, method: "cash", bookingRef: "KTF0001", customerName: "Demo Passenger", isRefund: true,
}));
await verify("deposit", await generateCreditInvoicePdf({
  ...dates, amount: 200, kind: "deposit", paymentMethod: "Cash", balanceAfter: 200,
}));
await verify("credit", await generateCreditInvoicePdf({
  ...dates, amount: 25, kind: "credit", bookingRef: "KTF0001", balanceAfter: 25,
}), "CREDIT DATE");
await verify("batch", await generateBatchInvoicePdf({
  ...dates, method: "bank_transfer", total: 900, reference: "BANK-DEMO",
  lineItems: [1, 2, 3].map(i => ({
    bookingRef: `KTF000${i}`, customerName: `Passenger ${i}`, route: "DTM -> PRN",
    amount: 300, total: 400, prevPaid: 100, paid: 400, due: 0,
    flightNumber: "AB123", airline: "Demo Air", departureDate: "2026-12-24",
  })),
}));
await verify("batch-multipage", await generateBatchInvoicePdf({
  ...dates, method: "cash", total: 21000,
  lineItems: Array.from({ length: 70 }, (_, i) => ({
    bookingRef: `KTF${String(i).padStart(4, "0")}`, customerName: `Passenger ${i}`, amount: 300, total: 300, paid: 300, due: 0,
  })),
}));
const source = readFileSync("src/lib/invoice.ts", "utf8");
assert.match(source, /date: opts\.confirmed \? new Date\(\) : payment\.createdAt,\s+paymentDate: payment\.createdAt/);
assert.match(source, /date: txn\.createdAt,\s+paymentDate: txn\.createdAt/);
assert.match(source, /date: first\.createdAt,\s+paymentDate: first\.createdAt/);
console.log("PASS all shared invoice builders pass stored payment/transaction timestamps");
