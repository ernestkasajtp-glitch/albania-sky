import assert from "node:assert/strict";
import { once } from "node:events";
import { mock, test, after } from "node:test";
import express from "express";
import ExcelJS from "exceljs";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { client, initialize, reset, messages, failures, recoveryCopies, smtp } from "./agentActivityReport.fixture";
import { sendDailyAgentActivityReport, buildAgentActivityPdf } from "../src/lib/agentActivityReport";
// A separately bundled module has its own `running` flag, but shares the SQL DB.
// @ts-expect-error test-only esbuild virtual module
import { sendDailyAgentActivityReport as independentWorker } from "independent-report-worker";
import agentsRouter from "../src/routes/agents";

// Synthetic configuration only. The real nodemailer module is replaced at build time,
// including email failure notifications; no SMTP socket can be opened by this suite.
process.env.NOTIFY_EMAIL = "activity-report@example.invalid";
process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_USER = "test@example.invalid";
process.env.SMTP_PASS = "test-only";
process.env.GMAIL_FROM = "test@example.invalid";

await initialize();
const app = express();
app.use((req, _res, next) => {
  (req as any).session = req.headers["x-test-role"] ? { role: req.headers["x-test-role"] } : undefined;
  next();
});
app.use(agentsRouter);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
after(async () => {
  mock.timers.reset();
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  await client.close();
});

async function pdfText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const lines: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
    for (const stream of streams) {
      assert.ok(stream instanceof PDFRawStream);
      const commands = Buffer.from(decodePDFRawStream(stream).decode()).toString();
      for (const match of commands.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
        lines.push(new TextDecoder("windows-1252").decode(Buffer.from(match[1], "hex")));
    }
  }
  assert.ok(lines.length, "PDF text extraction must not silently return empty");
  return lines.join("\n");
}
async function seed() {
  await reset();
  await client.exec(`INSERT INTO agents (id,name,company) VALUES
    (1,'Alpha Agency','Alpha'),(2,'Beta Agency','Beta'),(3,'Inactive Agency','Inactive')`);
}
async function activity(agent: number, at: string, description: string, type = "search") {
  await client.query(`INSERT INTO agent_activity
    (agent_id,type,description,created_at,method,path,status_code)
    VALUES ($1,$2,$3,$4,'GET','/public/flights',200)`, [agent, type, description, at]);
}
async function state(day: string) {
  return (await client.query<{ value: string }>("SELECT value FROM settings WHERE key=$1",
    [`agent_activity_daily:${day}`])).rows[0]?.value;
}
function clock(iso: string) {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
}
async function ordinaryDay() {
  await seed();
  clock("2026-10-28T23:01:00Z"); // 00:01 Tirane, report October 28
  await activity(1, "2026-10-28T09:00:00Z", "ALPHA_ONLY");
  await activity(2, "2026-10-28T10:00:00Z", "BETA_ONLY");
}

test("daily orchestration sends one central email with isolated per-agent PDFs", async () => {
  await ordinaryDay();
  await sendDailyAgentActivityReport();
  assert.equal(messages.length, 1);
  const mail = messages[0];
  assert.equal(mail.to, "activity-report@example.invalid");
  assert.equal(mail.cc, undefined);
  assert.equal(mail.bcc, undefined);
  assert.match(mail.subject, /2026-10-28/);
  assert.equal(mail.attachments.length, 2);
  assert.equal(await state("2026-10-28"), "sent");
  for (const [id, name, own, other] of [[1, "Alpha_Agency", "ALPHA_ONLY", "BETA_ONLY"], [2, "Beta_Agency", "BETA_ONLY", "ALPHA_ONLY"]] as const) {
    const attachment = mail.attachments.find((a: any) => a.filename === `aktiviteti-${name}-${id}-2026-10-28.pdf`);
    assert.ok(attachment);
    assert.equal(attachment.contentType, "application/pdf");
    const text = await pdfText(attachment.content);
    assert.ok(text.includes(own));
    assert.ok(!text.includes(other));
    assert.ok(!text.includes("Inactive"));
    assert.match(text, /Gjithsej: 1 regjistrime/);
  }
  assert.notDeepEqual(mail.attachments[0].content, mail.attachments[1].content);
  await independentWorker();
  assert.equal(messages.length, 1, "persisted sent claim prevents another worker sending again");
  assert.equal(failures.length, 0);
});

test("overlapping local and independent workers send only once while SMTP is pending", async () => {
  await ordinaryDay();
  let release!: () => void;
  smtp.hold = new Promise<void>(r => { release = r; });
  const entered = new Promise<void>(r => { smtp.entered = r; });
  const first = sendDailyAgentActivityReport();
  try {
    await entered;
    assert.equal(await state("2026-10-28"), "sending");
    await Promise.all([sendDailyAgentActivityReport(), independentWorker()]);
    assert.equal(messages.length, 1);
    assert.equal(await state("2026-10-28"), "sending");
  } finally { release(); await first; }
  assert.equal(await state("2026-10-28"), "sent");
});

test("two independent workers racing for a fresh SQL claim send once", async () => {
  await ordinaryDay();
  await Promise.all([sendDailyAgentActivityReport(), independentWorker()]);
  assert.equal(messages.length, 1);
  assert.equal(await state("2026-10-28"), "sent");
  assert.equal((await client.query("SELECT * FROM settings")).rows.length, 1);
  assert.equal(failures.length, 0);
});

for (const rejection of [false, true]) test(`SMTP ${rejection ? "recipient rejection" : "exception"} never marks sent`, async () => {
  await ordinaryDay();
  smtp.fail = !rejection;
  smtp.reject = rejection;
  await sendDailyAgentActivityReport();
  assert.equal(messages.length, 1);
  assert.equal(await state("2026-10-28"), "failed_or_uncertain");
  assert.equal(failures.length, 1);
  assert.equal(failures[0][0], "agent-activity-report");
  assert.equal(recoveryCopies.length, 1);
  await independentWorker();
  assert.equal(messages.length, 1, "uncertain outcome is not automatically resent");
});

test("no activity means no email and no claim", async () => {
  await seed();
  await sendDailyAgentActivityReport();
  assert.equal(messages.length, 0);
  assert.equal((await client.query("SELECT * FROM settings")).rows.length, 0);
});

for (const [day, now, from, to] of [
  ["2026-03-29", "2026-03-29T22:01:00Z", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
  ["2026-10-25", "2026-10-25T23:01:00Z", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
]) test(`SQL and daily scheduler respect DST boundaries for ${day}`, async () => {
  await seed();
  clock(now);
  await activity(1, new Date(Date.parse(from) - 1).toISOString(), "BEFORE_DAY");
  await activity(1, from, "EXACT_START");
  await activity(1, new Date(Date.parse(to) - 1).toISOString(), "LAST_MILLISECOND");
  await activity(1, to, "NEXT_DAY");
  await activity(2, to, "BETA_NEXT_DAY");
  await sendDailyAgentActivityReport();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].attachments.length, 1);
  assert.match(messages[0].subject, new RegExp(day));
  const text = await pdfText(messages[0].attachments[0].content);
  assert.ok(text.includes("EXACT_START") && text.includes("LAST_MILLISECOND"));
  assert.ok(!text.includes("BEFORE_DAY") && !text.includes("NEXT_DAY"));
  assert.match(text, /Gjithsej: 2 regjistrime/);
  assert.equal(await state(day), "sent");
});

test("real PDF route is admin-only and descriptions agree with real Excel export", async () => {
  await ordinaryDay();
  await activity(1, "2026-10-28T11:00:00Z", "Kërkesë API GET /public/flights", "api");
  await activity(1, "2026-10-28T12:00:00Z", "Legacy raw description", "action");
  for (const role of [undefined, "agent", "agent_staff", "manager"]) {
    const response = await fetch(`${base}/agents/1/activity/pdf`, {
      headers: role ? { "x-test-role": role } : {},
    });
    assert.equal(response.status, 403, `role ${role}`);
    assert.match(response.headers.get("content-type")!, /json/);
  }
  const get = (suffix: string) => fetch(`${base}/agents/1/activity/${suffix}`, { headers: { "x-test-role": "admin" } });
  const pdf = await get("pdf?day=2026-10-28");
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type")!, /application\/pdf/);
  assert.equal(pdf.headers.get("cache-control"), "private, no-store");
  const text = await pdfText(new Uint8Array(await pdf.arrayBuffer()));
  const excel = await get("export");
  assert.equal(excel.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const descriptions = workbook.worksheets[0].getColumn(3).values.slice(2);
  assert.equal(descriptions.length, 3);
  for (const description of descriptions) assert.ok(text.includes(String(description)), String(description));
  assert.ok(!text.includes("Kërkesë API"));
  assert.ok(!text.includes("Legacy raw description"));
  assert.ok(!text.includes("BETA_ONLY"));
  const filtered = await get("pdf?day=2026-10-28&type=api");
  const filteredText = await pdfText(new Uint8Array(await filtered.arrayBuffer()));
  assert.match(filteredText, /Gjithsej: 1 regjistrime/);
  assert.ok(!filteredText.includes("ALPHA_ONLY"));
  assert.equal((await get("pdf?day=2026-02-30")).status, 400);
  assert.equal((await fetch(`${base}/agents/999/activity/pdf`, { headers: { "x-test-role": "admin" } })).status, 404);
});

test("DB-backed PDF pagination neither drops nor repeats activity after 500 rows", async () => {
  await seed();
  await client.exec(`INSERT INTO agent_activity (agent_id,type,description,created_at)
    SELECT 1,'search','ROW_' || n || '_END','2026-10-28T12:00:00Z' FROM generate_series(1,501) n`);
  const text = await pdfText(await buildAgentActivityPdf(1, "Alpha Agency", "2026-10-28"));
  assert.match(text, /Gjithsej: 501 regjistrime/);
  for (let i = 1; i <= 501; i++) assert.equal(text.split(`ROW_${i}_END`).length - 1, 1);
});
