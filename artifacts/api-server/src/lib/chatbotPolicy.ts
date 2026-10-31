import { createHash, timingSafeEqual } from "node:crypto";

export const CHATBOT_AGENT_ID = 21; // Explicit administrator-approved agency, never caller-supplied.
export const CHATBOT_SETTING = "nesti_chatbot_readonly_v1";
export const hashChatbotKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function matchesChatbotKey(key: string, hash: string): boolean {
  if (!/^nsk_[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashChatbotKey(key), "hex"), Buffer.from(hash, "hex"));
}
export type ChatbotSearch = {
  from: string; to: string; departure_date: string; return_date?: string;
  adults: number; children: number; infants: number; currency: "EUR";
};
export function parseChatbotSearch(body: unknown, today: string): ChatbotSearch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected JSON object");
  const b = body as Record<string, unknown>;
  const allowed = ["from", "to", "departure_date", "return_date", "adults", "children", "infants", "currency"];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new Error("Unknown parameter");
  const airport = (v: unknown) => {
    if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) throw new Error("Use uppercase 3-letter IATA airport codes");
    return v;
  };
  const date = (v: unknown) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v || v < today)
      throw new Error("Use a valid, non-past date YYYY-MM-DD");
    return v;
  };
  const count = (key: string, fallback: number, min: number) => {
    const v = b[key] ?? fallback;
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > 9)
      throw new Error(`${key} must be an integer from ${min} to 9`);
    return v;
  };
  const result: ChatbotSearch = {
    from: airport(b.from), to: airport(b.to), departure_date: date(b.departure_date),
    adults: count("adults", 1, 1), children: count("children", 0, 0), infants: count("infants", 0, 0), currency: "EUR",
  };
  if (result.from === result.to) throw new Error("Origin and destination must differ");
  if (b.currency !== undefined && b.currency !== "EUR") throw new Error("Only EUR is supported");
  if (result.adults + result.children > 9 || result.infants > result.adults)
    throw new Error("Maximum 9 seated passengers; infants cannot exceed adults");
  if (b.return_date !== undefined) {
    result.return_date = date(b.return_date);
    if (result.return_date < result.departure_date) throw new Error("Return date cannot precede departure");
  }
  return result;
}

/** Bounded single-credential fixed-window budget; no unbounded IP-keyed map. */
export function createChatbotBudget(limit: number, windowMs = 60_000) {
  let started = 0, used = 0;
  return (now = Date.now()) => {
    if (now - started >= windowMs) { started = now; used = 0; }
    if (used >= limit) return Math.max(1, Math.ceil((started + windowMs - now) / 1000));
    used++;
    return 0;
  };
}
