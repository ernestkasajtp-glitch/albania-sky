import { Router, type IRouter } from "express";
import { getAgentRoundWhole, setAgentRoundWhole } from "../lib/priceRules.js";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

router.get("/settings/agent-rounding", requireAdmin, async (_req, res): Promise<void> => {
  const roundWhole = await getAgentRoundWhole();
  res.json({ roundWhole });
});

router.put("/settings/agent-rounding", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const roundWhole = b.roundWhole === true || b.roundWhole === "true";
  await setAgentRoundWhole(roundWhole);
  res.json({ roundWhole });
});

export { router as agentRoundingSettingsRouter };
