import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageLayoutState } from "@/hooks/usePageLayout";
import type { RenderVariant } from "@/lib/pageLayoutResolve";

export function PageLayoutGate({ state, render }: { state: PageLayoutState; render: (v: RenderVariant) => ReactNode }) {
  if (state.status === "ready") return <>{render(state.variant)}</>;
  if (state.status === "error") {
    return (
      <div role="alert" data-testid="status-page-layout-error" className="mx-auto mt-16 max-w-md rounded-xl border border-amber-300/70 bg-amber-50/70 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-600" />
        <h2 className="font-semibold">Pamja e faqes nuk u përcaktua</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.message} Zgjedhja e ruajtur nuk ndryshon.</p>
        <Button size="sm" variant="outline" className="mt-4" onClick={state.retry} data-testid="button-page-layout-retry">
          <RotateCw className="mr-2 h-3.5 w-3.5" />Provo përsëri
        </Button>
      </div>
    );
  }
  return (
    <div data-testid="status-page-layout-loading" className="space-y-3 p-6" aria-busy="true">
      <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full animate-pulse rounded-md bg-muted/80" />
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted/60" />)}
    </div>
  );
}
