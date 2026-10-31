import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";

export type AgentGroupPeriod = { groupId: number; dateFrom: string; dateTo: string };

export function validGroupPeriodDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validGroupPeriod(from: unknown, to: unknown): from is string {
  return validGroupPeriodDate(from) && validGroupPeriodDate(to) && from <= to;
}

const keyFor = (agentId: number) => `agent_group_period:${agentId}`;

export async function getAgentGroupPeriod(agentId: number, groupId: number): Promise<AgentGroupPeriod | null> {
  const [row] = await db.select({ value: settingsTable.value }).from(settingsTable)
    .where(eq(settingsTable.key, keyFor(agentId)));
  if (typeof row?.value !== "string") return null;
  try {
    const value: unknown = JSON.parse(row.value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const period = value as Record<string, unknown>;
      if (period.groupId === groupId && validGroupPeriod(period.dateFrom, period.dateTo)) {
        return { groupId, dateFrom: period.dateFrom as string, dateTo: period.dateTo as string };
      }
    }
  } catch { /* Corrupt settings cannot grant access. */ }
  return null;
}

export async function setAgentGroupPeriod(agentId: number, period: AgentGroupPeriod): Promise<void> {
  const value = JSON.stringify(period);
  await db.insert(settingsTable).values({ key: keyFor(agentId), value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

export async function clearAgentGroupPeriod(agentId: number): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, keyFor(agentId)));
}