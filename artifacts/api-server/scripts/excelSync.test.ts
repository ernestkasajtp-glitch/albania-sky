/**
 * Behavior tests for the excelSync.ts state-machine guarantees.
 *
 * Test 1 – Overlapping write is not silently lost
 *   A call to scheduleExcelSync() that arrives while a build is genuinely
 *   in flight (building !== null) bumps writeGen only (no new timer).
 *   excelSyncNowIfDirty's loop detects the higher generation and runs a
 *   second build, so builtGen catches up to writeGen.
 *
 * Test 2 – Worker crash: dirty flag stays, retry timer fires
 *   A rejected worker does not advance builtGen; the finally-handler
 *   schedules a retry timer so dirty data is never stranded.
 *
 * Test 3 – Cap-hit invariant: retry timer is always scheduled when dirty
 *   If new writes arrive during every build (worst case), excelSyncNowIfDirty
 *   may exit its loop while still dirty.  The invariant is that a retry timer
 *   is always scheduled at that point — dirty data is never stranded.
 *
 * Run:  node artifacts/api-server/dist-test/excelSync.test.mjs
 * Build/run shortcut:  pnpm --filter @workspace/api-server test
 *
 * No real worker threads or DB access are exercised.  A fake worker factory
 * is injected via _resetForTest, and all file I/O is redirected to an
 * isolated temporary directory — the production data/fms_live.xlsx is
 * never touched.
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  excelSyncNowIfDirty,
  scheduleExcelSync,
  _resetForTest,
  _getState,
} from "../src/lib/excelSync.js";

// ─── Isolated temp directory ─────────────────────────────────────────────────
// Each test run gets its own directory so tests are mutually independent and
// nothing under artifacts/api-server/data/ is ever read or written.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "excelSync-test-"));
const TMP_XLSX = path.join(TMP_DIR, "test-output.xlsx");

function resetState(factory?: () => Promise<void>): void {
  _resetForTest(factory, TMP_XLSX);
  // Remove any leftover file so isDirty()'s existsSync check starts clean.
  if (fs.existsSync(TMP_XLSX)) fs.unlinkSync(TMP_XLSX);
}

function cleanup(): void {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  // Restore production defaults so any import-time side-effects stay neutral.
  _resetForTest();
}

// ─── Assertion helper ─────────────────────────────────────────────────────────
let failures = 0;

function assert(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── Test 1: Overlapping write is not silently lost ──────────────────────────
//
// The tricky timing: when buildOnce() calls `await factory()`, the assignment
// `building = buildOnce().finally(cb)` has NOT yet resolved from JavaScript's
// perspective.  So any scheduleExcelSync() called synchronously inside the
// factory (before its first await) would observe building === null and
// incorrectly arm a debounce timer rather than just bumping writeGen.
//
// The correct way to simulate a concurrent write is to:
//   1. Gate the factory on an external Promise so it pauses at its first await.
//   2. Start excelSyncNowIfDirty() but do NOT yet await it — by the time
//      excelSyncNowIfDirty() returns its Promise to our code, startBuild() has
//      already assigned `building` synchronously.
//   3. Now call scheduleExcelSync() — building is set, so it only bumps writeGen.
//   4. Release the gate and await the sync Promise.
//
// Sequence:
//   scheduleExcelSync()                → writeGen = 1
//   excelSyncNowIfDirty() (no await)   → startBuild assigns building; factory pauses at gate
//   scheduleExcelSync()                → writeGen = 2 (building set → no new timer)
//   releaseBuild1Gate()                → factory writes "build-1", resolves
//   buildOnce: builtGen = 1            → isDirty (1 < 2); finally schedules timer
//   loop i=1: clears timer, startBuild → factory writes "build-2", builtGen = 2
//   isDirty = false → loop exits

async function runTest1(): Promise<void> {
  console.log("Test 1: Overlapping write is not lost");

  resetState();
  let buildCount = 0;

  // Gate controlled by the test — released after building is confirmed set.
  let releaseBuild1Gate!: () => void;
  const build1Gate = new Promise<void>(r => { releaseBuild1Gate = r; });

  resetState(async () => {
    buildCount++;
    if (buildCount === 1) {
      await build1Gate; // factory pauses here; building is set on the other side
    }
    // Write a sentinel so isDirty()'s existsSync check passes on later iterations.
    fs.writeFileSync(TMP_XLSX, `build-${buildCount}`);
  });

  scheduleExcelSync(); // writeGen → 1

  // Start the sync but do NOT await yet.  By the time this returns its Promise,
  // startBuild() has synchronously set `building`.
  const syncPromise = excelSyncNowIfDirty();

  // building is now set; this write arrives while build 1 is genuinely in-flight.
  scheduleExcelSync(); // writeGen → 2, building is set → only bumps writeGen, no timer

  // Release build 1 and wait for the full sync to converge.
  releaseBuild1Gate();
  await syncPromise;

  const s = _getState();
  assert(
    "builtGen === writeGen (both writes covered)",
    s.builtGen === s.writeGen,
    `builtGen=${s.builtGen} writeGen=${s.writeGen}`,
  );
  assert(
    "exactly two builds executed (one per write)",
    buildCount === 2,
    `buildCount=${buildCount}`,
  );
  assert(
    "not dirty after excelSyncNowIfDirty",
    !s.dirty,
    `dirty=${s.dirty}`,
  );
  assert(
    "file content reflects the second (latest) build",
    fs.existsSync(TMP_XLSX) && fs.readFileSync(TMP_XLSX, "utf8") === "build-2",
    `content=${fs.existsSync(TMP_XLSX) ? fs.readFileSync(TMP_XLSX, "utf8") : "(missing)"}`,
  );

  _resetForTest(undefined, TMP_XLSX); // disarm any leftover timer
}

// ─── Test 2: Worker crash — dirty flag stays, retry timer fires ──────────────
//
// Sequence:
//   scheduleExcelSync() → writeGen = 1
//   excelSyncNowIfDirty loops (max 3 tries); each build rejects
//   builtGen stays 0; isDirty = true throughout
//   After the loop, the last build's finally-handler has set debounceTimer

async function runTest2(): Promise<void> {
  console.log("Test 2: Worker crash — dirty flag stays, retry timer fires");

  resetState(async () => {
    throw new Error("simulated worker crash (non-zero exit code)");
  });

  scheduleExcelSync(); // writeGen → 1

  await excelSyncNowIfDirty(); // all 3 attempts reject

  const s = _getState();
  assert(
    "builtGen unchanged after crash (=0)",
    s.builtGen === 0,
    `builtGen=${s.builtGen}`,
  );
  assert(
    "dirty flag remains set after crash",
    s.dirty,
    `dirty=${s.dirty}`,
  );
  assert(
    "retry timer is scheduled after crash",
    s.pendingTimer,
    `pendingTimer=${s.pendingTimer}`,
  );

  _resetForTest(undefined, TMP_XLSX);
}

// ─── Test 3: Cap-hit invariant — retry timer always scheduled when dirty ──────
//
// If a new write arrives during EVERY build, the three-iteration cap in
// excelSyncNowIfDirty means the loop exits while builtGen < writeGen.
// The invariant is: the last build's finally-handler always schedules a retry
// timer when dirty, so dirty data is NEVER stranded without a pending sync.
//
// Technique: each fake worker does `await Promise.resolve()` FIRST (so
// building is already assigned when it resumes as a microtask), then calls
// scheduleExcelSync() to simulate a fresh write mid-build.  Three consecutive
// builds each trigger a new write → loop hits cap → still dirty → timer set.

async function runTest3(): Promise<void> {
  console.log("Test 3: Cap-hit invariant — retry timer always scheduled when dirty");

  resetState();
  let buildCount = 0;

  resetState(async () => {
    // Yield one microtask so the synchronous `building = buildOnce()…` assignment
    // has completed before we call scheduleExcelSync().
    await Promise.resolve();
    buildCount++;
    // Simulate a concurrent write arriving while this build is in flight.
    // building is set by now, so scheduleExcelSync only bumps writeGen.
    scheduleExcelSync();
    fs.writeFileSync(TMP_XLSX, `build-${buildCount}`);
  });

  scheduleExcelSync(); // writeGen → 1
  await excelSyncNowIfDirty(); // loop hits cap (3 iterations); each build spawns another write

  const s = _getState();
  assert(
    "loop ran at least 3 builds",
    buildCount >= 3,
    `buildCount=${buildCount}`,
  );
  assert(
    "dirty flag is still set (cap hit; new writes arrived during every build)",
    s.dirty,
    `dirty=${s.dirty}`,
  );
  assert(
    "retry timer is scheduled — dirty data is not stranded",
    s.pendingTimer,
    `pendingTimer=${s.pendingTimer}`,
  );

  _resetForTest(); // disarm the retry timer so the process exits cleanly
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== excelSync state-machine tests ===\n");
  try {
    await runTest1();
    console.log();
    await runTest2();
    console.log();
    await runTest3();
  } catch (e) {
    console.error("Unexpected error:", e);
    failures++;
  } finally {
    cleanup();
  }
  console.log(`\n${failures === 0 ? "All tests passed." : `${failures} test(s) FAILED.`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
