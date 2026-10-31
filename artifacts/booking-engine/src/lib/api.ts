import i18n from "../i18n";
import { errorLanguage, safeApiErrorMessage, type ErrorContext } from "./apiErrors";
import type { PokVerifyResult } from "./pokReturnResult";

const API_BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "") + "/../api";

function requestError(status: number | undefined, raw: unknown, context: ErrorContext): Error & { status?: number } {
  const error: Error & { status?: number } = new Error(
    safeApiErrorMessage(status, raw, errorLanguage(i18n.language), context),
  );
  error.name = "SafeApiError";
  if (status !== undefined) error.status = status;
  return error;
}

async function apiFetch(path: string, options?: RequestInit, context: ErrorContext = "general") {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
  } catch {
    throw requestError(undefined, undefined, context);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    // Expose the HTTP status so callers can distinguish a lost/expired session
    // (401) from other failures and recover gracefully instead of dead-ending.
    throw requestError(res.status, err?.error, context);
  }
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    throw requestError(res.status, undefined, context);
  }
}

export const api = {
  base: API_BASE,
  // Auth
  register: (data: any) => apiFetch("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: any) => apiFetch("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),
  me: () => apiFetch("/auth/me"),

  // Social-proof badge toggle (admin-controlled in flight-system Settings).
  getSocialProof: (): Promise<{ enabled: boolean }> => apiFetch("/public/social-proof"),

  // Public airports with active flights
  getAirports: () => apiFetch("/public/airports"),

  // All available routes: [{from: "TIA", to: "MXP"}, ...]
  getRoutes: (): Promise<{ from: string; to: string }[]> => apiFetch("/public/routes"),

  // Flight dates with min price per date (for calendar highlighting)
  // Returns: { dates: [{ date: "2026-08-15", minPrice: 89 }, ...] }
  getFlightDates: (from?: string, to?: string): Promise<{ dates: { date: string; minPrice: number }[] }> => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return apiFetch(`/public/flight-dates${qs ? "?" + qs : ""}`);
  },

  // Public flights
  searchFlights: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/public/flights${q ? "?" + q : ""}`);
  },
  getFlight: (id: number) => apiFetch(`/public/flights/${id}`),

  // Booking engine bookings
  createBooking: (data: any) => apiFetch("/public/bookings", { method: "POST", body: JSON.stringify(data) }, "booking"),
  myBookings: () => apiFetch("/public/my-bookings"),
  getBookingDetail: (ref: string) => apiFetch(`/public/my-bookings/${ref}`),
  getBookingInvoices: (ref: string): Promise<Array<{ paymentId: number; invoiceCode: string; createdAt: string; kind: "payment" | "batch" }>> =>
    apiFetch(`/public/my-bookings/${encodeURIComponent(ref)}/invoices`),
  downloadBookingInvoice: async (ref: string, paymentId: number): Promise<{ blob: Blob; filename: string }> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/public/my-bookings/${encodeURIComponent(ref)}/invoices/${paymentId}/pdf`, { credentials: "include" });
    } catch {
      throw requestError(undefined, undefined, "general");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw requestError(res.status, err?.error, "general");
    }
    if (!res.headers.get("content-type")?.includes("application/pdf")) {
      throw requestError(res.status, undefined, "general");
    }
    const filename = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `invoice-${paymentId}.pdf`;
    return { blob: await res.blob(), filename: filename.replace(/[^a-zA-Z0-9._-]/g, "_") };
  },
  downloadBookingPdf: async (ref: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/public/my-bookings/${ref}/pdf`, { credentials: "include" });
    } catch {
      throw requestError(undefined, undefined, "general");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw requestError(res.status, err?.error, "general");
    }
    return res.blob();
  },
  myTransactions: () => apiFetch("/public/my-transactions"),
  // Fire-and-forget page-view tracking (admin agent-activity log). Never throws.
  trackVisit: (path: string, title?: string) =>
    apiFetch("/public/track-visit", { method: "POST", body: JSON.stringify({ path, title }) }).catch(() => {}),
  initPokPayment: (ref: string) => apiFetch(`/public/bookings/${ref}/pok-initiate`, { method: "POST" }, "payment"),
  verifyPokPayment: (ref: string, orderId: string): Promise<PokVerifyResult> =>
    apiFetch(`/public/bookings/${ref}/pok-verify`, { method: "POST", body: JSON.stringify({ orderId }) }, "payment"),
};
