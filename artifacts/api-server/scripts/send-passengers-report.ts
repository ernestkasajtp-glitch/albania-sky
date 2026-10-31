// One-off: dërgon raportin "Pasagjerët e Sotëm" menjëherë (test / dërgim manual).
// Përdorimi (në VPS): node --env-file=./.env dist-scripts/send-passengers-report.js
import { sendDailyPassengersReport } from "../src/lib/passengersReport.js";

sendDailyPassengersReport()
  .then(() => {
    console.log("[send-passengers-report] done");
    process.exit(0);
  })
  .catch((e) => {
    console.error("[send-passengers-report] failed:", e);
    process.exit(1);
  });
