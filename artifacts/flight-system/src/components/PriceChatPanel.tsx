import { useState, useEffect, useRef } from "react";
import { fmtM } from "@/lib/utils";
import { Link } from "wouter";
import {
  X, Send, ArrowUpDown, CheckCircle2, XCircle, Clock,
  Loader2, MessageSquarePlus, Tag, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAdminAuth } from "@/context/AdminAuthContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface Message {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string;
}

interface PriceRequest {
  id: number;
  bookingId: number;
  bookingRef: string;
  requestedByName: string;
  currentAmount: number;
  suggestedAmount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  unreadByManager: boolean;
}

interface PriceChatPanelProps {
  open: boolean;
  onClose: () => void;
  requestId: number | null;
  bookingId: number;
  bookingRef: string;
  currentAmount: number;
  requestType?: "sell" | "net";
  onRequestCreated: (req: { id: number; suggestedAmount: number }) => void;
  onStatusChange?: () => void;
}

const STATUS_CONFIG = {
  pending:  { label: "Në pritje",  colorClass: "bg-amber-100 text-amber-700",  Icon: Clock },
  approved: { label: "Aprovuar",   colorClass: "bg-green-100 text-green-700",  Icon: CheckCircle2 },
  rejected: { label: "Refuzuar",   colorClass: "bg-red-100 text-red-700",      Icon: XCircle },
};

export function PriceChatPanel({
  open, onClose, requestId, bookingId, bookingRef, currentAmount, requestType = "sell",
  onRequestCreated, onStatusChange,
}: PriceChatPanelProps) {
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";

  const [request, setRequest] = useState<PriceRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [adminAction, setAdminAction] = useState<"approve" | "reject" | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  const [newPrice, setNewPrice] = useState(String(currentAmount));
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchData = async (id: number) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/${id}/messages`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setRequest(data.request);
        setMessages(data.messages);
      }
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: number) => {
    if (isAdmin) return;
    await fetch(`${API_BASE}/price-requests/${id}/mark-read`, {
      method: "POST", credentials: "include",
    }).catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    if (requestId) {
      fetchData(requestId).then(() => markRead(requestId));
    } else {
      setRequest(null);
      setMessages([]);
      setNewPrice(String(currentAmount));
      setNewNote("");
    }
  }, [open, requestId]);

  useEffect(() => {
    if (open && messages.length > 0)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [messages.length, open]);

  const handleCreate = async () => {
    const amount = Math.round(parseFloat(newPrice));
    if (isNaN(amount) || amount <= 0) return;
    setCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookingId, suggestedAmount: amount, note: newNote.trim() || null, requestType }),
      });
      if (resp.ok) {
        const created = await resp.json();
        onRequestCreated({ id: created.id, suggestedAmount: amount });
        await fetchData(created.id);
        await markRead(created.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim() || sending || !request) return;
    setSending(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/${request.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: draft.trim() }),
      });
      if (resp.ok) {
        setDraft("");
        await fetchData(request.id);
      }
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (action: "approve" | "reject") => {
    if (!request) return;
    setActionSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/price-requests/${request.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewNote: actionNote }),
      });
      if (resp.ok) {
        setAdminAction(null);
        setActionNote("");
        await fetchData(request.id);
        onStatusChange?.();
      }
    } finally {
      setActionSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
  };

  const diff = request ? request.suggestedAmount - request.currentAmount : 0;

  if (!open) return null;

  return (
    <>
      <div className={cn(
        "fixed right-4 bottom-4 z-50 w-[340px] h-[480px] max-h-[calc(100vh-2rem)] bg-white shadow-2xl flex flex-col rounded-xl overflow-hidden border border-slate-200",
        "animate-in fade-in slide-in-from-bottom-4 duration-150"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-[#0f172a] text-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <MessageSquarePlus className="h-3 w-3 text-blue-300" />
            </div>
            <div className="leading-tight">
              <div className="text-[12px] font-semibold">{requestType === "net" ? "Çmim Neto" : "Bisedë Çmimi"}</div>
              <Link
                href={`/bookings/${bookingId}`}
                onClick={onClose}
                className="text-[10px] text-blue-300 hover:text-blue-200 font-mono inline-flex items-center gap-0.5 transition-colors"
              >
                {bookingRef}
                <ExternalLink className="h-2 w-2 opacity-70" />
              </Link>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Price summary strip */}
        {request ? (
          <div className="px-3 py-1.5 bg-gray-50 border-b shrink-0 flex items-center gap-2 flex-wrap">
            <div className="leading-tight">
              <div className="text-[9px] text-gray-400 uppercase tracking-wide">Aktual</div>
              <div className="font-bold text-gray-700 text-[12px] tabular-nums">€{fmtM(request.currentAmount)}</div>
            </div>
            <ArrowUpDown className="h-3 w-3 text-gray-300 shrink-0" />
            <div className="leading-tight">
              <div className="text-[9px] text-gray-400 uppercase tracking-wide">Sugjeruar</div>
              <div className={cn("font-bold text-[12px] tabular-nums", diff >= 0 ? "text-green-600" : "text-red-600")}>
                €{fmtM(request.suggestedAmount)}
              </div>
            </div>
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums",
              diff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              {diff >= 0 ? "+" : ""}€{fmtM(diff)}
            </span>
            {(() => {
              const cfg = STATUS_CONFIG[request.status];
              return (
                <Badge className={`ml-auto ${cfg.colorClass} text-[10px] font-medium flex items-center gap-0.5 shrink-0 px-1.5 py-0`}>
                  <cfg.Icon className="h-2.5 w-2.5" />{cfg.label}
                </Badge>
              );
            })()}
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-gray-50 border-b shrink-0">
            <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              Çmimi aktual: <strong>€{fmtM(currentAmount)}</strong>
            </div>
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 overflow-y-auto">
          {!requestId && !request && isAdmin ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Nuk ka kërkesë aktive për këtë çmim.</div>
          ) : !requestId && !request ? (
            /* CREATE NEW REQUEST — compact form inside the chat */
            <div className="px-4 py-5 space-y-4">
              <div className="text-sm font-semibold text-gray-700">
                {requestType === "net" ? "Sugjero çmim neto të ri" : "Sugjero çmim të ri"}
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1.5">
                  {requestType === "net" ? "Çmimi neto i sugjeruar (€)" : "Çmimi i ri (€)"}
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  className="text-sm"
                  placeholder="p.sh. 250"
                />
                {newPrice && !isNaN(parseFloat(newPrice)) && parseFloat(newPrice) !== currentAmount && (
                  <div className={cn(
                    "text-xs mt-1.5 font-semibold",
                    parseFloat(newPrice) > currentAmount ? "text-green-600" : "text-red-600"
                  )}>
                    {parseFloat(newPrice) > currentAmount ? "▲" : "▼"}
                    {" "}Ndryshim:  {parseFloat(newPrice) > currentAmount ? "+" : ""}
                    €{fmtM(parseFloat(newPrice) - currentAmount)}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1.5">Mesazh / Shënim (opsional)</label>
                <Textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Arsyeja e ndryshimit..."
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={creating || !newPrice || parseFloat(newPrice) <= 0}
              >
                {creating
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Duke dërguar...</>
                  : <><Send className="h-4 w-4 mr-2" />Dërgo Kërkesën</>
                }
              </Button>
            </div>
          ) : (
            /* CHAT THREAD */
            <div className="px-4 py-3 space-y-3 min-h-full">
              {loading && (
                <div className="flex items-center justify-center h-16">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="text-center text-sm text-gray-400 py-8">Nuk ka mesazhe akoma</div>
              )}
              {messages.map(msg => {
                const selfSent = msg.authorId === user?.id;
                return (
                  <div key={msg.id} className={cn("flex gap-2", selfSent ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5",
                      msg.authorRole === "admin" ? "bg-indigo-500" : "bg-blue-500"
                    )}>
                      {msg.authorName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className={cn("max-w-[76%] flex flex-col gap-0.5", selfSent ? "items-end" : "items-start")}>
                      {!selfSent && (
                        <span className="text-[11px] font-semibold text-gray-600">
                          {msg.authorName}
                          <span className={cn(
                            "ml-1 text-[10px] font-normal",
                            msg.authorRole === "admin" ? "text-indigo-400" : "text-blue-400"
                          )}>
                            • {msg.authorRole === "admin" ? "Admin" : "Menaxher"}
                          </span>
                        </span>
                      )}
                      <div className={cn(
                        "px-3 py-2 rounded-2xl text-sm leading-relaxed break-words",
                        selfSent
                          ? "bg-blue-500 text-white rounded-tr-sm"
                          : "bg-gray-100 text-gray-800 rounded-tl-sm"
                      )}>
                        {msg.message}
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {format(new Date(msg.createdAt), "dd MMM h:mm a")}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Admin action bar */}
        {isAdmin && request?.status === "pending" && !adminAction && (
          <div className="px-2.5 py-1.5 border-t bg-gray-50 shrink-0">
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 text-[11px] h-7"
                onClick={() => { setAdminAction("reject"); setActionNote(""); }}>
                <XCircle className="h-3 w-3 mr-1" /> Refuzo
              </Button>
              <Button size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 text-[11px] h-7"
                onClick={() => { setAdminAction("approve"); setActionNote(""); }}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovo
              </Button>
            </div>
          </div>
        )}

        {isAdmin && adminAction && (
          <div className={cn(
            "px-4 pt-3 pb-3 border-t space-y-2 shrink-0",
            adminAction === "approve" ? "bg-green-50" : "bg-red-50"
          )}>
            <div className={cn("text-xs font-semibold",
              adminAction === "approve" ? "text-green-700" : "text-red-700")}>
              {adminAction === "approve" ? "✅ Konfirmo aprovimin" : "❌ Konfirmo refuzimin"}
            </div>
            <Textarea
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Shënim opsional..."
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-xs h-7"
                onClick={() => setAdminAction(null)}>
                Anulo
              </Button>
              <Button size="sm"
                className={cn("flex-1 text-xs h-7",
                  adminAction === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700")}
                onClick={() => handleAction(adminAction)}
                disabled={actionSaving}>
                {actionSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Konfirmo"}
              </Button>
            </div>
          </div>
        )}

        {/* Message input — only when request exists and is pending */}
        {request?.status === "pending" && !adminAction && (
          <div className="px-2.5 py-2 border-t bg-white shrink-0">
            <div className="flex gap-1.5 items-end">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Shkruaj mesazh… (Ctrl+Enter)"
                rows={1}
                className="flex-1 text-[12px] resize-none min-h-[32px] py-1.5 px-2"
              />
              <Button size="icon"
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="h-8 w-8 shrink-0 bg-blue-500 hover:bg-blue-600">
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
