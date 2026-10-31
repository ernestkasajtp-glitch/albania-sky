import { Router } from "express";
import { runCitizenPlaneExport, buildCpExportCsv, getExportLogs } from "../lib/cpExport.js";

const router = Router();

// POST /citizenplane/export — trigger manual export to CitizenPlane SFTP
router.post("/citizenplane/export", async (req, res) => {
  try {
    const result = await runCitizenPlaneExport("manual");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, errors: [err.message] });
  }
});

// GET /citizenplane/export/preview — download CSV preview (without SFTP upload)
router.get("/citizenplane/export/preview", async (req, res) => {
  try {
    const { csv, count } = await buildCpExportCsv();
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="flights_${date}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /citizenplane/export/logs — fetch recent export history
router.get("/citizenplane/export/logs", async (req, res) => {
  try {
    const logs = await getExportLogs(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
