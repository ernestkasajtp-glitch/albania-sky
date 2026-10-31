import i18n from "../i18n";
import { errorLanguage, safeApiErrorMessage } from "./apiErrors";

// Compatibility for the existing server-side collision regression test. The
// exported constant represents the source-language fallback; UI uses the
// active language in bookingCreateErrorMessage instead.
export const SAFE_BOOKING_CREATE_ERROR = safeApiErrorMessage(500, undefined, "sq", "booking");

export function bookingCreateErrorMessage(error: unknown): string {
  const err = error as { status?: number; name?: string; message?: string } | null;
  const status = typeof err?.status === "number" ? err.status : undefined;
  const language = errorLanguage(i18n.language);
  // Only reuse messages sanitized at the API boundary. Never display raw
  // exceptions (including technical server errors) to a booking customer.
  if (status !== undefined && status < 500 && err?.name === "SafeApiError" && err.message) {
    return err.message;
  }
  return safeApiErrorMessage(status, undefined, language, "booking");
}