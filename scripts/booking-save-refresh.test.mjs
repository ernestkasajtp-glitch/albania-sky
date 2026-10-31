// Runs the real draft coordinator with lightweight hooks; no browser/network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync("artifacts/flight-system/src/context/BookingDraftContext.tsx", "utf8");
const exports = {};
const react = {
  createContext: () => ({ Provider: "provider" }),
  useRef: current => ({ current }), useMemo: fn => fn(), useCallback: fn => fn,
  useEffect: () => {}, useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
};
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
Function("exports","require", code)(exports, name => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx: (_, props) => props, jsxs: (_, props) => props };
  if (name === "@/lib/atomicBookingTransport") return { AtomicBookingTransport: class { begin() {} finish() {} async commit(error) { if (error) throw error; } } };
  throw new Error(`Unexpected dependency ${name}`);
});
const api = exports.BookingDraftProvider({ children: null }).value;
let release, fieldCalls = 0, queuedCalls = 0;
const barrier = new Promise(resolve => { release = resolve; });
const states = [];
api.subscribe(() => states.push(api.isSaving()));
api.registerFlush("price", async () => { fieldCalls++; await barrier; api.markDirty("price", false); });
api.markDirty("price", true);
api.queueOp("passenger", async () => { queuedCalls++; });
const first = api.flushAll(), second = api.flushAll();
assert.equal(api.isSaving(), true);
release();
await Promise.all([first, second]);
assert.equal(fieldCalls,1);
assert.equal(queuedCalls,1);
assert.equal(api.isSaving(),false);
assert.equal(api.hasUnsaved(),false);
assert.ok(states.includes(true));
assert.equal(states.at(-1),false);
api.queueOp("failing payment", async () => { throw new Error("Fixture failure"); });
await assert.rejects(api.flushAll(), /Fixture failure/);
assert.equal(api.isSaving(),false);
assert.equal(api.hasUnsaved(),true);
assert.equal(api.getQueuedOps().length,1);
const ui = fs.readFileSync("artifacts/flight-system/src/components/BookingDetailContent.tsx","utf8");
assert.ok(ui.includes("enabled: !!id && !savingDraft && draftDirty === 0"));
assert.ok(ui.includes("if (draft.isSaving()) return;"));
assert.ok(ui.includes("void doSave(false).catch(() => {});"), "click/keyboard saves consume the already-reported rejection");
assert.ok(ui.includes("const saveAndClose = useCallback(() => doSave(true)"), "navigation still awaits and rejects failed saves");
console.log("PASS: concurrent Save shares execution, failed operation retained, saving state released, detail reads paused.");

// Real detail serializer: commission comes from the final stored sale AND net.
const server = fs.readFileSync("artifacts/api-server/src/routes/bookings.ts", "utf8");
const serializer = server.slice(server.indexOf("export async function getFullBooking("),
  server.indexOf("// Fetches full booking data for multiple bookings"));
const serializerCode = ts.transpileModule(serializer, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
let finalRow;
const tables = Object.fromEntries(["bookingsTable","flightsTable","passengersTable","paymentsTable","groupTicketSalesTable","groupTicketsTable","bookingExtrasTable","agentsTable"]
  .map(name => [name, { name, id: "id", bookingId:"bookingId" }]));
const args = {
  exports: {},
  db: { select: () => ({ from: table => ({ where: async () => table.name === "bookingsTable" ? [finalRow] : [] }) }) },
  ...tables, eq: () => true,
  bookingSaveVersion: () => "fixture",
  wholeEuroDue: (total, paid) => Math.max(0,Math.round(total-paid)),
};
Function(...Object.keys(args), serializerCode)(...Object.values(args));
for (const [sale, net, commission] of [[250,210,40],[305,191,114],[190,210,-20],[210,210,0],[400,null,null],[400,0,0]]) {
  finalRow = { id:1, flightId:1, agentId:null, totalAmount:String(sale), netPrice:net == null ? null : String(net),
    markup:"0", commission:"0", discount:"0", createdAt:new Date(), updatedAt:new Date() };
  const booking = await args.exports.getFullBooking(1);
  assert.equal(booking.totalAmount,sale);
  assert.equal(booking.netPrice,net);
  assert.equal(booking.commissionAmount,commission);
}
console.log("PASS: final sale/net serializer, positive/negative/zero commission and existing absent/zero-net rules.");