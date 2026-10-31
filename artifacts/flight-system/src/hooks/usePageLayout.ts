import { useGetPublicPageLayouts, getGetPublicPageLayoutsQueryKey } from "@workspace/api-client-react";
import { useTheme } from "@/context/ThemeContext";
import { useRef } from "react";
import { resolveInternalVariant, type InternalVariantPage, type RenderVariant } from "@/lib/pageLayoutResolve";

export type PageLayoutState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; variant: RenderVariant };

/**
 * Resolves the render variant for one internal page. Global theme and document
 * attributes are never touched: the selection only picks which existing
 * component renders. Freshness: SSE "page_layouts" invalidation + finite staleTime.
 */
export function useInternalPageLayout(page: InternalVariantPage): PageLayoutState {
  // A live admin change must not unmount an open booking form and discard input.
  // New selections apply the next time that form is opened.
  const openFormVariant = useRef<{ page: InternalVariantPage; variant: RenderVariant } | null>(null);
  const { theme } = useTheme();
  const q = useGetPublicPageLayouts({
    query: {
      queryKey: getGetPublicPageLayoutsQueryKey(),
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  });
  // Keep the last good config on background refetch errors.
  if (q.data) {
    const variant = resolveInternalVariant(page, q.data.layouts, theme);
    if (variant) {
      if (page === "booking_new" || page === "booking_detail") {
        if (openFormVariant.current?.page !== page) openFormVariant.current = { page, variant };
        return { status: "ready", variant: openFormVariant.current.variant };
      }
      return { status: "ready", variant };
    }
    return { status: "error", message: "Pamja e zgjedhur për këtë faqe nuk njihet nga ky version.", retry: () => void q.refetch() };
  }
  if (q.isError) {
    return { status: "error", message: "Konfigurimi i pamjeve nuk u ngarkua.", retry: () => void q.refetch() };
  }
  return { status: "loading" };
}
