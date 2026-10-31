/**
 * Behavior test for POST /public/pok-webhook status codes (task: never lose paid
 * POK orders when POK is temporarily unreachable).
 *
 * Stubs global fetch for api.pokpay.io and asserts:
 *   - no order id in payload            → 200 (nothing to do, POK must not retry)
 *   - order fetch 404                   → 200 (definitive: order doesn't exist)
 *   - order fetch 401 / 429 / 500       → 503 (transient: POK must retry)
 *   - network error / timeout           → 503
 *   - order found but not completed     → 200 (definitive: nothing to record)
 *
 * Run: node artifacts/api-server/dist-test/pok-webhook-behavior.test.mjs
 * (bundle first with build-script.mjs). No DB access is exercised.
 */
import express from "express";
import publicRouter from "../src/routes/public.js";

type Scenario =
  | { kind: "http"; status: number; body?: any }
  | { kind: "network" };

let orderScenario: Scenario = { kind: "http", status: 404 };

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input?.url ?? input);
  if (!url.includes("api.pokpay.io")) return realFetch(input, init);
  if (url.endsWith("/auth/sdk/login")) {
    return new Response(JSON.stringify({ data: { accessToken: "test-token" } }), { status: 200 });
  }
  if (url.includes("/sdk-orders/")) {
    if (orderScenario.kind === "network") throw new TypeError("fetch failed: connect ETIMEDOUT");
    return new Response(JSON.stringify(orderScenario.body ?? { data: {} }), { status: orderScenario.status });
  }
  throw new Error(`Unexpected POK URL in test: ${url}`);
}) as any;

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/", publicRouter);
  const server = app.listen(0);
  const port = (server.address() as any).port;

  let failures = 0;
  async function expectStatus(name: string, scenario: Scenario | null, body: any, want: number) {
    if (scenario) orderScenario = scenario;
    const res = await realFetch(`http://127.0.0.1:${port}/public/pok-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ok = res.status === want;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${res.status} (want ${want}) ${text}`);
  }

  await expectStatus("no order id", null, { hello: "world" }, 200);
  await expectStatus("order 404 (definitive not found)", { kind: "http", status: 404 }, { orderId: "o-404" }, 200);
  await expectStatus("order 401 (transient)", { kind: "http", status: 401 }, { orderId: "o-401" }, 503);
  await expectStatus("order 429 (transient)", { kind: "http", status: 429 }, { orderId: "o-429" }, 503);
  await expectStatus("order 500 (transient)", { kind: "http", status: 500 }, { orderId: "o-500" }, 503);
  await expectStatus("network error (transient)", { kind: "network" }, { orderId: "o-net" }, 503);
  await expectStatus(
    "order found, not completed (definitive)",
    { kind: "http", status: 200, body: { data: { id: "o-unpaid", merchantCustomReference: "KTF0000", isCompleted: false, capturedAmount: 0 } } },
    { orderId: "o-unpaid" },
    200,
  );

  server.close();
  if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1); }
  console.log("All webhook status-matrix checks passed.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
