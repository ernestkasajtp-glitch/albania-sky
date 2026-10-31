// One-off: dërgon raportin ditor premium të shitjeve menjëherë (test / dërgim manual).
// Përdorimi (në VPS): node --env-file=./.env dist-scripts/send-sales-report.mjs
import { sendDailySalesReport } from "../src/lib/salesReport.js";

sendDailySalesReport()
  .then(() => {
    console.log("[send-sales-report] done");
    process.exit(0);
  })
  .catch((e) => {
    console.error("[send-sales-report] failed:", e);
    process.exit(1);
  });
