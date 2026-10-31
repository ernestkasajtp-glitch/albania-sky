// ─────────────────────────────────────────────────────────────────────────────
// Admin Email — inbox i brendshëm për adresën e dedikuar (onlinetiketing).
// Lexon email-et me IMAP (imapflow) dhe përgjigjet me SMTP (nodemailer),
// të dyja me të njëjtin App Password. VETËM për adminët (mount me requireAdmin).
// NUK prek asnjë rrugë tjetër — as API-në e partnerëve (/v1).
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type IRouter, type Request, type Response } from "express";
import { ImapFlow } from "imapflow";
import { simpleParser, type MailAttachment } from "mailparser";
import nodemailer from "nodemailer";
import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { shortSingleFlight } from "../lib/shortSingleFlight";

const router: IRouter = Router();

// ── Çelësi global i modulit Email (ndizet/fiket nga Settings) ────────────────
const EMAIL_ENABLED_KEY = "admin_email_enabled";

async function isAdminEmailEnabled(): Promise<boolean> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, EMAIL_ENABLED_KEY));
  return rows[0]?.value !== "false"; // default: ndezur
}

// GET /admin-email/enabled — statusi i çelësit (lexohet edhe nga Settings)
router.get("/admin-email/enabled", async (_req: Request, res: Response) => {
  res.json({ enabled: await isAdminEmailEnabled() });
});

// PUT /admin-email/enabled — ndiz/fik krejt modulin e email-it
router.put("/admin-email/enabled", async (req: Request, res: Response) => {
  const enabled = req.body?.enabled === true || req.body?.enabled === "true";
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, EMAIL_ENABLED_KEY));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value: enabled ? "true" : "false", updatedAt: new Date() }).where(eq(settingsTable.key, EMAIL_ENABLED_KEY));
  } else {
    await db.insert(settingsTable).values({ key: EMAIL_ENABLED_KEY, value: enabled ? "true" : "false" });
  }
  res.json({ enabled });
});

// Kur çelësi është FIKUR, të gjitha rrugët e tjera /admin-email/* kthejnë 503
// (edhe poll-i "booking-latest" i panelit ndalon vetë me 503).
router.use("/admin-email", async (req: Request, res: Response, next) => {
  if (req.path === "/enabled" || req.path === "/admin-email/enabled") { next(); return; }
  if (await isAdminEmailEnabled()) { next(); return; }
  res.status(503).json({ error: "Moduli i email-it është i çaktivizuar nga Settings" });
});

function inboxConfig(): { user: string; pass: string } | null {
  const user = (process.env.ADMIN_INBOX_USER || "").trim();
  const pass = (process.env.ADMIN_INBOX_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

// Kufij sigurie: mos parse-o email-e gjigante, mos inline-o imazhe të mëdha
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15MB email i plotë
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB për imazh cid
const MAX_INLINE_IMAGES = 20;

/** Heq CR/LF dhe karaktere kontrolli nga fushat e header-ave SMTP (anti header-injection). */
function cleanHeader(v: string): string {
  return v.replace(/[\r\n\x00-\x1F\x7F]+/g, " ").trim();
}

/** Adresat e lejuara si dërgues (duhen konfiguruar "Send mail as" në Gmail). */
function allowedSenders(cfg: { user: string }): string[] {
  const extra = (process.env.ADMIN_INBOX_SENDERS || "")
    .split(",").map(a => a.trim().toLowerCase()).filter(a => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  const all = [cfg.user.toLowerCase(), ...extra];
  return [...new Set(all)];
}

function newClient(cfg: { user: string; pass: string }) {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
}

/** Inline-on imazhet cid: që email-i të shfaqet i plotë në iframe. */
function inlineCidImages(html: string, attachments: MailAttachment[] | undefined): string {
  if (!html || !attachments?.length) return html;
  let out = html;
  let inlined = 0;
  for (const att of attachments) {
    if (inlined >= MAX_INLINE_IMAGES) break;
    const cid = String(att.cid || "").replace(/[<>]/g, "");
    if (!cid || !att.content) continue;
    if (att.content.length > MAX_INLINE_IMAGE_BYTES) continue;
    if (att.contentType && !/^image\//i.test(att.contentType)) continue;
    inlined++;
    const dataUrl = `data:${att.contentType || "image/png"};base64,${att.content.toString("base64")}`;
    out = out.split(`cid:${cid}`).join(dataUrl);
  }
  return out;
}

/** Mailbox-i (label-i i Gmail) nga query — i kufizuar dhe pa karaktere kontrolli. */
function mailboxParam(req: Request): string {
  const raw = String(req.query.mailbox ?? "INBOX").slice(0, 200);
  const mb = raw.replace(/[\r\n\x00-\x1F\x7F"]/g, "").trim();
  return mb || "INBOX";
}

// GET /admin-email/labels — lista e label-eve (mailbox-eve) të Gmail
router.get("/admin-email/labels", async (_req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  const client = newClient(cfg);
  try {
    await client.connect();
    const boxes = await client.list();
    await client.logout();
    const labels = boxes
      .filter((b: any) => !b.flags?.has?.("\\Noselect") && b.path !== "[Gmail]")
      .map((b: any) => ({ path: b.path, name: b.path === "INBOX" ? "Inbox" : String(b.path).replace(/^\[Gmail\]\//, "") }))
      .sort((a: any, b: any) => (a.path === "INBOX" ? -1 : b.path === "INBOX" ? 1 : a.name.localeCompare(b.name)));
    res.json({ labels });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    logger.error({ err }, "[admin-email] gabim gjatë leximit të label-eve");
    res.status(502).json({ error: `Gabim lidhjeje me inbox-in: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

// GET /admin-email/booking-latest — UID-i më i ri + numri i palexuar i email-eve
// "NEW BOOKING:" në Inbox. Përdoret nga paneli për zile/njoftim kur vjen
// një rezervim i ri me email (poll i lehtë, pa trupa mesazhesh).
const readBookingLatest = shortSingleFlight(async () => {
  const cfg = inboxConfig();
  if (!cfg) throw new Error("Inbox configuration unavailable");
  const client = newClient(cfg);
  // Limit only this informational poll, not normal inbox reads/sends.
  const deadline = setTimeout(() => client.close(), 20_000);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
    const all = await client.search({ subject: "NEW BOOKING:" }, { uid: true });
    const unseen = await client.search({ subject: "NEW BOOKING:", seen: false }, { uid: true });
    await client.logout();
    const uids: number[] = Array.isArray(all) ? all : [];
    return {
      maxUid: uids.length ? Math.max(...uids) : 0,
      unseen: Array.isArray(unseen) ? unseen.length : 0,
    };
  } finally {
    clearTimeout(deadline);
    client.close();
  }
}, 30_000);

router.get("/admin-email/booking-latest", async (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!inboxConfig()) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  try {
    res.json(await readBookingLatest());
  } catch (err: any) {
    logger.error({ err }, "[admin-email] gabim te booking-latest");
    res.status(502).json({ error: "Gabim lidhjeje me inbox-in" });
  }
});

// GET /admin-email/status — a është konfiguruar inbox-i
router.get("/admin-email/status", (_req: Request, res: Response) => {
  const cfg = inboxConfig();
  res.json({ configured: !!cfg, address: cfg?.user ?? null });
});

// GET /admin-email/messages?limit=30&beforeUid=123&search=teksti
// Lista e email-eve (më të rinjtë të parët). beforeUid = faqja tjetër (më të vjetër).
router.get("/admin-email/messages", async (req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i i email-it s'është konfiguruar (ADMIN_INBOX_USER/PASS)" }); return; }
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const beforeUid = parseInt(String(req.query.beforeUid ?? "0"), 10) || 0;
  const search = String(req.query.search ?? "").trim();
  const unseenOnly = String(req.query.unseen ?? "") === "1";
  // Booking-et e Albania Sky (subjekt "NEW BOOKING:"): fshihen si default në Inbox,
  // shfaqen vetëm kur zgjidhet opsioni i tyre në dropdown.
  const bookings = String(req.query.bookings ?? ""); // "hide" | "only" | ""
  const mailbox = mailboxParam(req);

  const client = newClient(cfg);
  try {
    await client.connect();
    const mbox = await client.mailboxOpen(mailbox, { readOnly: true });

    // UID-të kandidatë (kërkim/filtra ose të gjithë), pastaj dritarja e faqes.
    const q: any = {};
    if (search) q.or = [{ from: search }, { subject: search }];
    if (unseenOnly) q.seen = false;
    if (bookings === "hide") q.not = { subject: "NEW BOOKING:" };
    else if (bookings === "only") q.subject = "NEW BOOKING:";
    if (!search && !unseenOnly && !bookings) q.all = true;
    const found = await client.search(q, { uid: true });
    let uids: number[] = Array.isArray(found) ? found : [];
    uids.sort((a, b) => b - a); // më të rinjtë të parët
    if (beforeUid > 0) uids = uids.filter(u => u < beforeUid);
    const page = uids.slice(0, limit);

    const items: any[] = [];
    if (page.length > 0) {
      for await (const msg of client.fetch(page.slice().sort((a, b) => a - b).join(","), { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
        const env = msg.envelope;
        const fromAddr = env?.from?.[0];
        // A ka attachment të vërtetë (jo imazhe inline)
        const hasAttachment = (function walk(node: any): boolean {
          if (!node) return false;
          if (node.disposition === "attachment") return true;
          return Array.isArray(node.childNodes) ? node.childNodes.some(walk) : false;
        })(msg.bodyStructure);
        items.push({
          uid: msg.uid,
          subject: env?.subject || "(pa subjekt)",
          from: fromAddr ? { name: fromAddr.name || "", address: fromAddr.address || "" } : null,
          date: env?.date ? new Date(env.date).toISOString() : null,
          seen: msg.flags?.has("\\Seen") ?? false,
          answered: msg.flags?.has("\\Answered") ?? false,
          hasAttachment,
        });
      }
    }
    items.sort((a, b) => b.uid - a.uid);
    await client.logout();
    res.json({ address: cfg.user, senders: allowedSenders(cfg), total: mbox.exists, items, nextBeforeUid: page.length === limit ? page[page.length - 1] : null });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    logger.error({ err }, "[admin-email] gabim gjatë listimit");
    res.status(502).json({ error: `Gabim lidhjeje me inbox-in: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

// GET /admin-email/messages/:uid — email-i i plotë (e shënon si të lexuar)
router.get("/admin-email/messages/:uid", async (req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  const uid = parseInt(String(req.params.uid), 10);
  if (!uid) { res.status(400).json({ error: "UID i pavlefshëm" }); return; }

  const client = newClient(cfg);
  try {
    await client.connect();
    await client.mailboxOpen(mailboxParam(req)); // jo readOnly — që të shënohet \Seen
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg || typeof msg === "boolean" || !msg.source) {
      await client.logout();
      res.status(404).json({ error: "Email-i nuk u gjet" });
      return;
    }
    if (msg.source.length > MAX_SOURCE_BYTES) {
      await client.logout();
      res.status(413).json({ error: "Email-i është shumë i madh për t'u shfaqur këtu — hape direkt në Gmail" });
      return;
    }
    const parsed = await simpleParser(msg.source);
    try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); } catch {}
    await client.logout();

    const attachments = (parsed.attachments || []).filter(a => a.contentDisposition !== "inline" || !a.cid);
    const html = typeof parsed.html === "string" && parsed.html
      ? inlineCidImages(parsed.html, parsed.attachments)
      : "";
    const senders = allowedSenders(cfg);
    const rcptAddrs = [
      ...(((parsed.to as any)?.value ?? []) as any[]),
      ...(((parsed.cc as any)?.value ?? []) as any[]),
    ].map(a => String(a?.address || "").toLowerCase());
    const suggestedFrom = senders.find(sn => rcptAddrs.includes(sn)) || senders[0];
    res.json({
      uid,
      suggestedFrom,
      senders,
      messageId: parsed.messageId || null,
      subject: parsed.subject || "(pa subjekt)",
      from: parsed.from?.value?.[0] ?? null,
      to: (parsed.to as any)?.value ?? [],
      cc: (parsed.cc as any)?.value ?? [],
      replyTo: (parsed.replyTo as any)?.value?.[0] ?? null,
      date: parsed.date ? parsed.date.toISOString() : null,
      html,
      text: parsed.text || "",
      attachments: attachments.map((a, i) => ({
        idx: i,
        filename: a.filename || `attachment-${i + 1}`,
        contentType: a.contentType || "application/octet-stream",
        size: a.size || (a.content ? a.content.length : 0),
      })),
    });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    logger.error({ err, uid }, "[admin-email] gabim gjatë leximit");
    res.status(502).json({ error: `Gabim lidhjeje me inbox-in: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

// GET /admin-email/messages/:uid/attachments/:idx — shkarko attachment
router.get("/admin-email/messages/:uid/attachments/:idx", async (req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  const uid = parseInt(String(req.params.uid), 10);
  const idx = parseInt(String(req.params.idx), 10);
  if (!uid || Number.isNaN(idx)) { res.status(400).json({ error: "Parametra të pavlefshëm" }); return; }

  const client = newClient(cfg);
  try {
    await client.connect();
    await client.mailboxOpen(mailboxParam(req), { readOnly: true });
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    await client.logout();
    if (!msg || typeof msg === "boolean" || !msg.source) { res.status(404).json({ error: "Email-i nuk u gjet" }); return; }
    if (msg.source.length > MAX_SOURCE_BYTES) { res.status(413).json({ error: "Email-i është shumë i madh — hape direkt në Gmail" }); return; }
    const parsed = await simpleParser(msg.source);
    const attachments = (parsed.attachments || []).filter(a => a.contentDisposition !== "inline" || !a.cid);
    const att = attachments[idx];
    if (!att || !att.content) { res.status(404).json({ error: "Attachment-i nuk u gjet" }); return; }
    const fname = String(att.filename || `attachment-${idx + 1}`).replace(/[^\w.\- ()\[\]]+/g, "_");
    res.setHeader("Content-Type", att.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(att.content);
  } catch (err: any) {
    try { await client.logout(); } catch {}
    logger.error({ err, uid, idx }, "[admin-email] gabim attachment");
    res.status(502).json({ error: `Gabim lidhjeje me inbox-in: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

function smtpTransport(cfg: { user: string; pass: string }) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/** Teksti i thjeshtë → HTML minimal për email-in dalës. */
function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc}</div>`;
}

// POST /admin-email/messages/:uid/reply { text }
router.post("/admin-email/messages/:uid/reply", async (req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  const uid = parseInt(String(req.params.uid), 10);
  const text = String(req.body?.text ?? "").trim();
  const fromReq = cleanHeader(String(req.body?.from ?? "")).toLowerCase();
  if (!uid) { res.status(400).json({ error: "UID i pavlefshëm" }); return; }
  if (!text) { res.status(400).json({ error: "Shkruaj tekstin e përgjigjes" }); return; }
  if (fromReq && !allowedSenders(cfg).includes(fromReq)) { res.status(400).json({ error: "Adresa dërguese s'është në listën e lejuar" }); return; }
  if (text.length > 20000) { res.status(400).json({ error: "Teksti është shumë i gjatë" }); return; }

  const client = newClient(cfg);
  try {
    await client.connect();
    await client.mailboxOpen(mailboxParam(req));
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg || typeof msg === "boolean" || !msg.source) {
      await client.logout();
      res.status(404).json({ error: "Email-i origjinal nuk u gjet" });
      return;
    }
    if (msg.source.length > MAX_SOURCE_BYTES) {
      await client.logout();
      res.status(413).json({ error: "Email-i origjinal është shumë i madh — përgjigju direkt në Gmail" });
      return;
    }
    const parsed = await simpleParser(msg.source);
    const toAddr = cleanHeader(String((parsed.replyTo as any)?.value?.[0]?.address || parsed.from?.value?.[0]?.address || ""));
    if (!toAddr) {
      await client.logout();
      res.status(400).json({ error: "Email-i origjinal s'ka adresë dërguesi" });
      return;
    }
    const origSubject = cleanHeader(parsed.subject || "");
    const subject = /^\s*re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
    const references = [
      ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []),
      ...(parsed.messageId ? [parsed.messageId] : []),
    ];

    const fromAddr = fromReq || (() => {
      const senders = allowedSenders(cfg);
      const rcpt = [
        ...(((parsed.to as any)?.value ?? []) as any[]),
        ...(((parsed.cc as any)?.value ?? []) as any[]),
      ].map(a => String(a?.address || "").toLowerCase());
      return senders.find(sn => rcpt.includes(sn)) || cfg.user;
    })();
    await smtpTransport(cfg).sendMail({
      from: `KINGS TRAVEL <${fromAddr}>`,
      to: toAddr,
      subject,
      text,
      html: textToHtml(text),
      inReplyTo: (parsed.messageId as string | undefined) || undefined,
      references: references.length ? cleanHeader(references.join(" ")) : undefined,
    });
    try { await client.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true }); } catch {}
    await client.logout();
    logger.info({ uid, to: toAddr, from: fromAddr }, "[admin-email] përgjigje u dërgua");
    res.json({ ok: true, to: toAddr, from: fromAddr, subject });
  } catch (err: any) {
    try { await client.logout(); } catch {}
    logger.error({ err, uid }, "[admin-email] gabim gjatë përgjigjes");
    res.status(502).json({ error: `Dërgimi dështoi: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

// POST /admin-email/compose { to, subject, text } — email i ri nga sistemi
router.post("/admin-email/compose", async (req: Request, res: Response) => {
  const cfg = inboxConfig();
  if (!cfg) { res.status(503).json({ error: "Inbox-i s'është konfiguruar" }); return; }
  const to = cleanHeader(String(req.body?.to ?? ""));
  const subject = cleanHeader(String(req.body?.subject ?? ""));
  const text = String(req.body?.text ?? "").trim();
  const fromReq = cleanHeader(String(req.body?.from ?? "")).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { res.status(400).json({ error: "Adresa e marrësit është e pavlefshme" }); return; }
  if (fromReq && !allowedSenders(cfg).includes(fromReq)) { res.status(400).json({ error: "Adresa dërguese s'është në listën e lejuar" }); return; }
  if (!subject) { res.status(400).json({ error: "Shkruaj subjektin" }); return; }
  if (!text) { res.status(400).json({ error: "Shkruaj tekstin e email-it" }); return; }
  if (text.length > 20000) { res.status(400).json({ error: "Teksti është shumë i gjatë" }); return; }

  try {
    await smtpTransport(cfg).sendMail({
      from: `KINGS TRAVEL <${fromReq || cfg.user}>`,
      to,
      subject,
      text,
      html: textToHtml(text),
    });
    logger.info({ to }, "[admin-email] email i ri u dërgua");
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err, to }, "[admin-email] gabim gjatë dërgimit");
    res.status(502).json({ error: `Dërgimi dështoi: ${err?.responseText || err?.message || "e panjohur"}` });
  }
});

export default router;
