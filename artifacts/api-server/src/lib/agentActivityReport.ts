import { db, agentActivityTable, agentsTable, settingsTable } from "@workspace/db";
import { and, eq, gte, lt, gt, asc, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { bannerWallTimeMs } from "./offerBannerMath";
import { tiraneMinute } from "./discountCampaignMath";
import { activityApiDescription } from "./activityDescription";
import { sendEmailStrict } from "./gmail";
import { reportOperationalFailure } from "./operationalFailures";
import { ACTIVITY_REPORT_CURSOR, ACTIVITY_REPORT_PREFIX, recoverActivityReports } from "./agentActivityRecovery";

export function previousActivityDay(now = new Date()) {
  const today = tiraneMinute(now).slice(0, 10);
  return new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
export function activityDayRange(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Datë e pavlefshme");
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return [new Date(bannerWallTimeMs(`${day}T00:00`)), new Date(bannerWallTimeMs(`${next}T00:00`))] as const;
}
export function readableActivity(row: { type: string; description: string | null; method: string | null; path: string | null; statusCode: number | null }) {
  if (row.type === "action") return `API historike (jo klikim): ${row.method ?? ""} ${row.path ?? ""}`;
  if (row.type === "api" && row.description?.startsWith("Kërkesë API"))
    return activityApiDescription(row.method ?? "GET", row.path ?? "/", row.statusCode ?? 200);
  return row.description ?? "";
}
const clean = (s: string) => s.replace(/→/g, " -> ").replace(/[—–]/g, "-").replace(/[^\x20-\x7e\xa0-\xff€]/g, " ");

export async function buildAgentActivityPdf(agentId: number, name: string, day?: string, type?: string) {
  const range = day ? activityDayRange(day) : null;
  const filters = [eq(agentActivityTable.agentId, agentId),
    ...(range ? [gte(agentActivityTable.createdAt, range[0]), lt(agentActivityTable.createdAt, range[1])] : []),
    ...(type && type !== "all" ? [eq(agentActivityTable.type, type)] : [])];
  const [{ maxId }] = await db.select({ maxId: sql<number>`coalesce(max(${agentActivityTable.id}),0)::int` })
    .from(agentActivityTable).where(and(...filters));
  async function* batches() {
    let cursor = 0;
    while (cursor < maxId) {
      const rows = await db.select().from(agentActivityTable)
        .where(and(...filters, gt(agentActivityTable.id, cursor), sql`${agentActivityTable.id} <= ${maxId}`))
        .orderBy(asc(agentActivityTable.id)).limit(500);
      if (!rows.length) break;
      yield rows;
      cursor = rows[rows.length - 1].id;
    }
  }
  return renderActivityPdf(name, day, batches());
}
export async function renderActivityPdf(name: string, day: string | undefined, batches: AsyncIterable<(typeof agentActivityTable.$inferSelect)[]>) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage(), y = 800, pages = 1, count = 0;
  function line(value: string, size = 9) {
    const text = clean(value);
    let chunk = "";
    for (const char of text) {
      if (font.widthOfTextAtSize(chunk + char, size) > 510) { draw(chunk, size); chunk = ""; }
      chunk += char;
    }
    draw(chunk, size);
  }
  function draw(text: string, size: number) {
    if (y < 45) {
      if (++pages > 2000) throw new Error("Raporti është shumë i madh; zgjidhni një ditë për shkarkim.");
      page = doc.addPage(); y = 800;
    }
    page.drawText(text, { x: 40, y, font, size, color: rgb(.12, .17, .23) }); y -= size + 5;
  }
  line(`Aktiviteti - ${name}`, 15);
  line(day ? `Dita: ${day} | Europe/Tirane` : "Historiku i aktivitetit");
  line("Klikimet/kërkimet janë raportime nga shfletuesi. API = kërkesa sistemi, jo klikime.");
  for await (const rows of batches) {
    for (const row of rows) {
      line(`${row.createdAt.toLocaleString("sq-AL", { timeZone: "Europe/Tirane" })} | ${row.type} | #${row.id}`);
      line(readableActivity(row));
      line(`IP: ${row.ip ?? "-"} | ${row.userAgent ?? "-"}`, 8);
      y -= 7; count++;
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  line(`Gjithsej: ${count} regjistrime`, 11);
  return Buffer.from(await doc.save());
}

let running = false;
export async function sendDailyAgentActivityReport() {
  if (running) return;
  running = true;
  try {
    await recoverActivityReports({
      markers: () => db.select().from(settingsTable)
        .where(sql`${settingsTable.key} like 'agent\\_activity\\_daily:%'`),
      async initializeCursor(day) {
        await db.insert(settingsTable).values({ key: ACTIVITY_REPORT_CURSOR, value: day })
          .onConflictDoNothing();
        const [cursor] = await db.select().from(settingsTable).where(eq(settingsTable.key, ACTIVITY_REPORT_CURSOR));
        if (!cursor?.value) throw new Error("Mungon pika e vazhdimit të raportit të aktivitetit");
        return cursor.value;
      },
      async advanceCursor(day) {
        // Multiple server instances cannot move the shared cursor backwards.
        await db.update(settingsTable).set({
          value: sql`greatest(${settingsTable.value}, ${day})`, updatedAt: new Date(),
        }).where(eq(settingsTable.key, ACTIVITY_REPORT_CURSOR));
      },
      sendDay: sendAgentActivityReportForDay,
      async alert(day, state) {
        await reportOperationalFailure(`agent-activity-report:${day}`,
          `Raporti i aktivitetit — ${day}`,
          new Error(`Gjendja "${state}" ka mbetur pezull mbi 1 orë. Kontrolloni dërgimin para çdo ridërgimi manual; email-i mund të jetë pranuar nga SMTP. Nuk ridërgohet automatikisht.`));
      },
    });
  } catch (error) {
    await reportOperationalFailure("agent-activity-report-recovery", "Rikuperimi i raporteve të aktivitetit", error);
  } finally { running = false; }
}

async function sendAgentActivityReportForDay(day: string) {
  const key = `${ACTIVITY_REPORT_PREFIX}${day}`;
  let claimed = false;
  try {
    const [from, to] = activityDayRange(day);
    // Uses the existing (agent_id, created_at) index; no full activity-table scan.
    const agents = await db.select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable).where(sql`exists (
        select 1 from ${agentActivityTable}
        where ${agentActivityTable.agentId} = ${agentsTable.id}
          and ${agentActivityTable.createdAt} >= ${from}
          and ${agentActivityTable.createdAt} < ${to}
      )`);
    if (!agents.length) return;
    if (!process.env.NOTIFY_EMAIL) throw new Error("Mungon adresa e raportit të aktivitetit");
    const inserted = await db.insert(settingsTable).values({ key, value: "preparing" }).onConflictDoNothing().returning();
    if (!inserted.length) return;
    claimed = true;
    const attachments = [];
    let bytes = 0;
    for (const agent of agents) {
      const content = await buildAgentActivityPdf(agent.id, agent.name, day);
      bytes += content.length;
      if (bytes > 18 * 1024 * 1024) throw new Error("PDF-të kalojnë kufirin e sigurt të emailit; raporti nuk u dërgua pjesërisht.");
      const safeName = agent.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
      attachments.push({ filename: `aktiviteti-${safeName}-${agent.id}-${day}.pdf`, content, mimeType: "application/pdf" });
    }
    await db.update(settingsTable).set({ value: "sending", updatedAt: new Date() }).where(eq(settingsTable.key, key));
    await sendEmailStrict(process.env.NOTIFY_EMAIL, `Aktiviteti i agjentëve — ${day}`,
      `<p>Aktiviteti i datës ${day}. Bashkëngjitur ${agents.length} PDF, një për çdo agjent me aktivitet.</p>`, attachments);
    await db.update(settingsTable).set({ value: "sent", updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } catch (error) {
    if (claimed) await db.update(settingsTable).set({ value: "failed_or_uncertain", updatedAt: new Date() }).where(eq(settingsTable.key, key)).catch(() => {});
    await reportOperationalFailure(`agent-activity-report:${day}`, `Raporti ditor i aktivitetit — ${day}`, error);
    // Before claiming there is no SMTP attempt: keep the cursor here so a
    // temporary DB/configuration failure is retried on the next recovery pass.
    if (!claimed) throw error;
  }
}
