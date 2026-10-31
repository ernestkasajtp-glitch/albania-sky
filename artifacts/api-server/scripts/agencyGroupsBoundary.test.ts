import assert from "node:assert/strict";
import express from "express";
import router from "../src/routes/bookingEngineSettings.js";

const app = express();
app.use(express.json());
app.use(router);
const server = app.listen(0);
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  const base = `http://127.0.0.1:${address.port}/booking-engine`;
  for (const [method, path] of [
    ["GET", "/agency-groups"], ["POST", "/agency-groups"],
    ["PATCH", "/agency-groups/1"], ["DELETE", "/agency-groups/1"],
    ["POST", "/agency-groups/1/rules"], ["PATCH", "/agency-groups/1/rules/2"], ["DELETE", "/agency-groups/1/rules/2"],
    ["GET", "/agents/1/visibility-context"],
  ]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 403, `${method} ${path} must be admin-only`);
  }
} finally {
  server.close();
}
console.info("Agency group admin boundary passed.");