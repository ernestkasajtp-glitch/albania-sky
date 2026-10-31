import { Router, type Response } from "express";
import { GetPageLayoutSettingsResponse, GetPublicPageLayoutsResponse, SetPageLayoutBody, SetPageLayoutResponse } from "@workspace/api-zod";
import { clearLayout, findPage, isReadyVariant, readLayoutRows, resolveEntries, writeLayout, type PageDef } from "../lib/pageLayouts";
import { notifyDataChanged } from "../lib/liveEvents";

export interface PageLayoutStore {
  read: typeof readLayoutRows;
  write: (def: PageDef, variant: string) => Promise<void>;
  clear: (def: PageDef) => Promise<void>;
}
const dbStore: PageLayoutStore = { read: readLayoutRows, write: writeLayout, clear: clearLayout };

export function createPageLayoutRouters(store: PageLayoutStore = dbStore, notify: (topic: string) => void = notifyDataChanged) {
/** Public, read-only: exposes only scope/page/variant metadata. */
const publicPageLayoutsRouter = Router();
publicPageLayoutsRouter.get("/page-layouts", async (req, res): Promise<void> => {
  try {
    const layouts = resolveEntries(await store.read()).map(({ scope, page, variant }) => ({ scope, page, variant }));
    res.setHeader("Cache-Control", "no-store");
    res.json(GetPublicPageLayoutsResponse.parse({ layouts }));
  } catch (err) {
    req.log?.error({ err }, "page layouts read failed");
    res.status(503).json({ error: "Konfigurimi i pamjeve nuk është i disponueshëm." });
  }
});

/** Admin-only (mounted behind requireFmsAuth + requireAdmin; re-checked here). */
const pageLayoutSettingsRouter = Router();
pageLayoutSettingsRouter.use("/settings/page-layouts", (req, res, next) => {
  const session = (req as any).session;
  if (!session?.role || session.source === "be") { res.status(401).json({ error: "Unauthorized" }); return; }
  if (session.role !== "admin") { res.status(403).json({ error: "Forbidden: admin only" }); return; }
  next();
});

pageLayoutSettingsRouter.get("/settings/page-layouts", async (req, res): Promise<void> => {
  try {
    res.json(GetPageLayoutSettingsResponse.parse({ pages: resolveEntries(await store.read()) }));
  } catch (err) {
    req.log?.error({ err }, "page layout settings read failed");
    res.status(503).json({ error: "Konfigurimi i pamjeve nuk është i disponueshëm." });
  }
});

async function respondEntry(res: Response, scope: string, page: string) {
  const entry = resolveEntries(await store.read()).find(e => e.scope === scope && e.page === page);
  notify("page_layouts");
  res.json(SetPageLayoutResponse.parse(entry));
}

pageLayoutSettingsRouter.put("/settings/page-layouts/:scope/:page", async (req, res): Promise<void> => {
  const def = findPage(String(req.params.scope), String(req.params.page));
  if (!def) { res.status(404).json({ error: "Faqe e panjohur." }); return; }
  const body = SetPageLayoutBody.strict().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Kërkohet { variant: string }." }); return; }
  if (!isReadyVariant(def, body.data.variant)) {
    res.status(400).json({ error: "Kjo pamje nuk është e disponueshme për këtë faqe." });
    return;
  }
  try {
    await store.write(def, body.data.variant);
    await respondEntry(res, def.scope, def.page);
  } catch (err) {
    req.log?.error({ err }, "page layout write failed");
    res.status(503).json({ error: "Ruajtja dështoi. Zgjedhja e mëparshme mbetet aktive." });
  }
});

pageLayoutSettingsRouter.delete("/settings/page-layouts/:scope/:page", async (req, res): Promise<void> => {
  const def = findPage(String(req.params.scope), String(req.params.page));
  if (!def) { res.status(404).json({ error: "Faqe e panjohur." }); return; }
  try {
    await store.clear(def);
    await respondEntry(res, def.scope, def.page);
  } catch (err) {
    req.log?.error({ err }, "page layout reset failed");
    res.status(503).json({ error: "Rikthimi dështoi. Zgjedhja e mëparshme mbetet aktive." });
  }
});

return { publicPageLayoutsRouter, pageLayoutSettingsRouter };
}

export const { publicPageLayoutsRouter, pageLayoutSettingsRouter } = createPageLayoutRouters();
