import { createHash } from "node:crypto";

// Includes child rows: updatedAt alone misses concurrent passenger/payment edits.
export function bookingSaveVersion(booking: unknown, passengers: any[], payments: any[], extras: any[]): string {
  const sorted = (rows: any[]) => [...rows].sort((a, b) => a.id - b.id);
  return createHash("sha256").update(JSON.stringify([booking, sorted(passengers), sorted(payments), sorted(extras)])).digest("hex");
}