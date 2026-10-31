// Read-only provider lookup. Never prints credentials, URLs, payer data or tokens.
import { db, bookingsTable, pokOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPokAccountById } from "../src/lib/pokAccounts";
import { pokPaymentEvidence, isProviderExpiredUnpaid } from "../src/lib/pokOrderPolicy";

async function main() {
  const ref = process.argv[2];
  if (!/^KTF\d+$/.test(ref ?? "")) throw new Error("Booking reference required");
  const rows = await db.select({ order: pokOrdersTable })
    .from(pokOrdersTable).innerJoin(bookingsTable, eq(bookingsTable.id, pokOrdersTable.bookingId))
    .where(eq(bookingsTable.bookingRef, ref));
  for (const { order } of rows) {
    const account = await getPokAccountById(order.accountId);
    if (!account || !order.providerOrderId) {
      console.log({ localId: order.id, missingAccountOrOrder: true }); continue;
    }
    const auth = await fetch("https://api.pokpay.io/auth/sdk/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: account.keyId, keySecret: account.keySecret }),
      signal: AbortSignal.timeout(15000),
    });
    console.log({ localId: order.id, authHttpStatus: auth.status });
    if (!auth.ok) continue;
    const token = (await auth.json() as any)?.data?.accessToken;
    if (!token) { console.log({ missingToken: true }); continue; }
    const response = await fetch(`https://api.pokpay.io/merchants/${account.merchantId}/sdk-orders/${order.providerOrderId}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    });
    console.log({ orderHttpStatus: response.status });
    if (!response.ok) continue;
    const data = await response.json() as any;
    const remote = data?.data?.sdkOrder ?? data?.data ?? data;
    console.log({
      localStatus: order.status, localExpired: order.expiresAt.getTime() < Date.now(),
      hasConfirmUrl: Boolean(order.confirmUrl),
      evidence: pokPaymentEvidence(remote, order.providerOrderId, ref, order.amount),
      eligibleForExpiredLinkReplacement: isProviderExpiredUnpaid(remote, order.providerOrderId, ref, order.amount),
      providerFields: Object.keys(remote ?? {}),
      status: remote.status, isCompleted: remote.isCompleted, isCaptured: remote.isCaptured,
      isExpired: remote.isExpired, isCancelled: remote.isCancelled,
      currencyCode: remote.currencyCode, amount: remote.amount, finalAmount: remote.finalAmount,
      capturedAmount: remote.capturedAmount,
    });
  }
}
main().then(() => process.exit(0)).catch(e => {
  console.error({ diagnosticFailed: true, errorType: e?.name }); process.exit(1);
});
