const KEY = "fms_browser_id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Identifies a browser profile, not physical hardware. Never used for access control.
export function getFmsDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && UUID_V4.test(existing)) return existing;
    if (!crypto.randomUUID) return null;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private browsing or disabled storage: normal login still works.
    return null;
  }
}