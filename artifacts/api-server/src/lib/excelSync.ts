import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";

// Re-export EXCEL_PATH so callers (download endpoint, etc.) keep working.
const DATA_DIR = path.join(process.cwd(), "data");
export const EXCEL_PATH = path.join(DATA_DIR, "fms_live.xlsx");

// Effective output path — equals EXCEL_PATH in production; overridden in tests
// via _resetForTest so tests never touch the real data directory.
let _outputPath: string = EXCEL_PATH;

// PERFORMANCE (16.08.2026): building the full workbook (~2.4k bookings, ~4k pax,
// per-cell styling + autoWidth) is CPU-heavy and blocks the Node event loop for
// seconds — regenerating after EVERY booking/payment write froze the whole API
// during active use. Throttle: at most one regen per MIN_INTERVAL; writes bump
// a generation counter and the regen happens on the trailing edge. The download
// endpoint forces a fresh build via excelSyncNowIfDirty().
//
// Generation-counter model (race-safe):
// - writeGen bumps on every scheduled write; builtGen = generation covered by
//   the last SUCCESSFUL build. Dirty ⇔ builtGen < writeGen.
// - buildLoop() re-runs until builtGen catches up, so a write landing during a
//   build is never lost. On failure builtGen stays behind and a retry timer is
//   scheduled — dirty state is never cleared by a failed build.
//
// Execution model (16.08.2026): the heavy ExcelJS workbook build now runs in a
// dedicated worker_threads Worker (excelWorker.mjs) so the main event loop is
// never blocked — even a 5-second build leaves HTTP latency unchanged.
const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const RETRY_MS = 60 * 1000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt = 0;
let writeGen = 0;   // bumped on every data change
let builtGen = 0;   // covered by last successful build (0 = never built)
let building: Promise<void> | null = null;

function isDirty(): boolean {
  return builtGen < writeGen || !fs.existsSync(_outputPath);
}

/**
 * Spawns the excelWorker.mjs worker thread, waits for it to finish, and
 * resolves or rejects based on the result it posts back via parentPort.
 *
 * The worker is a separately bundled entry point located at:
 *   dist/excelWorker.mjs  (same directory as dist/index.mjs)
 *
 * import.meta.url here evaluates to the main bundle (dist/index.mjs), so
 * './excelWorker.mjs' correctly resolves to dist/excelWorker.mjs at runtime.
 */
type WorkerFactory = () => Promise<void>;
let _workerFactory: WorkerFactory | null = null; // null → use the real runInWorker

function runInWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Build the path to the worker bundle alongside the main bundle.
    const workerUrl = new URL("./excelWorker.mjs", import.meta.url);
    const worker = new Worker(workerUrl);

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    worker.on("message", (msg: { ok: boolean; error?: string }) => {
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
      // Non-zero exit without a message → treat as failure.
      if (code !== 0) {
        settle(() => reject(new Error(`excelWorker exited with code ${code}`)));
      } else {
        // Zero exit after a message was already handled — no-op.
        settle(resolve);
      }
    });
  });
}

async function buildOnce(): Promise<void> {
  const target = writeGen;
  lastRunAt = Date.now();
  try {
    await (_workerFactory ?? runInWorker)();
    builtGen = target;
  } catch (err) {
    console.error("[excelSync] Error generating Excel:", err);
    // stays dirty; startBuild's finally schedules a retry
  }
}

function startBuild(): Promise<void> {
  if (!building) {
    building = buildOnce().finally(() => {
      building = null;
      // Failed build, or writes landed during the build: keep the trailing
      // sync alive (throttled) so dirty data is never stranded without a timer.
      if (isDirty() && !debounceTimer) {
        const wait = Math.max(RETRY_MS, MIN_INTERVAL_MS - (Date.now() - lastRunAt));
        debounceTimer = setTimeout(() => { debounceTimer = null; void startBuild(); }, wait);
      }
    });
  }
  return building;
}

export function scheduleExcelSync(delayMs = 4000) {
  writeGen++;
  if (debounceTimer || building) return; // trailing run already pending; loop re-checks writeGen
  const since = Date.now() - lastRunAt;
  const wait = Math.max(delayMs, MIN_INTERVAL_MS - since);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void startBuild();
  }, wait);
}

// Rigjenerim i menjëhershëm (i pritshëm) — përdoret nga endpoint-i i shkarkimit
// që skedari të jetë gjithmonë i freskët kur e kërkon përdoruesi.
export async function excelSyncNowIfDirty(): Promise<void> {
  // Bounded loop: waits out an in-flight build and re-checks, so a write that
  // raced the previous build still lands in the file we serve.
  for (let i = 0; i < 3 && isDirty(); i++) {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    await startBuild();
  }
}

// ─ Test hooks (never called in production) ─────────────────────────────────

/**
 * Resets all module-level state and injects test doubles.
 * Called at the start of each test so tests are fully isolated.
 *
 * @param factory  Fake worker — replaces the real worker_threads build.
 * @param outPath  Isolated output path (e.g. a temp file) so tests never
 *                 touch the real data/fms_live.xlsx.  Defaults back to the
 *                 production EXCEL_PATH when omitted.
 */
export function _resetForTest(factory?: WorkerFactory, outPath?: string): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  writeGen = 0;
  builtGen = 0;
  building = null;
  lastRunAt = 0;
  _workerFactory = factory ?? null;
  _outputPath = outPath ?? EXCEL_PATH;
}

/** Returns a snapshot of the internal generation counters and timer/build flags. */
export function _getState(): {
  writeGen: number;
  builtGen: number;
  dirty: boolean;
  building: boolean;
  pendingTimer: boolean;
} {
  return {
    writeGen,
    builtGen,
    dirty: isDirty(),
    building: building !== null,
    pendingTimer: debounceTimer !== null,
  };
}
