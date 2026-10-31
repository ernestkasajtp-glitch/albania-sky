// One-off recovery: run the SAME full Google-price refresh + rule apply that the
// 02:00 cron performs (runDailyForcedGooglePriceRefresh). Used to recover today's
// prices after the warmer concurrency guard got stuck and the 02:00 run did
// nothing. Safe to run any time: it re-fetches every upcoming flight's Google
// price (keeping old prices flagged "stale" on transient failures), then snaps
// rule-driven sale prices to the fresh prices.
//
// Run on the VPS from /root/artifacts/api-server with env loaded:
//   node --env-file=./.env dist-script/force-google-price-refresh.mjs
import { runDailyForcedGooglePriceRefresh } from "../src/routes/flights.js";
import { logger } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const t0 = Date.now();
  logger.info("[oneoff] forced Google price refresh + rule apply: START");
  await runDailyForcedGooglePriceRefresh();
  logger.info(
    { elapsedSec: Math.round((Date.now() - t0) / 1000) },
    "[oneoff] forced Google price refresh + rule apply: DONE",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[oneoff] forced Google price refresh FAILED");
    process.exit(1);
  });
