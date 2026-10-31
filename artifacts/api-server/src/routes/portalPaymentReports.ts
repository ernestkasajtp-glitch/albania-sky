import type { IRouter, RequestHandler } from "express";
import { db, bookingUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadPortalPaymentReport, parseReportOptions, renderPortalPaymentReport } from "../lib/portalPaymentReport.js";
import { sendEmailStrict } from "../lib/gmail.js";
import { reportOperationalFailure } from "../lib/operationalFailures.js";
import { logger } from "../lib/logger.js";

const busy = new Set<number>();
const coolingDown = new Set<number>();
const validEmail = (v: unknown): v is string => typeof v === "string" && /^[^\s<>,;\r\n@]+@[^\s<>,;\r\n@]+\.[^\s<>,;\r\n@]+$/.test(v);
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function registerPortalPaymentReports(router: IRouter, requireAuth: RequestHandler, deps: {
  client?: typeof db; send?: typeof sendEmailStrict; render?: typeof renderPortalPaymentReport;
  systemRecipient?: () => string | undefined; reportFailure?: typeof reportOperationalFailure;
} = {}) {
  const client = deps.client ?? db;
  const send = deps.send ?? sendEmailStrict;
  router.post("/public/payment-report", requireAuth, async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    let opts;
    try { opts = parseReportOptions(req.body); }
    catch { res.status(400).json({ error: "Zgjidhni një periudhë dhe lloj raporti të vlefshëm." }); return; }
    const [user] = await client.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
    if (!user?.agentId || user.role !== "agent") {
      res.status(403).json({ error: "Raportet janë vetëm për agjencinë tuaj." }); return;
    }
    const agentId = user.agentId;
    if (busy.has(agentId) || coolingDown.has(agentId)) {
      res.status(429).json({ error: "Raporti po përgatitet ose sapo u dërgua. Prisni një minutë para se të provoni sërish." }); return;
    }
    busy.add(agentId);
    try {
      const data = await loadPortalPaymentReport(agentId, opts, client);
      const to = data.agent.email?.trim();
      const systemTo = (deps.systemRecipient ? deps.systemRecipient() : process.env.NOTIFY_EMAIL)?.trim();
      if (!validEmail(to)) {
        res.status(422).json({ error: "Agjencia nuk ka një email të vlefshëm të regjistruar. Kontaktoni administratorin." }); return;
      }
      if (!validEmail(systemTo)) throw new Error("Report notification recipient not configured");
      if (data.rows.length > 10000) {
        res.status(422).json({ error: "Zgjidhni një periudhë më të shkurtër për raportin." }); return;
      }
      const pdf = await (deps.render ?? renderPortalPaymentReport)(data);
      if (pdf.length > 15 * 1024 * 1024) throw new Error("Report attachment too large");
      const filename = `raport-${opts.kind === "debt" ? "detyrimet" : "pagesat"}-${new Date().toISOString().slice(0, 10)}.pdf`;
      const label = opts.kind === "debt" ? "Raport Detyrimet" : "Raport i Detajuar";
      const subject = `${label} - ${data.agent.name.replace(/[\r\n]/g, " ")}`;
      const html = `<h2>KINGS TRAVEL</h2><p>${escape(label)} — ${escape(data.agent.name)}</p><p>Periudha: ${escape(opts.dateFrom || "Fillimi")} — ${escape(opts.dateTo || "Sot")}</p><p>Dokumenti PDF është bashkëngjitur.</p>`;
      const attachments = [{ filename, content: pdf, mimeType: "application/pdf" }];
      // Separate messages: the agency never receives system recipients in To/CC.
      // A successful download always has the exact same PDF accepted by SMTP.
      await send(systemTo, subject, html, attachments);
      if (to.toLowerCase() !== systemTo.toLowerCase()) await send(to, subject, html, attachments);
      coolingDown.add(agentId);
      setTimeout(() => coolingDown.delete(agentId), 60_000).unref();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdf);
    } catch (err) {
      logger.error({ err, agentId }, "Portal payment report failed");
      await (deps.reportFailure ?? reportOperationalFailure)(`portal-payment-report:${agentId}`, "Raporti i pagesave nga portali", err, false).catch(() => {});
      res.status(502).json({ error: "Raporti nuk përfundoi me sukses. Provoni sërish ose kontaktoni administratorin." });
    } finally { busy.delete(agentId); }
  });
}
