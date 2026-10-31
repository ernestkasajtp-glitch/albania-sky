// Pure resolution of per-page layout selections into concrete render variants.
// Kept free of React so it can be unit-tested with node --experimental-strip-types.

export type InternalVariantPage = "bookings_list" | "booking_detail" | "booking_new";
export type RenderVariant = "classic" | "premium" | "neoGlass";

export interface ThemeLayoutHints { premiumLayout?: boolean; bookingNewLayout?: "neoGlass" }
export interface LayoutSelection { scope: string; page: string; variant: string }

/** Variants the client can actually render, per page. Mirrors the server allowlist. */
export const RENDERABLE: Record<InternalVariantPage, readonly string[]> = {
  bookings_list: ["theme", "classic", "premium"],
  booking_detail: ["theme", "classic", "premium"],
  booking_new: ["theme", "classic", "premium", "neoGlass"],
};

/** Exactly the pre-existing ThemeContext behaviour. */
export function themeVariant(page: InternalVariantPage, theme: ThemeLayoutHints): RenderVariant {
  if (page === "booking_new" && theme.bookingNewLayout === "neoGlass") return "neoGlass";
  return theme.premiumLayout ? "premium" : "classic";
}

/**
 * Returns the variant to render, or null when the selection is unknown to this
 * client (config error — never silently swapped for something else).
 * Missing page entry = no stored choice = inherit theme (baseline behaviour).
 */
export function resolveInternalVariant(
  page: InternalVariantPage,
  layouts: readonly LayoutSelection[],
  theme: ThemeLayoutHints,
): RenderVariant | null {
  const selected = layouts.find(l => l.scope === "internal" && l.page === page)?.variant ?? "theme";
  if (!RENDERABLE[page].includes(selected)) return null;
  return selected === "theme" ? themeVariant(page, theme) : (selected as RenderVariant);
}
