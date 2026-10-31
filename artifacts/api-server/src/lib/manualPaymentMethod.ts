import { and, eq } from "drizzle-orm";
import { db, paymentMethodsTable } from "@workspace/db";

// "credit" is the canonical wallet tender, not a configurable external method.
// Other manually entered tenders must be explicitly selected and active.
export async function validateManualPaymentMethod(
  value: unknown,
  client: Pick<typeof db, "select"> = db,
): Promise<{ method: string } | { error: string }> {
  const method = typeof value === "string" ? value.trim() : "";
  if (!method) return { error: "Mënyra e pagesës është e detyrueshme." };
  if (method === "credit") return { method };

  const [active] = await client.select({ name: paymentMethodsTable.name })
    .from(paymentMethodsTable)
    .where(and(eq(paymentMethodsTable.name, method), eq(paymentMethodsTable.active, true)))
    .limit(1);
  if (!active) return { error: "Mënyra e pagesës nuk është aktive ose nuk ekziston." };
  return { method };
}