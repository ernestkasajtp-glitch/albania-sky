// Read-only production smoke check against the actual route + database.
import express from "express";
import assert from "node:assert/strict";
import router from "../src/routes/flights";
const app = express();
app.use((req, _res, next) => { (req as any).session = { role: "admin", userId: -1 }; next(); });
app.use(router);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address() as { port: number };
const read = async (path: string) => {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json();
};
const list = await read("/flights?scheduleError=true&timeframe=future&limit=50");
const ids = await read("/flights/ids?scheduleError=true&timeframe=future");
assert.equal(list.total, 0, "Unexpected remaining anomaly");
assert.equal(list.counts.scheduleerror, 0);
assert.equal(list.data.length, 0);
assert.equal(Array.isArray(ids) ? ids.length : ids.ids.length, 0);
console.log(JSON.stringify({ scheduleErrors: list.counts.scheduleerror, total: list.total, ids: 0 }));
server.close();
process.exit(0);
