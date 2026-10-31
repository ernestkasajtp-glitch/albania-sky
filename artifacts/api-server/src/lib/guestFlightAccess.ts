import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";

export type GuestFlightPolicy = { groupId: number | null };
export const GUEST_ACCESS_KEY = "guest_flight_access";

export function parseGuestFlightPolicy(value: unknown): GuestFlightPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(value, "groupId") ||
      Object.keys(value).some(key => key !== "groupId")) {
    throw new Error("Zgjidhni një grup agjencie ose null.");
  }
  const groupId = (value as GuestFlightPolicy).groupId;
  if (groupId !== null && (typeof groupId !== "number" || !Number.isSafeInteger(groupId) || groupId <= 0)) {
    throw new Error("Grupi duhet të jetë një numër i plotë pozitiv ose null.");
  }
  return { groupId };
}

export async function getGuestFlightPolicy(): Promise<GuestFlightPolicy> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, GUEST_ACCESS_KEY));
  if (!row?.value) return { groupId: null };
  // Old enabled/rules settings and malformed stored values must not grant access.
  try {
    return parseGuestFlightPolicy(JSON.parse(row.value));
  } catch {
    return { groupId: null };
  }
}