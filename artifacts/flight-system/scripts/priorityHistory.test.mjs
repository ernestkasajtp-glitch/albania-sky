import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual component's URL and response reader without importing React.
const source = readFileSync(new URL("../src/components/priority-history.tsx", import.meta.url), "utf8");
const prefix = source.split("export function PriorityHistory")[0].replace(/^import .*;$/gm, "");
for (const base of ["/", "/flight-system/"]) {
  const code = ts.transpile(prefix.replaceAll("import.meta.env.BASE_URL", JSON.stringify(base)));
  const { API, readResponse } = vm.runInNewContext(`${code}\n({ API, readResponse })`, { Error });
  assert.equal(new URL(API, "https://example.test").pathname, "/api/cp-import-alerts/priority-history");
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8" },
  });
  assert.equal(await readResponse(json(null)), null);
  assert.equal((await readResponse(json({ id: "job", status: "running" }, 202))).id, "job");
  await assert.rejects(readResponse(new Response("<!DOCTYPE html>", {
    headers: { "content-type": "text/html" },
  })), /Serveri nuk ktheu përgjigjen/);
  await assert.rejects(readResponse(json({}, 401)), /Sesioni ka përfunduar/);
  await assert.rejects(readResponse(json({ error: "Nuk lejohet" }, 403)), /Nuk lejohet/);
  await assert.rejects(readResponse(new Response("invalid", {
    headers: { "content-type": "application/json" },
  })), /nuk mund të lexohet/);
}
console.log("PRIORITY: correct API routing and JSON/HTML/session/error handling passed.");
