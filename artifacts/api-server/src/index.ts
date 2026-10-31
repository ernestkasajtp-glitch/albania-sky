import http from "http";
import app from "./app";
import { startDiscountCampaignClock } from "./lib/discountCampaigns";
import { startOfferEmailWorker } from "./lib/offerEmailQueue";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cron.js";
import { attachTeamChatWs } from "./lib/teamChatWs";
import { ensurePokAccount } from "./lib/pokAccounts.js";
import { startPriorityEmailMonitor } from "./lib/priorityEmailMonitor.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
attachTeamChatWs(server);

server.listen(port, () => {
  startDiscountCampaignClock();
  startOfferEmailWorker();
  logger.info({ port }, "Server listening");
  void ensurePokAccount()
    .then(account => logger.info({ configured: Boolean(account) }, "POK account configuration checked"))
    .catch(() => logger.error("POK account configuration check failed"));
  try {
    startCronJobs();
    startPriorityEmailMonitor();
    logger.info("Daily cron jobs scheduled");
  } catch (e) {
    logger.warn({ err: e }, "Cron setup failed (non-fatal)");
  }
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
