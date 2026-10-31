import { useState, useEffect, useCallback } from "react";
import {
  CalendarClock, Loader2, RefreshCw, Send, X, Mail, CheckCircle2,
  ArrowRight, AlertTriangle, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { fmtAmPm, fmtDateTimeAmPm } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

interface Recipient {
  email: string | null;
  agencyName: string | null;
  bookings: Array<{
    id: number;
    bookingRef: string;
    customerName: string;
    cpRef: string | null;
    passengers: string[];
  }>;
}

interface ScheduleChangeRow {
  id: number;
  flightId: number;
  flight: {
    id: number; airline: string; flightNumber: string;
    fromCity: string; toCity: string;
    departureDate: string; departureTime: string;
    arrivalDate: string; arrivalTime: string;
  };
  oldDepartureDate: string; oldDepartureTime: string;
  oldArrivalDate: string; oldArrivalTime: string;
  newDepartureDate: string; newDepartureTime: string;
  newArrivalDate: string; newArrivalTime: string;
  source: string;
  status: "pending" | "sent" | "dismissed";
  sentLog: Array<{ email: string; sentAt: string; bookingRefs: string[] }>;
  createdAt: string;
  updatedAt: string;
  departureDeltaHours: number;
  freeChangeEligible: boolean;
  recipients: Recipient[];
}

function fmtD(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "-";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function SchedCell({ label, oldV, newV }: { label: string; oldV: string; newV: string }) {
  const changed = oldV !== newV;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm flex items-center gap-1.5 flex-wrap">
        <span className={changed ? "line-through text-red-600" : "text-foreground"}>{oldV || "-"}</span>
        {changed && (
          <>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-bold text-green-700">{newV || "-"}</span>
          </>
        )}
      </span>
    </div>
  );
}

export default function ScheduleChangesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ScheduleChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // per-change selected recipient emails
  const [selected, setSelected] = useState<Record<number, Set<string>>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/schedule-changes${showAll ? "?all=1" : ""}`, { credentials: "include" });
      if (resp.ok) {
        const data: ScheduleChangeRow[] = await resp.json();
        setRows(Array.isArray(data) ? data : []);
        // Preselect every recipient that has an email
        setSelected(prev => {
          const next: Record<number, Set<string>> = { ...prev };
          for (const r of data) {
            if (r.status === "pending" && !next[r.id]) {
              next[r.id] = new Set(r.recipients.filter(g => g.email).map(g => g.email!));
            }
          }
          return next;
        });
      }
    } catch {
      toast({ title: "Gabim", description: "Nuk u ngarkuan ndryshimet e orarit.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [showAll, toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = (changeId: number, email: string) => {
    setSelected(prev => {
      const cur = new Set(prev[changeId] ?? []);
      if (cur.has(email)) cur.delete(email); else cur.add(email);
      return { ...prev, [changeId]: cur };
    });
  };

  const send = async (row: ScheduleChangeRow) => {
    const emails = [...(selected[row.id] ?? [])];
    if (emails.length === 0) {
      toast({ title: "Zgjidhni marrësit", description: "Asnjë marrës i zgjedhur.", variant: "destructive" });
      return;
    }
    setSending(row.id);
    try {
      const resp = await fetch(`${API_BASE}/schedule-changes/${row.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        toast({ title: "U dërguan", description: `${data.sent} email njoftimi u dërguan.` });
        load();
      } else {
        toast({ title: "Gabim", description: data.error || "Dërgimi dështoi.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Gabim", description: "Dërgimi dështoi.", variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const dismiss = async (row: ScheduleChangeRow) => {
    setDismissing(row.id);
    try {
      const resp = await fetch(`${API_BASE}/schedule-changes/${row.id}/dismiss`, {
        method: "PATCH", credentials: "include",
      });
      if (resp.ok) { toast({ title: "U mbyll", description: "Ndryshimi u mbyll pa dërguar email." }); load(); }
      else toast({ title: "Gabim", description: "Nuk u mbyll.", variant: "destructive" });
    } catch {
      toast({ title: "Gabim", description: "Nuk u mbyll.", variant: "destructive" });
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-amber-600" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Fluturimet me Ndryshime Orari</h1>
            <p className="text-xs text-muted-foreground">
              Fluturime me rezervime aktive, orari i të cilëve ka ndryshuar — zgjidhni kujt t'i dërgohet njoftimi.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Vetëm në pritje" : "Shfaq edhe të trajtuarat"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-600" />
            Asnjë ndryshim orari në pritje. Kur ndryshon orari i një fluturimi me rezervime aktive, ai shfaqet automatikisht këtu.
          </CardContent>
        </Card>
      ) : (
        rows.map(row => {
          const sel = selected[row.id] ?? new Set<string>();
          const pending = row.status === "pending";
          return (
            <Card key={row.id} className={pending ? "border-amber-300" : "opacity-80"}>
              <CardContent className="p-4 space-y-4">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">
                      {row.flight.airline} {row.flight.flightNumber}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {row.flight.fromCity} → {row.flight.toCity}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {row.source === "sync" ? "Sinkronizim orari" : "Ndryshim manual"}
                    </Badge>
                    {pending ? (
                      <Badge className="bg-amber-500 text-white text-[10px]">Në pritje</Badge>
                    ) : row.status === "sent" ? (
                      <Badge className="bg-green-600 text-white text-[10px]">U dërgua</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Mbyllur</Badge>
                    )}
                    {row.freeChangeEligible && (
                      <Badge className="bg-red-600 text-white text-[10px]">
                        &gt;3 orë — ndryshim date pa pagesë
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Regjistruar: {fmtDateTimeAmPm(row.createdAt)}
                  </span>
                </div>

                {/* Old → new schedule */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/40 rounded-lg p-3">
                  <SchedCell label="Data e nisjes" oldV={fmtD(row.oldDepartureDate)} newV={fmtD(row.newDepartureDate)} />
                  <SchedCell label="Ora e nisjes" oldV={fmtAmPm(row.oldDepartureTime)} newV={fmtAmPm(row.newDepartureTime)} />
                  <SchedCell label="Data e mbërritjes" oldV={fmtD(row.oldArrivalDate)} newV={fmtD(row.newArrivalDate)} />
                  <SchedCell label="Ora e mbërritjes" oldV={fmtAmPm(row.oldArrivalTime)} newV={fmtAmPm(row.newArrivalTime)} />
                </div>
                {row.departureDeltaHours > 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Zhvendosja e nisjes: <b>{row.departureDeltaHours} orë</b>
                  </div>
                )}

                {/* Recipients */}
                {row.recipients.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                      <Users className="w-3.5 h-3.5" /> Marrësit ({row.recipients.length})
                    </div>
                    <div className="space-y-2">
                      {row.recipients.map((g, i) => (
                        <label
                          key={i}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            g.email && pending ? "cursor-pointer hover:bg-muted/50" : "bg-muted/30"
                          } ${g.email && sel.has(g.email) && pending ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}`}
                        >
                          {pending && g.email ? (
                            <Checkbox
                              className="mt-0.5"
                              checked={sel.has(g.email)}
                              onCheckedChange={() => toggle(row.id, g.email!)}
                            />
                          ) : (
                            <span className="w-4" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              {g.email ? (
                                <span className="text-sm font-medium break-all">{g.email}</span>
                              ) : (
                                <span className="text-sm font-medium text-red-600">PA EMAIL — kontaktoni me telefon</span>
                              )}
                              {g.agencyName && (
                                <Badge variant="outline" className="text-[10px]">{g.agencyName}</Badge>
                              )}
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {g.bookings.map(b => (
                                <div key={b.id} className="text-xs text-muted-foreground">
                                  <span className="font-mono font-semibold text-foreground">{b.cpRef ?? b.bookingRef}</span>
                                  {" — "}{b.customerName}
                                  {b.passengers.length > 0 && (
                                    <span> · {b.passengers.join(", ")}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sent log */}
                {row.sentLog.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="font-semibold text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Email-e të dërguara:
                    </div>
                    {row.sentLog.map((e, i) => (
                      <div key={i}>
                        {e.email} — {e.bookingRefs.join(", ")} ({fmtDateTimeAmPm(e.sentAt)})
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {pending && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={sending === row.id || sel.size === 0}
                      onClick={() => send(row)}
                    >
                      {sending === row.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
                      Dërgo njoftimin ({sel.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dismissing === row.id}
                      onClick={() => dismiss(row)}
                    >
                      {dismissing === row.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <X className="w-4 h-4 mr-1.5" />}
                      Mbyll pa dërguar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
