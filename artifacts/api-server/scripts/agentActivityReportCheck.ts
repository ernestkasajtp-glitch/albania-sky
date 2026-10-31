// Read-only release check. Generates one PDF in memory; never sends email.
import { db, agentActivityTable, agentsTable } from "@workspace/db";
import { and, eq, gte, lt } from "drizzle-orm";
import { activityDayRange, buildAgentActivityPdf } from "../src/lib/agentActivityReport";
import { tiraneMinute } from "../src/lib/discountCampaignMath";
import { isModuleEnabled } from "../src/lib/moduleControls";
import { PDFDocument } from "pdf-lib";
async function main() {
  const day = tiraneMinute().slice(0, 10);
  const [from, to] = activityDayRange(day);
  const [sample] = await db.select({ id: agentsTable.id, name: agentsTable.name })
    .from(agentActivityTable).innerJoin(agentsTable, eq(agentsTable.id, agentActivityTable.agentId))
    .where(and(gte(agentActivityTable.createdAt, from), lt(agentActivityTable.createdAt, to))).limit(1);
  console.log({ reportsEnabled: await isModuleEnabled("reports"), recipientConfigured: Boolean(process.env.NOTIFY_EMAIL), day });
  if (sample) {
    const buffer = await buildAgentActivityPdf(sample.id, sample.name, day);
    const document = await PDFDocument.load(buffer);
    console.log({ pdfGenerated: true, pages: document.getPageCount(), bytes: buffer.length });
  } else console.log({ noActivityToday: true });
}
main().then(() => process.exit(0)).catch(e => { console.error({ error: e?.message }); process.exit(1); });
