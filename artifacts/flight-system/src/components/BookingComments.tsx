import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { StickyNote, CornerDownRight, Loader2 } from "lucide-react";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface BookingCommentRow {
  id: number;
  bookingId: number;
  parentId: number | null;
  authorId: number | null;
  authorName: string;
  authorRole: string | null;
  message: string;
  createdAt: string;
}

// Ngjyra të dallueshme, të qëndrueshme sipas autorit.
const NOTE_COLORS = [
  { bg: "bg-amber-100", ring: "ring-amber-300", name: "text-amber-800" },
  { bg: "bg-sky-100", ring: "ring-sky-300", name: "text-sky-800" },
  { bg: "bg-emerald-100", ring: "ring-emerald-300", name: "text-emerald-800" },
  { bg: "bg-violet-100", ring: "ring-violet-300", name: "text-violet-800" },
  { bg: "bg-rose-100", ring: "ring-rose-300", name: "text-rose-800" },
  { bg: "bg-orange-100", ring: "ring-orange-300", name: "text-orange-800" },
];
function colorFor(author: string) {
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) >>> 0;
  return NOTE_COLORS[h % NOTE_COLORS.length];
}

function fmtWhen(iso: string) {
  try { return format(new Date(iso), "dd/MM/yyyy h:mm a"); } catch { return iso; }
}

// Sinjalizim i vogël te lista e rezervimeve kur rezervimi ka shënime brenda.
export function BookingNotesBadge({ booking, size = "sm" }: { booking: any; size?: "xs" | "sm" }) {
  const n = Number(booking?.commentsCount ?? 0);
  if (!n) return null;
  const xs = size === "xs";
  return (
    <span
      title={`${n} shënim${n === 1 ? "" : "e"} brenda rezervimit`}
      className={`inline-flex items-center gap-1 rounded-md font-semibold bg-amber-100 text-amber-800 ring-1 ring-amber-300 shrink-0 ${xs ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
    >
      <StickyNote className={xs ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {n}
    </span>
  );
}

export default function BookingComments({ bookingId, embedded = false }: { bookingId: number; embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: comments = [], isLoading } = useQuery<BookingCommentRow[]>({
    queryKey: ["booking-comments", bookingId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bookings/${bookingId}/comments`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const threads = useMemo(() => {
    const roots = comments.filter(c => c.parentId == null);
    const byParent = new Map<number, BookingCommentRow[]>();
    for (const c of comments) {
      if (c.parentId != null) {
        const arr = byParent.get(c.parentId) || [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      }
    }
    return roots.map(r => ({ root: r, replies: byParent.get(r.id) || [] }));
  }, [comments]);

  const send = async (message: string, parentId: number | null) => {
    const msg = message.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/bookings/${bookingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg, parentId }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error || "Dërgimi dështoi");
      }
      if (parentId == null) setText("");
      else { setReplyText(""); setReplyTo(null); }
      await queryClient.invalidateQueries({ queryKey: ["booking-comments", bookingId] });
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Shënimi nuk u dërgua", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, message: string, parentId: number | null) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(message, parentId);
    }
  };

  const body = (
    <>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Duke ngarkuar…</div>
        ) : threads.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">Ende s'ka shënime — shkruaj më poshtë dhe shtyp Enter.</div>
        ) : (
          <div className={`space-y-2.5 overflow-y-auto pr-1 ${embedded ? "max-h-56" : "max-h-72"}`}>
            {threads.map(({ root, replies }) => {
              const c = colorFor(root.authorName);
              return (
                <div key={root.id}>
                  <div className={`rounded-lg px-3 py-2 ring-1 ${c.bg} ${c.ring}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs font-bold ${c.name}`}>{root.authorName}</span>
                      <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{fmtWhen(root.createdAt)}</span>
                    </div>
                    <div className="text-sm text-slate-800 whitespace-pre-wrap break-words mt-0.5">{root.message}</div>
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        className="text-[11px] font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                        onClick={() => { setReplyTo(replyTo === root.id ? null : root.id); setReplyText(""); }}
                      >
                        <CornerDownRight className="h-3 w-3" /> Reply
                      </button>
                    </div>
                  </div>
                  {(replies.length > 0 || replyTo === root.id) && (
                    <div className="ml-6 mt-1.5 space-y-1.5 border-l-2 border-slate-200 pl-3">
                      {replies.map(rep => {
                        const rc = colorFor(rep.authorName);
                        return (
                          <div key={rep.id} className={`rounded-lg px-3 py-1.5 ring-1 ${rc.bg} ${rc.ring}`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-[11px] font-bold ${rc.name}`}>{rep.authorName}</span>
                              <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{fmtWhen(rep.createdAt)}</span>
                            </div>
                            <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{rep.message}</div>
                          </div>
                        );
                      })}
                      {replyTo === root.id && (
                        <input
                          autoFocus
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => onKeyDown(e, replyText, root.id)}
                          disabled={sending}
                          placeholder="Shkruaj reply… (Enter për ta dërguar)"
                          className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => onKeyDown(e, text, null)}
          disabled={sending}
          placeholder="Shkruaj një shënim… (Enter për ta dërguar — nuk editohet më pas)"
          className="w-full h-9 rounded-md border border-amber-300 bg-amber-50/60 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-amber-700/50"
        />
    </>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <StickyNote className="h-4 w-4 text-amber-600" />
          Shënime ({comments.length})
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4 text-amber-600" />
          Shënime ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {body}
      </CardContent>
    </Card>
  );
}
