import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Users, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { format, isToday, isYesterday } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface Msg {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string;
}

const LS_LAST_READ = "fms.teamchat.lastReadId";

function fmtTime(d: string): string {
  const date = new Date(d);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Dje " + format(date, "h:mm a");
  return format(date, "dd MMM h:mm a");
}

let audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    if (!audioCtx) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    const tones = [880, 1175];
    tones.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      const dur = 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch {}
}

function showBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    const n = new Notification(title, { body, tag: "fms-team-chat", silent: true });
    setTimeout(() => { try { n.close(); } catch {} }, 5000);
    n.onclick = () => { window.focus(); try { n.close(); } catch {} };
  } catch {}
}

function avatarColor(name: string): string {
  const colors = ["bg-blue-500", "bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-violet-500", "bg-cyan-500", "bg-pink-500"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export function TeamChatWidget() {
  const { user } = useAdminAuth();
  const role = user?.role;
  const allowed = role === "admin" || role === "manager";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("fms.teamchat.sound") !== "0";
  });
  const firstLoadRef = useRef(true);

  useEffect(() => {
    if (!allowed) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
  }, [allowed]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  const computeUnread = useCallback((msgs: Msg[]) => {
    const last = Number(localStorage.getItem(LS_LAST_READ) || 0);
    let n = 0;
    for (const m of msgs) if (m.id > last && m.authorId !== user?.id) n++;
    return n;
  }, [user?.id]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/team-chat/messages?limit=100`, { credentials: "include" });
      if (r.ok) {
        const data: Msg[] = await r.json();
        setMessages(data);
        setUnread(computeUnread(data));
      }
    } finally { setLoading(false); }
  }, [computeUnread]);

  // Initial load + WS connect
  useEffect(() => {
    if (!allowed) return;
    fetchMessages().finally(() => { setTimeout(() => { firstLoadRef.current = false; }, 500); });

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${API_BASE}/team-chat/messages?limit=100`, { credentials: "include" });
        if (r.ok) {
          const data: Msg[] = await r.json();
          setMessages(prev => {
            const prevIds = new Set(prev.map(m => m.id));
            const newOnes = data.filter(m => !prevIds.has(m.id));
            if (newOnes.length === 0 && prev.length === data.length) return prev;
            // Notify for new messages from others
            if (!firstLoadRef.current) {
              const fromOthers = newOnes.filter(m => m.authorId !== user?.id);
              if (fromOthers.length > 0) {
                if (localStorage.getItem("fms.teamchat.sound") !== "0") playBeep();
                const last = fromOthers[fromOthers.length - 1];
                showBrowserNotification(
                  `${last.authorName} — Chat i Stafit`,
                  fromOthers.length > 1 ? `${fromOthers.length} mesazhe të reja` : last.message
                );
                if (!openRef.current) setUnread(u => u + fromOthers.length);
                else {
                  localStorage.setItem(LS_LAST_READ, String(last.id));
                }
              }
            }
            return data;
          });
        }
      } catch {}
      if (!stopped) timer = setTimeout(poll, openRef.current ? 3000 : 6000);
    };
    timer = setTimeout(poll, openRef.current ? 3000 : 6000);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [allowed, fetchMessages, user?.id]);

  // Auto-scroll + mark read on open
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      const last = messages.length ? messages[messages.length - 1].id : 0;
      if (last) localStorage.setItem(LS_LAST_READ, String(last));
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      const r = await fetch(`${API_BASE}/team-chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      if (!r.ok) setDraft(text);
    } catch { setDraft(text); }
    finally { setSending(false); }
  };

  if (!allowed) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 group"
          aria-label="Hap chat-in"
        >
          <span className="relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-indigo-900/30 hover:scale-110 transition-transform">
            <MessageCircle className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed right-4 bottom-4 z-50 w-[340px] h-[480px] max-h-[calc(100vh-2rem)] bg-white shadow-2xl flex flex-col rounded-xl overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-[#0f172a] text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                <Users className="h-3 w-3 text-blue-300" />
              </div>
              <div className="leading-tight">
                <div className="text-[12px] font-semibold">Chat i Stafit</div>
                <div className="text-[10px] text-blue-300">Bisedë e brendshme</div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  localStorage.setItem("fms.teamchat.sound", next ? "1" : "0");
                  if (next) playBeep();
                }}
                title={soundOn ? "Çaktivizo zilen" : "Aktivizo zilen"}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                {soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-slate-400" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50/40">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 gap-2">
                <MessageCircle className="w-10 h-10 text-slate-200" />
                <div className="text-sm font-medium">Nuk ka mesazhe akoma</div>
                <div className="text-xs">Bëj ti i pari që fillon bisedën!</div>
              </div>
            ) : (
              messages.map((m, i) => {
                const self = m.authorId === user?.id;
                const prev = messages[i - 1];
                const showAuthor = !self && (!prev || prev.authorId !== m.authorId);
                const sameAuthorBefore = prev && prev.authorId === m.authorId;
                return (
                  <div key={m.id} className={cn("flex gap-2", self ? "flex-row-reverse" : "flex-row", sameAuthorBefore && "mt-0.5")}>
                    {!self && (
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5", showAuthor ? avatarColor(m.authorName) : "invisible")}>
                        {m.authorName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className={cn("max-w-[78%] flex flex-col", self ? "items-end" : "items-start")}>
                      {showAuthor && (
                        <span className="text-[10px] font-semibold text-slate-600 mb-0.5 px-1">
                          {m.authorName}
                          <span className="ml-1 text-slate-400 font-normal">· {m.authorRole === "admin" ? "Admin" : "Menaxher"}</span>
                        </span>
                      )}
                      <div className={cn(
                        "px-2.5 py-1.5 rounded-2xl text-[12.5px] leading-snug break-words whitespace-pre-wrap",
                        self
                          ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm"
                          : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                      )}>
                        {m.message}
                      </div>
                      <span className="text-[9px] text-slate-400 mt-0.5 px-1">{fmtTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="px-2.5 py-2 border-t bg-white shrink-0">
            <div className="flex gap-1.5 items-center">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Shkruaj mesazh…"
                maxLength={2000}
                className="flex-1 text-[12.5px] outline-none px-2.5 h-8 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white transition-colors"
              />
              <button
                onClick={send}
                disabled={!draft.trim() || sending}
                className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
