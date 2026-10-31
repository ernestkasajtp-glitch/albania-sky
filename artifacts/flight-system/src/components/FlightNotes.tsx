import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { StickyNote, Loader2 } from "lucide-react";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export interface FlightNoteRow {
  id: number;
  flightId: number;
  authorId: number | null;
  authorName: string;
  authorRole: string | null;
  message: string;
  createdAt: string;
}

// Ngjyra të dallueshme, të qëndrueshme sipas autorit (njëlloj si te shënimet e rezervimit).
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

async function fetchNotes(flightId: number): Promise<FlightNoteRow[]> {
  const r = await fetch(`${API_BASE}/flights/${flightId}/notes`, { credentials: "include" });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

// Chat i shënimeve të fluturimit — vetëm shtim, pa editim/fshirje.
// Shënimet ruhen MENJËHERË (s'varen nga "Ruaj dhe Dil" i formës).
// hideWhenEmpty: te dritarja e rezervimit kutia shfaqet VETËM kur fluturimi ka shënime.
export default function FlightNotes({ flightId, title = "Shënime", hideWhenEmpty = false, className = "" }: {
  flightId: number; title?: string; hideWhenEmpty?: boolean; className?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: notes = [], isLoading } = useQuery<FlightNoteRow[]>({
    queryKey: ["flight-notes", flightId],
    queryFn: () => fetchNotes(flightId),
    refetchInterval: 30000,
  });

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/flights/${flightId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error || "Dërgimi dështoi");
      }
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["flight-notes", flightId] });
      // Rifreskon numëratorin e badge-it te lista e fluturimeve.
      void queryClient.invalidateQueries({ queryKey: ["flights-paginated"] });
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "Shënimi nuk u dërgua", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (hideWhenEmpty && notes.length === 0) return null;

  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <StickyNote className="h-4 w-4 text-amber-600" />
        {title} ({notes.length})
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Duke ngarkuar…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">Ende s'ka shënime — shkruaj më poshtë dhe shtyp Enter.</div>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-1 max-h-56">
          {notes.map(n => {
            const c = colorFor(n.authorName);
            return (
              <div key={n.id} className={`rounded-lg px-3 py-2 ring-1 ${c.bg} ${c.ring}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-bold ${c.name}`}>{n.authorName}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{fmtWhen(n.createdAt)}</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap break-words mt-0.5">{n.message}</div>
              </div>
            );
          })}
        </div>
      )}
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        disabled={sending}
        placeholder="Shkruaj një shënim… (Enter për ta dërguar — nuk editohet më pas)"
        className="w-full h-9 rounded-md border border-amber-300 bg-amber-50/60 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-amber-700/50"
      />
    </div>
  );
}

// Badge e vogël (vetëm ikonë + numër) te lista e fluturimeve; në hover hapet
// një tabelë e vogël me të gjitha shënimet (autori, data, teksti).
export function FlightNotesHoverBadge({ flightId, count }: { flightId: number; count: number }) {
  const [open, setOpen] = useState(false);
  const { data: notes = [], isLoading } = useQuery<FlightNoteRow[]>({
    queryKey: ["flight-notes", flightId],
    queryFn: () => fetchNotes(flightId),
    enabled: open,
    staleTime: 15000,
  });
  if (!count) return null;
  return (
    <HoverCard openDelay={120} closeDelay={80} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        <span
          title={`${count} shënim${count === 1 ? "" : "e"}`}
          className="inline-flex items-center gap-0.5 align-middle rounded-md bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300 shrink-0 cursor-default"
        >
          <StickyNote className="h-3 w-3" />
          {count > 1 ? count : null}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-80 p-0 overflow-hidden">
        <div className="px-3 py-2 border-b bg-amber-50 flex items-center gap-1.5 text-xs font-bold text-amber-900">
          <StickyNote className="h-3.5 w-3.5" /> Shënime ({count})
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Duke ngarkuar…</div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {notes.map(n => (
                  <tr key={n.id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-1.5 font-semibold whitespace-nowrap w-1">
                      {n.authorName}
                      <div className="text-[10px] text-slate-400 font-normal">{fmtWhen(n.createdAt)}</div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-700 whitespace-pre-wrap break-words">{n.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
