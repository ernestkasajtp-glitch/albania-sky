/** The redirect query string and booking balance are not evidence of this order's payment. */
export type PokVerifyResult = {
  ok: boolean;
  reason?: string;
  bookingRef?: string;
  paid?: number;
  due?: number;
};

export type PokReturnState = "success" | "pending" | "review";

export function pokReturnState(result: unknown, ref: string): PokReturnState {
  if (!result || typeof result !== "object" || !ref) return "review";
  const verification = result as Partial<PokVerifyResult>;
  if (verification.bookingRef !== ref) return "review";
  if (verification.ok === false && (verification.reason === "unpaid" || verification.reason === "not_completed")) return "pending";
  // A successful replay may say already_recorded when the webhook won the race.
  // A rejected verification must never display paid success, regardless of reason.
  if (verification.ok === true && (!verification.reason || verification.reason === "already_recorded")) return "success";
  return "review";
}