import assert from "node:assert/strict";
import { createSftpDeadline, SftpTimeoutError } from "../src/lib/sftpDeadline";

let destroyed = 0;
const logs: { operation: string; durationMs: number; state: string }[] = [];
const run = createSftpDeadline(() => { destroyed++; }, d => logs.push(d));
assert.equal(await run("list", async () => 7, 100), 7);
await assert.rejects(run("get", () => new Promise(() => {}), 10), SftpTimeoutError);
assert.equal(destroyed, 1);
let called = false;
await assert.rejects(run("delete", async () => { called = true; }), SftpTimeoutError);
assert.equal(called, false, "must not delete or continue after timeout");
assert.equal(logs.at(-1)?.state, "timeout");

// Late completion cannot reactivate the client.
let resolveLate!: (value: number) => void;
const late = createSftpDeadline(() => { destroyed++; }, () => {});
await assert.rejects(late("list", () => new Promise<number>(r => { resolveLate = r; }), 10), SftpTimeoutError);
resolveLate(42);
await assert.rejects(late("get", async () => 1), SftpTimeoutError);

// Errors settle promptly; successful sequential operations have separate budgets.
const fresh = createSftpDeadline(() => { throw new Error("unexpected destruction"); }, () => {});
await assert.rejects(fresh("list", async () => { throw new Error("missing directory"); }), /missing directory/);
for (let i = 0; i < 5; i++) {
  assert.equal(await fresh("get", () => new Promise(r => setTimeout(() => r(i), 10)), 40), i);
}
console.log("SFTP deadlines: success, timeout, late callbacks, blocked reuse and independent budgets passed");
