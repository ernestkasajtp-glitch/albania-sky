import { useState, useEffect, useMemo, useRef } from "react";
import { fmtM } from "@/lib/utils";
import { Bell, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, MessageSquare, Search, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PriceChatPanel } from "@/components/PriceChatPanel";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface PriceRequest {
  id: number;
  bookingId: number;
  bookingRef: string;
  pnr: string | null;
  requestedByName: string;
  currentAmount: number;
  suggestedAmount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
}

const STATUS_CFG = {
  pending:  { label: "Në pritje", dot: "bg-amber-500",   pill: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Clock },
  approved: { label: "Aprovuar",  dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  rejected: { label: "Refuzuar",  dot: "bg-rose-500",    pill: "bg-rose-50 text-rose-700 border-rose-200",      Icon: XCircle },
};

export default function PriceRequestsPage() {
  const [requests, setRequests] = useState<PriceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [chatReq, setChatReq] = useState<PriceRequest | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const approveLock = useRef(false);
  const { toast } = useToast();
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";

  // Aprovim i drejtpërdrejtë me një klik — pa hapur bisedën (që ngarkohej ngadalë).
  // Përdor saktësisht të njëjtin endpoint si butoni "Konfirmo" në bisedë.
  const quickApprove = async (req: PriceRequest) => {
    if (approveLock.current) return; // ref lock: race-safe ndaj double-click
    approveLock.current = true;
    setApprovingId(req.id);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/${req.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewNote: "" }),
      });
      if (resp.ok) {
        toast({ title: `Çmimi u aprovua · ${req.bookingRef}` });
        await fetchRequests();
      } else {
        toast({ title: "Aprovimi dështoi", variant: "destructive" });
      }
    } catch {
      toast({ title: "Aprovimi dështoi", variant: "destructive" });
    } finally {
      approveLock.current = false;
      setApprovingId(null);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests`, { credentials: "include" });
      if (resp.ok) setRequests(await resp.json());
    } catch {
      toast({ title: "Gabim gjatë ngarkimit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const counts = useMemo(() => ({
    all:      requests.length,
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  }), [requests]);

  const filtered = useMemo(() => {
    let arr = filter === "all" ? requests : requests.filter(r => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(r =>
        r.bookingRef?.toLowerCase().includes(q) ||
        r.pnr?.toLowerCase().includes(q) ||
        r.requestedByName?.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [requests, filter, search]);

  // Totals për footer
  const totals = useMemo(() => {
    let totalDiff = 0;
    filtered.forEach(r => { totalDiff += (Number(r.suggestedAmount) - Number(r.currentAmount)); });
    return { totalDiff, count: filtered.length };
  }, [filtered]);

  return (
    <div
      className="min-h-full -mx-4 -my-4 md:-mx-6 md:-my-6 px-4 py-4 md:px-6 md:py-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      <div className="max-w-[1600px] mx-auto space-y-4 px-2">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Operacionet</span>
              <span className="text-slate-300">/</span>
              <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Kërkesat e Çmimit</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Bell className="h-6 w-6 text-blue-600" />
              Kërkesat e Çmimit
              {counts.pending > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded-md border border-amber-200 tabular-nums">
                  {counts.pending} në pritje
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">Sugjerimet e ndryshimit të çmimit nga stafi — kliko për të hapur bisedën.</p>
          </div>
        </div>

        {/* Toolbar */}
      <div className="page-filter-panel bg-white border border-slate-200/80 rounded-2xl p-2 shadow-sm flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200/60 rounded-lg p-0.5">
            {([
              ["pending",  "Në pritje", counts.pending,  "bg-amber-500"],
              ["approved", "Aprovuar",  counts.approved, "bg-emerald-500"],
              ["rejected", "Refuzuar",  counts.rejected, "bg-rose-500"],
              ["all",      "Të gjitha", counts.all,      "bg-slate-400"],
            ] as const).map(([key, label, n, dot]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {label}
                <span className="tabular-nums text-slate-400 text-[10px]">{n}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 border rounded-lg px-2.5 h-8 bg-slate-50 border-slate-200/60 min-w-[220px] flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              placeholder="REF, autori, shënim…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-slate-400"
            />
          </div>

          <div className="ml-auto text-[11px] text-slate-400 font-medium">
            {loading ? "Duke ngarkuar…" : `${filtered.length} kërkesa`}
          </div>
        </div>

        {/* List — virtualized-style dense rows */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-center">
              <Bell className="h-10 w-10 text-slate-200" />
              <div className="text-slate-500 font-medium text-sm">
                {filter === "pending" ? "Nuk ka kërkesa të hapura" : "Nuk ka kërkesa"}
              </div>
              <div className="text-xs text-slate-400">Kur menaxherët sugjerojnë çmime, do të shfaqen këtu.</div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map(req => {
                const cfg = STATUS_CFG[req.status];
                const cur = Number(req.currentAmount);
                const sug = Number(req.suggestedAmount);
                const diff = sug - cur;
                const pct = cur > 0 ? (diff / cur) * 100 : 0;
                const diffPos = diff >= 0;
                return (
                  <li
                    key={req.id}
                    onClick={() => setChatReq(req)}
                    className="group flex items-center gap-3 px-3 py-2 hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    {/* Status dot */}
                    <span className={`w-1.5 h-8 rounded-full ${cfg.dot} shrink-0`} />

                    {/* REF + meta */}
                    <div className="min-w-[140px] flex flex-col leading-tight">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                          {req.bookingRef}
                        </span>
                        {req.pnr && (
                          <span
                            className="font-mono text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1 py-px leading-none"
                            title="PNR"
                          >
                            {req.pnr}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {req.requestedByName} · {format(new Date(req.createdAt), "dd MMM h:mm a")}
                      </span>
                    </div>

                    {/* Price compact */}
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60 shrink-0">
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Aktual</span>
                        <span className="font-bold text-[12px] text-slate-700 tabular-nums">€{fmtM(cur)}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Sugjeruar</span>
                        <span className={`font-bold text-[12px] tabular-nums ${diffPos ? "text-emerald-700" : "text-rose-700"}`}>€{fmtM(sug)}</span>
                      </div>
                    </div>

                    {/* Diff pill */}
                    <span className={`inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-bold tabular-nums shrink-0 ${diffPos ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                      {diffPos ? "+" : ""}€{fmtM(diff)}
                      <span className="text-[9px] opacity-70 font-semibold">({diffPos ? "+" : ""}{pct.toFixed(0)}%)</span>
                    </span>

                    {/* Status badge */}
                    <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-semibold border ${cfg.pill} shrink-0`}>
                      <cfg.Icon className="w-2.5 h-2.5" />
                      {cfg.label}
                    </span>

                    {/* Note preview */}
                    {req.note && (
                      <span className="hidden md:inline text-[11px] text-slate-500 truncate flex-1 italic min-w-0">
                        "{req.note}"
                      </span>
                    )}

                    {/* Actions */}
                    <div className="ml-auto flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedBookingId(req.bookingId); }}
                        className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200"
                        title="Hap rezervimin"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      {isAdmin && req.status === "pending" && (
                        <button
                          onClick={e => { e.stopPropagation(); quickApprove(req); }}
                          disabled={approvingId === req.id}
                          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-semibold text-white bg-gradient-to-br from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-sm disabled:opacity-60"
                          title="Aprovo menjëherë"
                        >
                          {approvingId === req.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                          Aprovo
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setChatReq(req); }}
                        className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-semibold text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-sm"
                      >
                        <MessageSquare className="w-3 h-3" />
                        {req.status === "pending" ? "Vendos" : "Shiko"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer summary */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">
                Totale: <span className="text-slate-900 font-bold tabular-nums">{totals.count}</span> kërkesa
              </span>
              <span className="text-slate-500 font-medium">
                Diferencë neto: <span className={`font-bold tabular-nums ${totals.totalDiff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {totals.totalDiff >= 0 ? "+" : ""}€{fmtM(totals.totalDiff)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Booking detail dialog */}
      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>

      {chatReq && (
        <PriceChatPanel
          open={!!chatReq}
          onClose={() => setChatReq(null)}
          requestId={chatReq.id}
          bookingId={chatReq.bookingId}
          bookingRef={chatReq.bookingRef}
          currentAmount={chatReq.currentAmount}
          onRequestCreated={() => {}}
          onStatusChange={() => {
            fetchRequests();
            setChatReq(null);
          }}
        />
      )}
    </div>
  );
}
