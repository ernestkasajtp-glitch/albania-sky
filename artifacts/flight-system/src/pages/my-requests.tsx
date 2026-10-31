import { useState, useEffect } from "react";
import { fmtM } from "@/lib/utils";
import {
  Bell, Loader2, CheckCircle2, XCircle, Clock,
  ArrowUpDown, MessageSquare, RefreshCw, ExternalLink, MailOpen, Mail
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PriceChatPanel } from "@/components/PriceChatPanel";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface MyRequest {
  id: number;
  bookingId: number;
  bookingRef: string;
  currentAmount: number;
  suggestedAmount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  unreadByManager: boolean;
  createdAt: string;
}

const STATUS_CONFIG = {
  pending:  { label: "Në pritje",  color: "bg-amber-100 text-amber-700 border-amber-200",  Icon: Clock,         dot: "bg-amber-400" },
  approved: { label: "Aprovuar",   color: "bg-green-100 text-green-700 border-green-200",  Icon: CheckCircle2,  dot: "bg-green-400" },
  rejected: { label: "Refuzuar",   color: "bg-red-100 text-red-700 border-red-200",        Icon: XCircle,       dot: "bg-red-400" },
};

type Filter = "all" | "pending" | "unread";

export default function MyRequestsPage() {
  const [requests, setRequests]   = useState<MyRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<Filter>("unread");
  const [chatReq, setChatReq]     = useState<MyRequest | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy]   = useState(false);
  const { toast } = useToast();

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/mine`, { credentials: "include" });
      if (resp.ok) setRequests(await resp.json());
    } catch {
      toast({ title: "Gabim gjatë ngarkimit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const filtered = requests.filter(r => {
    if (filter === "unread")  return r.unreadByManager;
    if (filter === "pending") return r.status === "pending";
    return true;
  });

  const unreadCount  = requests.filter(r => r.unreadByManager).length;
  const pendingCount = requests.filter(r => r.status === "pending").length;

  // Pastro përzgjedhjet që s'janë më në listën e filtruar
  useEffect(() => {
    setSelectedIds(prev => {
      const visible = new Set(filtered.map(r => r.id));
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, requests]);

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map(r => r.id)));
  };
  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkMark = async (read: boolean, all = false) => {
    const ids = all ? [] : [...selectedIds];
    const affected = all ? requests.filter(r => r.unreadByManager).length : ids.length;
    if (!all && ids.length === 0) return;
    setBulkBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/mark-read-bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true, read } : { ids, read }),
      });
      if (!resp.ok) throw new Error();
      toast({
        title: read
          ? `${affected} njoftim${affected === 1 ? "" : "e"} u shënua${affected === 1 ? "" : "n"} si të lexuara`
          : `${affected} njoftim${affected === 1 ? "" : "e"} u shënua${affected === 1 ? "" : "n"} si të palexuara`,
      });
      setSelectedIds(new Set());
      await fetchRequests();
    } catch {
      toast({ title: "Veprimi dështoi", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const openChat = (req: MyRequest) => {
    setChatReq(req);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Njoftimet e mia
            {unreadCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs ml-1">
                {unreadCount} të palexuara
              </Badge>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Kërkesat tuaja të ndryshimit të çmimit dhe bisedat me admin
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchRequests} className="h-8 gap-1.5 text-xs shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Rifresko
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant={filter === "unread" ? "default" : "outline"}
          onClick={() => setFilter("unread")} className="h-8 text-xs">
          Të palexuara {unreadCount > 0 && `(${unreadCount})`}
        </Button>
        <Button size="sm" variant={filter === "pending" ? "default" : "outline"}
          onClick={() => setFilter("pending")} className="h-8 text-xs">
          Në pritje {pendingCount > 0 && `(${pendingCount})`}
        </Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")} className="h-8 text-xs">
          Të gjitha ({requests.length})
        </Button>
      </div>

      {/* Bulk selection toolbar */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              aria-label="Zgjidh të gjitha"
            />
            {selectedIds.size > 0 ? `${selectedIds.size} të zgjedhura` : "Zgjidh të gjitha"}
          </label>

          <div className="h-5 w-px bg-gray-300 mx-1" />

          <Button
            size="sm" variant="outline"
            disabled={bulkBusy || selectedIds.size === 0}
            onClick={() => bulkMark(true)}
            className="h-8 text-xs gap-1.5"
          >
            <MailOpen className="h-3.5 w-3.5" /> Shëno të lexuar
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={bulkBusy || selectedIds.size === 0}
            onClick={() => bulkMark(false)}
            className="h-8 text-xs gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" /> Shëno të palexuar
          </Button>

          <div className="h-5 w-px bg-gray-300 mx-1" />

          <Button
            size="sm"
            disabled={bulkBusy || unreadCount === 0}
            onClick={() => bulkMark(true, true)}
            className="h-8 text-xs gap-1.5"
          >
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Lexo të gjitha
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Bell className="h-10 w-10 text-gray-200" />
            <div className="text-gray-500 font-medium">
              {filter === "unread"
                ? "Nuk keni mesazhe të palexuara"
                : filter === "pending"
                ? "Nuk keni kërkesa aktive"
                : "Nuk keni ende kërkesa çmimi"}
            </div>
            <div className="text-xs text-gray-400">
              Kur të sugjeroni ndryshim çmimi, bisedat do të shfaqen këtu
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status];
            const diff = req.suggestedAmount - req.currentAmount;
            const hasUnread = req.unreadByManager;
            return (
              <Card
                key={req.id}
                className={`border transition-colors cursor-pointer group ${
                  hasUnread
                    ? "border-blue-300 bg-blue-50/40 hover:border-blue-400"
                    : "border-gray-200 hover:border-blue-300"
                }`}
                onClick={() => openChat(req)}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div className="mt-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(req.id)}
                        onCheckedChange={() => toggleOne(req.id)}
                        aria-label="Zgjidh njoftimin"
                      />
                    </div>
                    {/* Unread dot */}
                    <div className="mt-1.5 shrink-0">
                      {hasUnread ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 block animate-pulse" />
                      ) : (
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} block opacity-50`} />
                      )}
                    </div>

                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedBookingId(req.bookingId); }}
                          className="font-mono font-bold text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {req.bookingRef}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                        <Badge className={`${cfg.color} text-[11px] font-medium`}>
                          <cfg.Icon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                        {hasUnread && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[11px] font-medium">
                            Përgjigje e re
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {format(new Date(req.createdAt), "dd MMM yyyy h:mm a")}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2 w-fit">
                        <div className="text-center">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Aktual</div>
                          <div className="font-bold text-gray-700 text-sm">€{fmtM(req.currentAmount)}</div>
                        </div>
                        <ArrowUpDown className="h-3.5 w-3.5 text-gray-300" />
                        <div className="text-center">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Sugjeruar</div>
                          <div className={`font-bold text-sm ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                            €{fmtM(req.suggestedAmount)}
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          diff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {diff >= 0 ? "+" : ""}€{fmtM(diff)}
                        </span>
                      </div>

                      {req.note && (
                        <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100 truncate">
                          <span className="font-medium text-gray-400">Shënim: </span>{req.note}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm" variant="outline"
                      className={`h-8 text-xs gap-1.5 shrink-0 ${hasUnread ? "border-blue-300 text-blue-600 hover:bg-blue-50" : "group-hover:border-blue-300 group-hover:text-blue-600"}`}
                      onClick={e => { e.stopPropagation(); openChat(req); }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {hasUnread ? "Lexo" : "Bisedo"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>

      {chatReq && (
        <PriceChatPanel
          open={!!chatReq}
          onClose={() => { setChatReq(null); fetchRequests(); }}
          requestId={chatReq.id}
          bookingId={chatReq.bookingId}
          bookingRef={chatReq.bookingRef}
          currentAmount={chatReq.currentAmount}
          onRequestCreated={() => {}}
          onStatusChange={() => { fetchRequests(); setChatReq(null); }}
        />
      )}
    </div>
  );
}
