// Display-only time formatting.
//
// Times are STORED and TRANSMITTED as 24h strings ("HH:mm" / "HH:mm:ss") —
// nothing here changes that. This helper exists purely so documents that a
// human reads (e-ticket/invoice PDFs, e-mail bodies, generated reports) show
// the familiar 12-hour clock with a literal English AM/PM suffix.
//
//   "13:45" → "1:45 PM"      "09:05" → "9:05 AM"
//   "00:30" → "12:30 AM"     "12:00" → "12:00 PM"
//
// Empty input returns ""; anything that is not a valid HH:mm[:ss] value is
// returned unchanged so we never hide data from the reader.
export function fmtAmPm(t: string | null | undefined): string {
  // NOTE (2026-07-31): flight schedule times must stay 24h (user request) —
  // this helper now returns the value unchanged. Do not re-enable AM/PM
  // conversion for HH:mm strings without asking the user.
  if (t == null) return "";
  return String(t).trim();
}
