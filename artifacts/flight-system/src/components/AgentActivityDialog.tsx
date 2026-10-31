import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, ArrowDown, CalendarDays, Check, ChevronDown, Download, FileSpreadsheet, FileText, Globe, LogIn, Monitor, MousePointer2, RefreshCw, Search, Server, ShieldCheck, UserRound } from "lucide-react";
import { fmtDateTimeAmPm } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface ActivityRow {
  id: number;
  type: string;
  method: string | null;
  path: string | null;
  description: string | null;
  ip: string | null;
  userAgent: string | null;
  statusCode: number | null;
  createdAt: string;
}

type Filter = "all" | "login" | "pageview" | "action" | "click" | "search" | "api";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Të gjitha" },
  { key: "login", label: "Hyrjet" },
  { key: "pageview", label: "Faqet" },
  { key: "click", label: "Klikimet" },
  { key: "search", label: "Kërkimet" },
  { key: "api", label: "Kërkesa API" },
  { key: "action", label: "API historike" },
];
const PAGE = 100;
const HUMAN_TYPES = new Set(["login", "pageview", "click", "search"]);
const isSystem = (type: string) => type === "api" || type === "action";

function fmtDate(value: string): string {
  if (Number.isNaN(new Date(value).getTime())) return "Datë e panjohur";
  return fmtDateTimeAmPm(value, {
    timeZone: "Europe/Tirane",
    dateOptions: { day: "2-digit", month: "2-digit", year: "numeric" },
  });
}

function TypeBadge({ type }: { type: string }) {
  const meta = {
    login: { label: "Hyrje", icon: LogIn },
    pageview: { label: "Faqe", icon: FileText },
    click: { label: "Klikim", icon: MousePointer2 },
    search: { label: "Kërkim", icon: Search },
    api: { label: "Kërkesë API", icon: Server },
    action: { label: "API historike", icon: Server },
  }[type] ?? { label: type || "Veprim tjetër", icon: Activity };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`max-w-full gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${isSystem(type) ? "border-border bg-muted/60 text-muted-foreground" : "border-primary/15 bg-primary/5 text-primary"}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="break-words">{meta.label}</span>
    </Badge>
  );
}

function browserLabel(value: string | null) {
  if (!value) return { browser: "Shfletues i panjohur", device: "Pajisje e panjohur" };
  const browser = /Edg(?:e|A|iOS)?\//.test(value) ? "Microsoft Edge"
    : /OPR\/|Opera/.test(value) ? "Opera"
    : /Firefox\/|FxiOS\//.test(value) ? "Firefox"
    : /Chrome\/|CriOS\//.test(value) ? "Chrome"
    : /Safari\//.test(value) ? "Safari" : "Klient tjetër";
  const device = /iPad/.test(value) ? "iPad"
    : /iPhone/.test(value) ? "iPhone"
    : /Android/.test(value) ? "Android"
    : /Windows/.test(value) ? "Windows"
    : /Macintosh|Mac OS X/.test(value) ? "macOS"
    : /Linux/.test(value) ? "Linux" : "Pajisje e panjohur";
  return { browser, device };
}

function ActivityDetails({ row }: { row: ActivityRow }) {
  const title = row.type === "action" ? "Kërkesë API historike"
    : row.description || (row.type === "api" ? "Kërkesë në sistem" : row.path || "Aktivitet i regjistruar");
  return (
    <div className="min-w-0 space-y-2">
      <p className="break-words text-sm font-medium leading-relaxed text-foreground">{title}</p>
      {row.type === "action" && <p className="text-xs leading-relaxed text-muted-foreground">Regjistrim teknik; nuk përfaqëson një klikim.</p>}
      {row.type === "action" && row.description && <p className="break-words text-xs leading-relaxed text-muted-foreground">{row.description}</p>}
      {(row.path || row.method || row.statusCode != null) && (
        <div className="flex min-w-0 flex-wrap items-start gap-1.5 font-mono text-[11px] leading-5">
          {row.method && <span className="rounded border bg-background px-1.5 font-semibold">{row.method}</span>}
          {row.path && <code className="min-w-0 flex-1 break-all text-muted-foreground">{row.path}</code>}
          {row.statusCode != null && (
            <span aria-label={`Status HTTP ${row.statusCode}`} className={`inline-flex items-center gap-1 rounded border px-1.5 ${row.statusCode >= 400 ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border bg-muted/60 text-foreground"}`}>
              {row.statusCode >= 400 ? <AlertCircle aria-hidden="true" className="h-3 w-3" /> : row.statusCode >= 200 && row.statusCode < 300 ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
              {row.statusCode}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectionDetails({ row }: { row: ActivityRow }) {
  const { browser, device } = browserLabel(row.userAgent);
  return (
    <div className="min-w-0 space-y-2.5 text-xs">
      <div className="flex items-start gap-2">
        <Globe aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="break-all font-mono leading-5">{row.ip || "IP e panjohur"}</span>
      </div>
      <details className="group" data-testid={`details-browser-${row.id}`}>
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Monitor aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 leading-5">
            <span className="block font-medium">{browser}</span>
            <span className="block text-muted-foreground">{device}</span>
          </span>
          <ChevronDown aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 text-muted-foreground group-open:rotate-180" />
          <span className="sr-only">Shfaq identifikimin e plotë të pajisjes</span>
        </summary>
        <p className="mt-2 break-all rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{row.userAgent || "Identifikimi i pajisjes nuk është regjistruar."}</p>
      </details>
    </div>
  );
}

export function AgentActivityDialog({
  agentId, agentName, open, onOpenChange,
}: {
  agentId: number | null;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDay, setPdfDay] = useState("");
  const [pdfError, setPdfError] = useState("");
  const rowsRef = useRef<ActivityRow[]>([]);
  const requestRef = useRef(0);
  const listAbort = useRef<AbortController | null>(null);
  const pdfAbort = useRef<AbortController | null>(null);
  const dateId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const humanCount = rows.filter(row => HUMAN_TYPES.has(row.type)).length;
  const systemCount = rows.filter(row => isSystem(row.type)).length;

  const load = useCallback(async (reset: boolean) => {
    if (!open || agentId == null) return;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    const request = ++requestRef.current;
    const offset = reset ? 0 : rowsRef.current.length;
    setLoading(true);
    setLoadError("");
    if (reset) {
      rowsRef.current = [];
      setRows([]);
      setTotal(0);
      listRef.current?.scrollTo({ top: 0 });
    }
    try {
      const response = await fetch(
        `${API_BASE}/agents/${agentId}/activity?limit=${PAGE}&offset=${offset}&type=${filter}`,
        { credentials: "include", signal: controller.signal },
      );
      if (!response.ok) throw new Error("Aktiviteti nuk mund të ngarkohej. Provoni përsëri.");
      const data: { rows: ActivityRow[]; total: number } = await response.json();
      if (!Array.isArray(data.rows) || typeof data.total !== "number" || !Number.isFinite(data.total) || data.total < 0) {
        throw new Error("Përgjigjja e aktivitetit nuk është e vlefshme. Provoni përsëri.");
      }
      if (controller.signal.aborted || request !== requestRef.current) return;
      const combined = reset ? data.rows : [...rowsRef.current, ...data.rows];
      rowsRef.current = Array.from(new Map(combined.map(row => [row.id, row])).values());
      setRows(rowsRef.current);
      setTotal(data.total);
    } catch (error) {
      if (!controller.signal.aborted && request === requestRef.current) {
        setLoadError(error instanceof Error ? error.message : "Ngarkimi dështoi. Provoni përsëri.");
      }
    } finally {
      if (!controller.signal.aborted && request === requestRef.current) setLoading(false);
    }
  }, [agentId, filter, open]);

  useEffect(() => {
    if (open && agentId != null) void load(true);
    else {
      rowsRef.current = [];
      setRows([]);
      setTotal(0);
      setLoading(false);
      setLoadError("");
    }
    return () => {
      listAbort.current?.abort();
      requestRef.current += 1;
    };
  }, [open, agentId, load]);

  useEffect(() => {
    setPdfError("");
    setPdfLoading(false);
    return () => { pdfAbort.current?.abort(); };
  }, [open, agentId, filter]);

  async function downloadPdf() {
    if (agentId == null || pdfLoading || !open) return;
    const controller = new AbortController();
    pdfAbort.current?.abort();
    pdfAbort.current = controller;
    setPdfLoading(true);
    setPdfError("");
    try {
      const query = new URLSearchParams({ type: filter });
      if (pdfDay) query.set("day", pdfDay);
      const response = await fetch(`${API_BASE}/agents/${agentId}/activity/pdf?${query}`, {
        credentials: "include", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Shkarkimi i PDF-së dështoi. Provoni një ditë të vetme ose provoni përsëri.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aktiviteti-${agentId}${pdfDay ? `-${pdfDay}` : ""}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) setPdfError(error instanceof Error ? error.message : "Shkarkimi dështoi.");
    } finally {
      if (!controller.signal.aborted) setPdfLoading(false);
    }
  }

  const handleExport = () => {
    if (agentId == null) return;
    const link = document.createElement("a");
    link.href = `${API_BASE}/agents/${agentId}/activity/export`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-[95vw]" data-testid="dialog-agent-activity">
        <DialogHeader className="shrink-0 border-b bg-primary/[0.035] px-4 pb-5 pt-6 text-left sm:px-6">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-primary" /> Paneli i administratorit
          </div>
          <div className="flex items-start gap-3 pr-5">
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary sm:flex"><Activity aria-hidden="true" className="h-5 w-5" /></div>
            <div className="min-w-0">
              <DialogTitle className="text-xl leading-tight sm:text-2xl">Jurnali i aktivitetit</DialogTitle>
              <DialogDescription className="mt-1.5 break-words leading-relaxed">
                <span className="font-semibold text-foreground" data-testid="text-activity-agent">{agentName}</span>
                <span className="mx-2 text-border" aria-hidden="true">/</span>
                Gjurmimi i veprimeve dhe kërkesave teknike
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <section aria-label="Filtrat e aktivitetit" className="shrink-0 border-b px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lloji i aktivitetit</h3>
              <Button data-testid="button-refresh-activity" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => void load(true)} disabled={loading || agentId == null}>
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Rifresko
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro sipas llojit">
              {FILTERS.map(item => (
                <Button key={item.key} data-testid={`button-activity-filter-${item.key}`} size="sm" variant={filter === item.key ? "default" : "outline"} aria-pressed={filter === item.key} className={`h-8 rounded-lg px-3 text-xs shadow-none ${filter !== item.key ? "border-transparent bg-muted/60 hover:border-border" : ""}`} onClick={() => setFilter(item.key)}>
                  {item.label}
                </Button>
              ))}
            </div>
          </section>

          <section aria-label="Shkarkimi i raporteve" className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor={dateId} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" /> Dita për PDF <span className="font-normal text-muted-foreground">(opsionale)</span></label>
                  <input id={dateId} data-testid="input-activity-pdf-day" type="date" value={pdfDay} disabled={pdfLoading} onChange={event => { setPdfDay(event.target.value); setPdfError(""); }} className="h-9 min-w-0 max-w-full rounded-md border bg-background px-2.5 text-sm text-foreground [color-scheme:light] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:[color-scheme:dark]" />
                </div>
                <Button data-testid="button-download-activity-pdf" size="sm" variant="outline" className="h-9 gap-2 bg-background" disabled={pdfLoading || agentId == null} aria-busy={pdfLoading} onClick={() => void downloadPdf()}>
                  <Download aria-hidden="true" className="h-4 w-4" />{pdfLoading ? "Po përgatitet…" : "Shkarko PDF"}
                </Button>
              </div>
              <Button data-testid="button-download-activity-excel" size="sm" variant="outline" className="h-9 gap-2 self-start bg-background lg:self-auto" onClick={handleExport} disabled={agentId == null}>
                <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-primary" /> Raporti Excel
              </Button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">PDF: lloji i zgjedhur{pdfDay ? " dhe dita e zgjedhur" : ", të gjitha datat"}. Excel: deri në 20 000 regjistrimet më të fundit, pavarësisht filtrave.</p>
            {pdfError && <p role="alert" data-testid="error-activity-pdf" className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{pdfError}</p>}
          </section>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3 text-xs sm:px-6">
            <p data-testid="text-activity-count" aria-live="polite" className="text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{rows.length.toLocaleString()}</span> të ngarkuara <span className="mx-1">/</span> {loading && rows.length === 0 ? "…" : total.toLocaleString()} sipas filtrit</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground" data-testid="text-loaded-activity-breakdown">
              <span className="text-[11px]">Në rreshtat e ngarkuar:</span>
              <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden="true" className="h-3.5 w-3.5 text-primary" /> Përdoruesi <strong className="font-semibold tabular-nums text-foreground">{humanCount}</strong></span>
              <span className="inline-flex items-center gap-1.5"><Server aria-hidden="true" className="h-3.5 w-3.5" /> Sistemi / API <strong className="font-semibold tabular-nums text-foreground">{systemCount}</strong></span>
              {rows.length > humanCount + systemCount && <span>Të tjera: {rows.length - humanCount - systemCount}</span>}
            </div>
          </div>

          <div ref={listRef} className="min-h-[180px] flex-1 overflow-y-auto border-y bg-background md:min-h-[220px]" aria-label="Regjistrimet e aktivitetit" aria-busy={loading} data-testid="list-agent-activity">
            {loading && rows.length === 0 ? (
              <div role="status" className="divide-y px-4 sm:px-6">
                <span className="sr-only">Po ngarkohet aktiviteti…</span>
                {[0, 1, 2, 3].map(index => <div key={index} className="flex gap-5 py-6 motion-safe:animate-pulse"><div className="h-8 w-24 rounded-md bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-3 w-1/3 rounded bg-muted" /></div><div className="hidden h-8 w-36 rounded-md bg-muted md:block" /></div>)}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center px-5 py-8 text-center" data-testid="status-activity-empty">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/50 text-muted-foreground">{loadError ? <AlertCircle aria-hidden="true" className="h-5 w-5" /> : <Activity aria-hidden="true" className="h-5 w-5" />}</div>
                <h3 className="text-sm font-semibold">{loadError ? "Aktiviteti nuk u ngarkua" : "Nuk ka regjistrime për këtë filtër"}</h3>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">{loadError || "Provoni një lloj tjetër aktiviteti ose rifreskoni për regjistrime të reja."}</p>
                {loadError ? <Button data-testid="button-retry-activity-empty" variant="outline" size="sm" className="mt-4 gap-2" onClick={() => void load(true)}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Provo përsëri</Button> : filter !== "all" && <Button data-testid="button-activity-clear-filter" variant="outline" size="sm" className="mt-4" onClick={() => setFilter("all")}>Shfaq të gjitha</Button>}
              </div>
            ) : (
              <table className="w-full table-fixed text-left">
                <caption className="sr-only">Aktiviteti i {agentName}. Orari sipas zonës Europe/Tirane. Kërkesat API janë regjistrime teknike, jo klikime.</caption>
                <thead className="sticky top-0 z-10 hidden border-b bg-muted text-[11px] uppercase tracking-wider text-muted-foreground md:table-header-group">
                  <tr><th scope="col" className="w-[18%] px-5 py-3 font-medium">Koha / Lloji</th><th scope="col" className="w-[53%] px-5 py-3 font-medium">Aktiviteti</th><th scope="col" className="w-[29%] px-5 py-3 font-medium">IP / Pajisja</th></tr>
                </thead>
                <tbody className="block divide-y md:table-row-group">
                  {rows.map(row => (
                    <tr key={row.id} data-testid={`row-agent-activity-${row.id}`} className="block px-4 py-4 hover:bg-muted/20 md:table-row md:p-0">
                      <td className="mb-3 flex flex-wrap items-center justify-between gap-2 md:mb-0 md:table-cell md:px-5 md:py-4 md:align-top">
                        <time dateTime={row.createdAt} className="text-xs font-medium tabular-nums leading-5 md:mb-2 md:block">{fmtDate(row.createdAt)}</time>
                        <TypeBadge type={row.type} />
                      </td>
                      <td className="block md:table-cell md:px-5 md:py-4 md:align-top"><ActivityDetails row={row} /></td>
                      <td className="mt-3 block rounded-lg bg-muted/30 p-3 md:mt-0 md:table-cell md:rounded-none md:bg-transparent md:px-5 md:py-4 md:align-top"><ConnectionDetails row={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-[11px] leading-relaxed text-muted-foreground">Zona kohore: Europe/Tirane<br />API dhe API historike nuk tregojnë klikime të përdoruesit.</p>
            {rows.length > 0 && loadError ? (
              <div role="alert" className="flex max-w-full flex-wrap items-center gap-2 text-xs text-destructive" data-testid="error-activity-load-more">
                <span>{loadError}</span><Button data-testid="button-retry-activity-more" size="sm" variant="outline" onClick={() => void load(false)}>Provo përsëri</Button>
              </div>
            ) : rows.length < total && (
              <Button data-testid="button-load-more-activity" variant="outline" size="sm" className="gap-2" onClick={() => void load(false)} disabled={loading}>
                <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />{loading ? "Po ngarkohen…" : "Ngarko më shumë"}<span className="text-xs tabular-nums text-muted-foreground">{rows.length}/{total}</span>
              </Button>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
