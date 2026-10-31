import { db, settingsTable } from "@workspace/db";
import { like, eq } from "drizzle-orm";

export type PageLayoutScope = "internal" | "external";
export type VariantStatus = "ready" | "preparing";

export interface LayoutVariantDef { id: string; label: string; description: string; status: VariantStatus }
export interface PageDef {
  scope: PageLayoutScope;
  page: string;
  label: string;
  route: string;
  defaultVariant: string;
  variants: LayoutVariantDef[];
}

const THEME: LayoutVariantDef = {
  id: "theme", label: "Sipas temës aktuale", status: "ready",
  description: "Ndjek temën e zgjedhur të sistemit (sjellja e deritanishme).",
};
const CURRENT: LayoutVariantDef = {
  id: "current", label: "Pamja aktuale", status: "ready",
  description: "Pamja ekzistuese e kësaj faqeje.",
};
const CLASSIC: LayoutVariantDef = { id: "classic", label: "Klasik", status: "ready", description: "Tabela dhe kartat klasike." };
const PREMIUM: LayoutVariantDef = { id: "premium", label: "Premium", status: "ready", description: "Layout-i premium me panele të gjera." };
const CANVAS_READY: LayoutVariantDef = {
  id: "canvas", label: "Dizajni i ri (Canvas)", status: "ready",
  description: "Pamja e miratuar e portalit, me të njëjtat funksione dhe çmime reale.",
};

/** Server allowlist. Only `ready` variants can ever be persisted. */
export const PAGE_LAYOUT_REGISTRY: readonly PageDef[] = [
  { scope: "internal", page: "dashboard", label: "Paneli kryesor", route: "/", defaultVariant: "current", variants: [CURRENT] },
  { scope: "internal", page: "flights_list", label: "Lista e fluturimeve", route: "/flights", defaultVariant: "current", variants: [CURRENT] },
  { scope: "internal", page: "flight_detail", label: "Detajet e fluturimit", route: "/flights/:id", defaultVariant: "current", variants: [CURRENT] },
  { scope: "internal", page: "bookings_list", label: "Lista e rezervimeve", route: "/bookings", defaultVariant: "theme", variants: [THEME, CLASSIC, PREMIUM] },
  { scope: "internal", page: "booking_detail", label: "Detajet e rezervimit", route: "/bookings/:id", defaultVariant: "theme", variants: [THEME, CLASSIC, PREMIUM] },
  {
    scope: "internal", page: "booking_new", label: "Krijo rezervim", route: "/bookings/new", defaultVariant: "theme",
    variants: [THEME, CLASSIC, PREMIUM, { id: "neoGlass", label: "Neo Glass", status: "ready", description: "Formular i errët me xham, i dedikuar për krijimin." }],
  },
  { scope: "external", page: "home", label: "Faqja kryesore", route: "/", defaultVariant: "canvas", variants: [CURRENT, CANVAS_READY] },
  { scope: "external", page: "flights", label: "Kërkimi i fluturimeve", route: "/flights", defaultVariant: "canvas", variants: [CURRENT, CANVAS_READY] },
  { scope: "external", page: "book_flight", label: "Rezervo fluturimin", route: "/flights/:id", defaultVariant: "canvas", variants: [CURRENT, CANVAS_READY] },
  { scope: "external", page: "my_bookings", label: "Rezervimet e mia", route: "/my-bookings", defaultVariant: "current", variants: [CURRENT] },
  { scope: "external", page: "booking_detail", label: "Detajet e rezervimit", route: "/my-bookings/:ref", defaultVariant: "current", variants: [CURRENT] },
];

const KEY_PREFIX = "page_layout:";
export const layoutKey = (scope: string, page: string) => `${KEY_PREFIX}${scope}:${page}`;

export function findPage(scope: string, page: string): PageDef | undefined {
  return PAGE_LAYOUT_REGISTRY.find(p => p.scope === scope && p.page === page);
}

export function isReadyVariant(def: PageDef, variant: string): boolean {
  return def.variants.some(v => v.id === variant && v.status === "ready");
}

interface StoredRow { key: string; value: string | null; updatedAt: Date }

export function resolveEntries(rows: StoredRow[]) {
  const byKey = new Map(rows.map(r => [r.key, r]));
  return PAGE_LAYOUT_REGISTRY.map(def => {
    const row = byKey.get(layoutKey(def.scope, def.page));
    // A stored value that is no longer allowlisted falls back to the default.
    const stored = row?.value && isReadyVariant(def, row.value) ? row.value : null;
    const variant = stored ?? def.defaultVariant;
    return {
      scope: def.scope, page: def.page, label: def.label, route: def.route,
      variant, defaultVariant: def.defaultVariant, isDefault: stored === null,
      updatedAt: stored && row ? row.updatedAt.toISOString() : null,
      variants: def.variants,
    };
  });
}

export async function readLayoutRows(): Promise<StoredRow[]> {
  return db.select().from(settingsTable).where(like(settingsTable.key, `${KEY_PREFIX}%`));
}

/** Single-statement upsert of one page key: concurrent edits of other pages never collide. */
export async function writeLayout(def: PageDef, variant: string): Promise<void> {
  const now = new Date();
  await db.insert(settingsTable)
    .values({ key: layoutKey(def.scope, def.page), value: variant, updatedAt: now })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: variant, updatedAt: now } });
}

export async function clearLayout(def: PageDef): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, layoutKey(def.scope, def.page)));
}
