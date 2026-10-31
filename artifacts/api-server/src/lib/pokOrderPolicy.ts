export type DurablePokOrder = {
  bookingId: number;
  accountId: number;
  amount: string | number;
  status: string;
  expiresAt: Date;
};

/** A provider order may only be reused by the booking/account that created it. */
export function isPokOrderBound(order: DurablePokOrder, bookingId: number, accountId: number): boolean {
  return order.bookingId === bookingId && order.accountId === accountId;
}

export function canReusePokOrder(
  order: DurablePokOrder,
  bookingId: number,
  accountId: number,
  due: number,
  now = new Date(),
  providerVerifiedUnpaid = false,
): boolean {
  return isPokOrderBound(order, bookingId, accountId)
    && (order.status === "created" || order.status === "pending")
    // The local 55-minute TTL is not evidence that the provider link expired.
    // Only a fresh, bound provider response may override it.
    && (order.expiresAt.getTime() >= now.getTime() || providerVerifiedUnpaid)
    && Math.abs(Number(order.amount) - due) <= 0.009;
}

export function shouldSupersedePokOrder(status: string, createNewLinkEachAttempt: boolean, providerVerifiedUnpaid: boolean): boolean {
  return createNewLinkEachAttempt && providerVerifiedUnpaid && (status === "created" || status === "pending");
}

export function isPokIntentUnresolved(status: string): boolean {
  return status === "creating" || status === "unknown";
}

/** Local expiry alone never authorizes replacement; require bound fresh evidence. */
export function isProviderExpiredUnpaid(order: any, providerOrderId: string, bookingRef: string, amount: string | number): boolean {
  return String(order?.status ?? "").toLowerCase() === "expired"
    && pokPaymentEvidence(order, providerOrderId, bookingRef, amount).kind === "unpaid";
}

export function canRetryPokIntent(status: string): boolean {
  return status === "failed" || status === "expired";
}

export function terminalPokFailureStatus(status: unknown): "failed" | "cancelled" | "expired" | null {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "failed" || normalized === "cancelled" || normalized === "expired"
    ? normalized : null;
}

/** Only these provider responses are safe to classify as pre-creation
 * validation/auth rejection.  409/404/429/5xx and gateway responses can hide
 * a successfully-created order and must remain unknown. */
export function isExplicitPokCreationRejection(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 422;
}

/** Only a bound, fully evidenced EUR capture for the durable intent is postable.
 * Provider amounts are major currency units, as in the sdk-orders create request. */
export function pokPaymentEvidence(
  order: any, providerOrderId: string, bookingRef: string, expectedAmount: string | number,
): { kind: "paid" | "unpaid" | "uncertain"; reason: string } {
  if (order?.id !== providerOrderId || order?.merchantCustomReference !== bookingRef)
    return { kind: "uncertain", reason: "binding_mismatch" };
  if (order?.currencyCode !== "EUR") return { kind: "uncertain", reason: "currency_mismatch" };
  const intentAmount = Number(expectedAmount);
  const amount = Number(order?.finalAmount ?? order?.amount);
  if (!Number.isFinite(intentAmount) || intentAmount <= 0 || !Number.isFinite(amount) ||
    amount <= 0 || Math.abs(amount - intentAmount) > 0.009)
    return { kind: "uncertain", reason: "amount_mismatch" };
  if (order?.amount != null && order?.finalAmount != null &&
    Math.abs(Number(order.amount) - intentAmount) > 0.009)
    return { kind: "uncertain", reason: "amount_mismatch" };
  if (order?.capturedAmount != null) {
    const captured = Number(order.capturedAmount);
    if (!Number.isFinite(captured) || captured < 0 || captured > intentAmount + 0.009)
      return { kind: "uncertain", reason: "capture_mismatch" };
    if ((order.isCompleted === true || order.isCaptured === true) &&
      Math.abs(captured - intentAmount) > 0.009)
      return { kind: "uncertain", reason: "capture_mismatch" };
    if (captured > 0 && order.isCompleted !== true && order.isCaptured !== true)
      return { kind: "uncertain", reason: "capture_without_confirmation" };
  }
  if (order?.isCompleted === true || order?.isCaptured === true) {
    if (order?.isCompleted === false || order?.isCaptured === false)
      return { kind: "uncertain", reason: "conflicting_confirmation" };
    return { kind: "paid", reason: "confirmed" };
  }
  if (order?.isCompleted === false && order?.isCaptured === false && Number(order?.capturedAmount ?? 0) === 0)
    return { kind: "unpaid", reason: "unpaid" };
  return { kind: "uncertain", reason: "incomplete_evidence" };
}
