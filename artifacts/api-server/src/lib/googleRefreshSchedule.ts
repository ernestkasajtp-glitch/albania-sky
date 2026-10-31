import { db, settingsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { isModuleEnabled } from "./moduleControls";
import { reportOperationalFailure } from "./operationalFailures";
import { nextDailyRefresh, localRefreshParts, isRefreshTime } from "./googleRefreshTime";

const TIME_KEY = "google_price_daily_time";
const CLAIM_KEY = "google_price_daily_claim";
let nextCache: { key: string; value: string } | undefined;

export async function readGoogleRefreshSchedule() {
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, [TIME_KEY, CLAIM_KEY]));
  const time = rows.find(row => row.key === TIME_KEY)?.value ?? "02:00";
  const claimedDay = rows.find(row => row.key === CLAIM_KEY)?.value ?? undefined;
  if (!isRefreshTime(time)) throw new Error("Invalid saved Google refresh time");
  const now = new Date();
  const key = `${time}/${claimedDay}/${Math.floor(now.getTime() / 60_000)}`;
  if (nextCache?.key !== key) nextCache = { key, value: nextDailyRefresh(time, now, claimedDay).toISOString() };
  return { time, nextRun: nextCache.value, timeZone: "Europe/Tirane" };
}

export async function saveGoogleRefreshTime(time: string) {
  await db.insert(settingsTable).values({ key: TIME_KEY, value: time })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: time, updatedAt: new Date() } });
  return readGoogleRefreshSchedule();
}

let started = false;
export function startDailyGoogleRefresh(run: (time: string) => Promise<void>) {
  if (started) return;
  started = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const { time } = await readGoogleRefreshSchedule();
      const now = new Date();
      const local = localRefreshParts(now);
      // Spring DST skips 02:xx: run that day's refresh at 03:00 instead.
      const springGap = time.startsWith("02:") && local.time === "03:00"
        && localRefreshParts(new Date(now.getTime() - 60_000)).time === "01:59";
      if (local.time !== time && !springGap) return;
      if (!(await isModuleEnabled("googlePrices"))) return;
      // One claim per local calendar day, shared by all server processes.
      const claimed = await db.insert(settingsTable).values({ key: CLAIM_KEY, value: local.day })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: local.day, updatedAt: new Date() },
          setWhere: sql`${settingsTable.value} < ${local.day}`,
        }).returning({ key: settingsTable.key });
      if (!claimed.length) return;
      logger.info({ scheduledTime: time }, "[gprice] daily refresh starting");
      await run(time);
    } catch (err) {
      logger.error({ err }, "[gprice] daily scheduler failed");
      await reportOperationalFailure("google-daily-schedule", "Rifreskimi ditor i Google", err);
    } finally { busy = false; }
  };
  void tick();
  setInterval(() => void tick(), 30_000).unref();
}
