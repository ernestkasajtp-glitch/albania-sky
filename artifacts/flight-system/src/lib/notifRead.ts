// Gjendja "e lexuar" e njoftimeve — ruhet në localStorage (për shfletues).
// Çdo seksion ka çelësin e vet; ruajmë një listë ID-sh të lexuara (me kufi max).
// Kur shënohet diçka e lexuar, lëshohet një event global që layout-i (badge-i
// te "Njoftimet") të rifreskohet menjëherë.

export const NOTIF_READ_EVENT = "fms-notif-read";

const MAX_IDS = 800;

export const READ_KEYS = {
  closing: "fms.read.closing",
  alerts: "fms.read.alerts",
  sched: "fms.read.sched",
  soldout: "fms.read.soldout",
} as const;

export function getReadSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function addRead(storageKey: string, ids: string[]) {
  if (ids.length === 0) return;
  try {
    const set = getReadSet(storageKey);
    for (const id of ids) set.add(id);
    // Kufizojmë madhësinë — heqim më të vjetrat (fillimi i listës).
    const arr = Array.from(set);
    const trimmed = arr.length > MAX_IDS ? arr.slice(arr.length - MAX_IDS) : arr;
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    /* localStorage e paarritshme — s'bëjmë asgjë */
  }
  window.dispatchEvent(new Event(NOTIF_READ_EVENT));
}

// Çelësat unikë për rresht — nëse alarmi ndryshon, njoftimi rikthehet si i palexuar.
export const closingItemKey = (f: { id: number; departureDate: string }) =>
  `${f.id}:${f.departureDate}`;

export const alertItemKey = (f: {
  id: number;
  scheduleAlert?: string | null;
  seatAlert?: string | null;
}) => `${f.id}:${f.scheduleAlert || ""}:${f.seatAlert || ""}`;

export const schedItemKey = (c: { id: number }) => String(c.id);

export const soldOutItemKey = (s: { historyId: number }) => String(s.historyId);

// Kompatibilitet me mekanizmin e vjetër të Sold Out (maxId në localStorage):
// çdo historyId ≤ atij vlerësohet i lexuar edhe pa qenë në set-in e ri.
export const getSoldOutLegacyMaxId = (): number => {
  try { return Number(localStorage.getItem("fms.soldout.readMaxId") || 0) || 0; } catch { return 0; }
};
