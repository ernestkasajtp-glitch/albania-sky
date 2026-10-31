import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);

// scripts/excelSync.test.ts
import fs2 from "fs";
import os from "os";
import path2 from "path";

// src/lib/excelSync.ts
import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";
var DATA_DIR = path.join(process.cwd(), "data");
var EXCEL_PATH = path.join(DATA_DIR, "fms_live.xlsx");
var _outputPath = EXCEL_PATH;
var MIN_INTERVAL_MS = 10 * 60 * 1e3;
var RETRY_MS = 60 * 1e3;
var debounceTimer = null;
var lastRunAt = 0;
var writeGen = 0;
var builtGen = 0;
var building = null;
function isDirty() {
  return builtGen < writeGen || !fs.existsSync(_outputPath);
}
var _workerFactory = null;
function runInWorker() {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL("./excelWorker.mjs", import.meta.url);
    const worker = new Worker(workerUrl);
    let settled = false;
    const settle = (fn) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    worker.on("message", (msg) => {
      if (msg.ok) {
        settle(resolve);
      } else {
        settle(() => reject(new Error(msg.error ?? "excelWorker: build failed")));
      }
    });
    worker.on("error", (err) => {
      settle(() => reject(err));
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        settle(() => reject(new Error(`excelWorker exited with code ${code}`)));
      } else {
        settle(resolve);
      }
    });
  });
}
async function buildOnce() {
  const target = writeGen;
  lastRunAt = Date.now();
  try {
    await (_workerFactory ?? runInWorker)();
    builtGen = target;
  } catch (err) {
    console.error("[excelSync] Error generating Excel:", err);
  }
}
function startBuild() {
  if (!building) {
    building = buildOnce().finally(() => {
      building = null;
      if (isDirty() && !debounceTimer) {
        const wait = Math.max(RETRY_MS, MIN_INTERVAL_MS - (Date.now() - lastRunAt));
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void startBuild();
        }, wait);
      }
    });
  }
  return building;
}
function scheduleExcelSync(delayMs = 4e3) {
  writeGen++;
  if (debounceTimer || building) return;
  const since = Date.now() - lastRunAt;
  const wait = Math.max(delayMs, MIN_INTERVAL_MS - since);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void startBuild();
  }, wait);
}
async function excelSyncNowIfDirty() {
  for (let i = 0; i < 3 && isDirty(); i++) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await startBuild();
  }
}
function _resetForTest(factory, outPath) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  writeGen = 0;
  builtGen = 0;
  building = null;
  lastRunAt = 0;
  _workerFactory = factory ?? null;
  _outputPath = outPath ?? EXCEL_PATH;
}
function _getState() {
  return {
    writeGen,
    builtGen,
    dirty: isDirty(),
    building: building !== null,
    pendingTimer: debounceTimer !== null
  };
}

// scripts/excelSync.test.ts
var TMP_DIR = fs2.mkdtempSync(path2.join(os.tmpdir(), "excelSync-test-"));
var TMP_XLSX = path2.join(TMP_DIR, "test-output.xlsx");
function resetState(factory) {
  _resetForTest(factory, TMP_XLSX);
  if (fs2.existsSync(TMP_XLSX)) fs2.unlinkSync(TMP_XLSX);
}
function cleanup() {
  try {
    fs2.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
  }
  _resetForTest();
}
var failures = 0;
function assert(label, cond, detail) {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
async function runTest1() {
  console.log("Test 1: Overlapping write is not lost");
  resetState();
  let buildCount = 0;
  let releaseBuild1Gate;
  const build1Gate = new Promise((r) => {
    releaseBuild1Gate = r;
  });
  resetState(async () => {
    buildCount++;
    if (buildCount === 1) {
      await build1Gate;
    }
    fs2.writeFileSync(TMP_XLSX, `build-${buildCount}`);
  });
  scheduleExcelSync();
  const syncPromise = excelSyncNowIfDirty();
  scheduleExcelSync();
  releaseBuild1Gate();
  await syncPromise;
  const s = _getState();
  assert(
    "builtGen === writeGen (both writes covered)",
    s.builtGen === s.writeGen,
    `builtGen=${s.builtGen} writeGen=${s.writeGen}`
  );
  assert(
    "exactly two builds executed (one per write)",
    buildCount === 2,
    `buildCount=${buildCount}`
  );
  assert(
    "not dirty after excelSyncNowIfDirty",
    !s.dirty,
    `dirty=${s.dirty}`
  );
  assert(
    "file content reflects the second (latest) build",
    fs2.existsSync(TMP_XLSX) && fs2.readFileSync(TMP_XLSX, "utf8") === "build-2",
    `content=${fs2.existsSync(TMP_XLSX) ? fs2.readFileSync(TMP_XLSX, "utf8") : "(missing)"}`
  );
  _resetForTest(void 0, TMP_XLSX);
}
async function runTest2() {
  console.log("Test 2: Worker crash \u2014 dirty flag stays, retry timer fires");
  resetState(async () => {
    throw new Error("simulated worker crash (non-zero exit code)");
  });
  scheduleExcelSync();
  await excelSyncNowIfDirty();
  const s = _getState();
  assert(
    "builtGen unchanged after crash (=0)",
    s.builtGen === 0,
    `builtGen=${s.builtGen}`
  );
  assert(
    "dirty flag remains set after crash",
    s.dirty,
    `dirty=${s.dirty}`
  );
  assert(
    "retry timer is scheduled after crash",
    s.pendingTimer,
    `pendingTimer=${s.pendingTimer}`
  );
  _resetForTest(void 0, TMP_XLSX);
}
async function runTest3() {
  console.log("Test 3: Cap-hit invariant \u2014 retry timer always scheduled when dirty");
  resetState();
  let buildCount = 0;
  resetState(async () => {
    await Promise.resolve();
    buildCount++;
    scheduleExcelSync();
    fs2.writeFileSync(TMP_XLSX, `build-${buildCount}`);
  });
  scheduleExcelSync();
  await excelSyncNowIfDirty();
  const s = _getState();
  assert(
    "loop ran at least 3 builds",
    buildCount >= 3,
    `buildCount=${buildCount}`
  );
  assert(
    "dirty flag is still set (cap hit; new writes arrived during every build)",
    s.dirty,
    `dirty=${s.dirty}`
  );
  assert(
    "retry timer is scheduled \u2014 dirty data is not stranded",
    s.pendingTimer,
    `pendingTimer=${s.pendingTimer}`
  );
  _resetForTest();
}
async function main() {
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
  console.log(`
${failures === 0 ? "All tests passed." : `${failures} test(s) FAILED.`}`);
  process.exit(failures > 0 ? 1 : 0);
}
main();
