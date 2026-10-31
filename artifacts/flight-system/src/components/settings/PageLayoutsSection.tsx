import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPageLayoutSettings, getGetPageLayoutSettingsQueryKey, getGetPublicPageLayoutsQueryKey,
  useSetPageLayout, useResetPageLayout, type PageLayoutEntry, type PageLayoutSettings,
} from "@workspace/api-client-react";
import { LayoutTemplate, Check, RotateCcw, Loader2, AlertTriangle, RotateCw, Lock } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsCard as Card } from "@/components/settings/SettingsCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { themeVariant, type InternalVariantPage } from "@/lib/pageLayoutResolve";

const VARIANT_NAMES: Record<string, string> = { classic: "Klasik", premium: "Premium", neoGlass: "Neo Glass" };

/** Abstract schematic of a layout family. Explicitly not a screenshot. */
function Schematic({ id }: { id: string }) {
  const bar = "rounded-[2px] bg-current";
  if (id === "premium") return (
    <div className="flex h-full gap-1.5 text-slate-400">
      <div className="flex flex-1 flex-col gap-1">
        <div className={cn(bar, "h-2 w-1/2 opacity-70")} />
        <div className="grid flex-1 grid-cols-3 gap-1">{[0, 1, 2].map(i => <div key={i} className="rounded border border-current/40 opacity-60" />)}</div>
        {[0, 1].map(i => <div key={i} className={cn(bar, "h-1.5 opacity-30")} />)}
      </div>
      <div className="w-1/3 rounded border border-indigo-300 bg-indigo-50" />
    </div>
  );
  if (id === "neoGlass") return (
    <div className="flex h-full flex-col gap-1 rounded bg-slate-900 p-1.5 text-cyan-300">
      <div className={cn(bar, "h-2 w-2/5 opacity-80")} />
      <div className="flex flex-1 gap-1">{[0, 1].map(i => <div key={i} className="flex-1 rounded border border-cyan-300/40 bg-white/5" />)}</div>
      <div className={cn(bar, "h-2 w-1/4 self-end bg-cyan-400")} />
    </div>
  );
  if (id === "classic") return (
    <div className="flex h-full flex-col gap-1 text-slate-400">
      <div className={cn(bar, "h-2 w-2/5 opacity-70")} />
      <div className={cn(bar, "h-2 opacity-50")} />
      {[0, 1, 2, 3].map(i => <div key={i} className={cn(bar, "h-1.5 opacity-25")} />)}
    </div>
  );
  if (id === "theme") return (
    <div className="flex h-full items-center justify-center gap-1 text-slate-400">
      <div className="h-full flex-1 rounded border border-dashed border-current/60" />
      <Palette3 />
      <div className="h-full flex-1 rounded border border-dashed border-current/60" />
    </div>
  );
  if (id === "canvas") return (
    <div className="flex h-full flex-col gap-1 rounded border border-rose-200 bg-stone-50 p-1.5">
      <div className="h-1.5 w-full rounded bg-white" />
      <div className="flex flex-1 gap-1"><div className="flex-1 rounded border border-stone-200 bg-white" /><div className="w-1/4 rounded bg-rose-500/80" /></div>
    </div>
  );
  return (
    <div className="flex h-full flex-col gap-1 text-slate-400">
      <div className={cn(bar, "h-2 w-1/3 opacity-70")} />
      <div className="flex-1 rounded border border-current/40 opacity-60" />
    </div>
  );
}

function Palette3() {
  return <div className="flex flex-col gap-0.5">{["bg-slate-500", "bg-indigo-400", "bg-cyan-400"].map(c => <span key={c} className={cn("h-1.5 w-1.5 rounded-full", c)} />)}</div>;
}

function PageCard({ entry, busy, onActivate, onReset }: {
  entry: PageLayoutEntry; busy: string | null;
  onActivate: (variant: string) => void; onReset: () => void;
}) {
  const { theme } = useTheme();
  const key = `${entry.scope}-${entry.page}`;
  const active = entry.variants.find(v => v.id === entry.variant);
  const single = entry.variants.filter(v => v.status === "ready").length <= 1;
  const themeNow = entry.scope === "internal" && entry.variants.some(v => v.id === "theme")
    ? VARIANT_NAMES[themeVariant(entry.page as InternalVariantPage, theme)] : null;

  return (
    <div data-testid={`card-page-layout-${key}`} className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{entry.label}</div>
          <code className="text-xs text-muted-foreground">{entry.route}</code>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid={`status-page-layout-${key}`} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            Aktive: {active?.label ?? entry.variant}
          </span>
          {!entry.isDefault && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!!busy} onClick={onReset} data-testid={`button-page-layout-reset-${key}`}>
              {busy === `${key}:reset` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
              Rikthe parazgjedhjen
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {entry.variants.map(v => {
          const isActive = v.id === entry.variant;
          const preparing = v.status === "preparing";
          return (
            <div key={v.id} data-testid={`option-page-layout-${key}-${v.id}`}
              className={cn("flex flex-col rounded-lg border p-2.5 transition-colors",
                isActive ? "border-emerald-400 bg-emerald-50/40" : "border-border",
                preparing && "opacity-60")}>
              <div className="relative h-16 rounded-md bg-muted/40 p-1.5">
                <Schematic id={v.id} />
                <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">skemë, jo pamje reale</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                {v.label}
                {preparing && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold uppercase text-amber-800">Në përgatitje</span>}
              </div>
              <p className="mt-0.5 flex-1 text-xs text-muted-foreground">
                {v.description}
                {v.id === "theme" && themeNow && <> Në këtë shfletues tani: <b>{themeNow}</b>.</>}
              </p>
              <div className="mt-2">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />Në përdorim</span>
                ) : preparing ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Kërkon miratim</span>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy} onClick={() => onActivate(v.id)} data-testid={`button-page-layout-activate-${key}-${v.id}`}>
                    {busy === `${key}:${v.id}` && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Aktivizo
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {single && <p className="mt-2 text-xs text-muted-foreground">Kjo faqe ka vetëm një implementim; nuk ka pamje alternative për të zgjedhur.</p>}
    </div>
  );
}

export function PageLayoutsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const settingsKey = getGetPageLayoutSettingsQueryKey();
  const q = useGetPageLayoutSettings({ query: { queryKey: settingsKey, staleTime: 30_000 } });
  const setLayout = useSetPageLayout();
  const resetLayout = useResetPageLayout();

  const applyEntry = (entry: PageLayoutEntry) => {
    qc.setQueryData<PageLayoutSettings>(settingsKey, old => old
      ? { pages: old.pages.map(p => p.scope === entry.scope && p.page === entry.page ? entry : p) } : old);
    void qc.invalidateQueries({ queryKey: getGetPublicPageLayoutsQueryKey() });
  };
  const fail = (e: unknown) => toast({
    title: "Ndryshimi nuk u ruajt", variant: "destructive",
    description: (e as { data?: { error?: string } })?.data?.error ?? "Zgjedhja e mëparshme mbetet aktive.",
  });

  const activate = (entry: PageLayoutEntry, variant: string) => {
    setBusy(`${entry.scope}-${entry.page}:${variant}`);
    setLayout.mutate({ scope: entry.scope, page: entry.page, data: { variant } }, {
      onSuccess: e => { applyEntry(e); toast({ title: "Pamja u aktivizua", description: `${e.label}: ${e.variants.find(v => v.id === e.variant)?.label ?? e.variant}` }); },
      onError: fail,
      onSettled: () => setBusy(null),
    });
  };
  const reset = (entry: PageLayoutEntry) => {
    setBusy(`${entry.scope}-${entry.page}:reset`);
    resetLayout.mutate({ scope: entry.scope, page: entry.page }, {
      onSuccess: e => { applyEntry(e); toast({ title: "U rikthye parazgjedhja", description: e.label }); },
      onError: fail,
      onSettled: () => setBusy(null),
    });
  };

  const groups = [
    { scope: "internal", title: "Faqet e brendshme", hint: "Flight Management System — vlen për të gjithë stafin që ka akses te faqja." },
    { scope: "external", title: "Faqet e jashtme", hint: "Booking Engine — portali i klientëve dhe agjentëve." },
  ] as const;

  return (
    <Card data-testid="card-page-layouts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><LayoutTemplate className="h-4 w-4" />Pamjet e faqeve</CardTitle>
        <p className="text-sm text-muted-foreground">
          Zgjidhni pamjen për secilën faqe veç e veç. Tema e ndërfaqes dhe faqet e tjera nuk ndryshojnë. Ilustrimet janë skema, jo pamje reale të ekranit.
          {" "}Formularët e hapur të rezervimeve e marrin pamjen e re kur rihapen, që të mos humbasin të dhënat në plotësim.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {q.isLoading && <div data-testid="status-page-layouts-loading" className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />)}</div>}
        {q.isError && !q.data && (
          <div role="alert" data-testid="status-page-layouts-error" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Konfigurimi i pamjeve nuk u ngarkua. Asnjë ndryshim nuk mund të bëhet.</span>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}><RotateCw className="mr-1 h-3 w-3" />Provo përsëri</Button>
          </div>
        )}
        {q.data && groups.map(g => (
          <section key={g.scope} data-testid={`group-page-layouts-${g.scope}`} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
            {q.data.pages.filter(p => p.scope === g.scope).map(entry => (
              <PageCard key={`${entry.scope}-${entry.page}`} entry={entry} busy={busy}
                onActivate={v => activate(entry, v)} onReset={() => reset(entry)} />
            ))}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
