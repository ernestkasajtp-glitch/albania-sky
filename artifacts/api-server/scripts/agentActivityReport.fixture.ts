import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agentsTable, agentActivityTable, settingsTable } from "../../../lib/db/src/schema";

// No connection string is read: all SQL runs against an ephemeral PostgreSQL engine.
export const client = new PGlite();
export const db = drizzle(client);
export const pool = { query: () => { throw new Error("Unexpected pool access in activity test"); } };
export const messages: any[] = [];
export const failures: any[] = [];
export const recoveryCopies: any[] = [];
export const smtp = {
  fail: false,
  reject: false,
  hold: undefined as undefined | Promise<void>,
  entered: undefined as undefined | (() => void),
};
export const transport = {
  createTransport() {
    return {
      async sendMail(message: any) {
        messages.push(message);
        smtp.entered?.();
        await smtp.hold;
        if (smtp.fail) throw new Error("Synthetic SMTP failure");
        return { rejected: smtp.reject ? [message.to] : [] };
      },
      close() {},
    };
  },
};
export async function initialize() {
  // Use the real Drizzle columns/types so route SELECT * includes new agent fields.
  // Only the three tables used here are created; no production schema is migrated.
  for (const table of [agentsTable, agentActivityTable, settingsTable]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c =>
      `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`);
    await client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
}
export async function reset() {
  await client.exec("TRUNCATE agent_activity, agents, settings RESTART IDENTITY");
  messages.length = failures.length = recoveryCopies.length = 0;
  smtp.fail = smtp.reject = false;
  smtp.hold = smtp.entered = undefined;
}
