import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Plus, Minus, X, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fmtM } from "@/lib/utils";
import { useBookingDraft } from "@/context/BookingDraftContext";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type GroupSearchResult = {
  id: number;
  pnrOriginal: string;
  departure: string;
  destination: string;
  flightDate: string;
  flightTime: string | null;
  totalSeats: number;
  pricePerSeat: number | null;
  status: string;
  airline: string | null;
  dateFlexBack: number;
  dateFlexForward: number;
  notes: string | null;
  seatsSoldTotal: number;
  seatsRemaining: number;
  matchedFromSet: string[];
  matchedToSet: string[];
  matchType: "full" | "partial";
};

export function AssignToGroupPanel({
  booking,
  onClose,
  onAssigned,
  selectedPassengerIds,
}: {
  booking: any;
  onClose: () => void;
  onAssigned?: () => void;
  selectedPassengerIds?: Array<number | string>;
}) {
  const draft = useBookingDraft();
  const { toast } = useToast();
  const [openFormGroupId, setOpenFormGroupId] = useState<number | null>(null);
  const [savingDraftIdx, setSavingDraftIdx] = useState<number | null>(null);
  type Draft = {
    pnr: string;
    passenger: string;
    price: string;
    persons: number;
    date: string;
    departure: string;
    arrival: string;
    status: "WAITING" | "CONFIRMED";
    saved: boolean;
    bookingRef: string;
    bookingPassengerId?: number | null; // ID e pasagjerit te tabela `passengers` — lidh PNR-në e grupit me pasagjerin
    groupSize?: number; // info only — sa pasagjerë vijnë bashkë nga e njëjta referencë
    opId?: string; // id i operacionit të radhitur te SaveBar (kur draft-i është staged)
  };
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const fl = booking?.flight;
  const fromCode = (fl?.fromAirport || fl?.fromCity || "").toUpperCase();
  const toCode = (fl?.toAirport || fl?.toCity || "").toUpperCase();
  const flightDate = fl?.departureDate ? format(new Date(fl.departureDate), "yyyy-MM-dd") : "";

  const passengers = useMemo(() => {
    const all = (booking?.passengers ?? []).filter((p: any) => !p.cancelled);
    if (selectedPassengerIds && selectedPassengerIds.length > 0) {
      const sel = new Set(selectedPassengerIds.map(String));
      return all.filter((p: any) => sel.has(String(p.id)));
    }
    return all;
  }, [booking?.passengers, selectedPassengerIds]);
  const personsCount = passengers.length;

  const totalAmount = Number(booking?.totalAmount ?? 0);
  const pricePerPerson = personsCount > 0 ? totalAmount / personsCount : 0;

  const enabled = Boolean(fromCode && toCode && flightDate && personsCount > 0);

  const { data: groups, isLoading, error, refetch } = useQuery<GroupSearchResult[]>({
    queryKey: ["assign-group-search", fromCode, toCode, flightDate, personsCount],
    queryFn: async () => {
      const url = `${API_BASE}/group-tickets/search?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&date=${encodeURIComponent(flightDate)}&persons=${personsCount}`;
      const r = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error("Kërkimi dështoi");
      return r.json();
    },
    enabled,
  });

  const operatorName =
    (booking as any)?.agentName ||
    ((booking as any)?.source === "CitizenPlane" ? "NESTI AGJENSI" : "") ||
    (booking as any)?.source ||
    "";

  const bookingRefStr = String((booking as any)?.bookingRef ?? (booking as any)?.id ?? "");

  const openDraftsForGroup = (group: GroupSearchResult) => {
    setOpenFormGroupId(group.id);
    // 1 rresht për pasagjer. seatsSold = 1 për secilin. groupSize tregon sa vijnë bashkë nga ref.
    const groupSize = passengers.length;
    setDrafts(
      passengers.map((p: any) => ({
        pnr: "",
        passenger: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
        price:
          p.ticketPrice != null
            ? fmtM(p.ticketPrice)
            : pricePerPerson > 0
              ? fmtM(pricePerPerson)
              : "",
        persons: 1,
        date: flightDate,
        departure: fromCode,
        arrival: toCode,
        status: "WAITING" as const,
        saved: false,
        bookingRef: bookingRefStr,
        bookingPassengerId: typeof p.id === "number" ? p.id : null,
        groupSize,
      }))
    );
  };

  const addEmptyDraft = () => {
    setDrafts(arr => [
      ...arr,
      {
        pnr: "",
        passenger: "",
        price: pricePerPerson > 0 ? fmtM(pricePerPerson) : "",
        persons: 1,
        date: flightDate,
        departure: fromCode,
        arrival: toCode,
        status: "WAITING",
        saved: false,
        bookingRef: bookingRefStr,
      },
    ]);
  };

  const removeDraft = (idx: number) => {
    setDrafts(arr => arr.filter((_, i) => i !== idx));
  };

  const closeDrafts = () => {
    setOpenFormGroupId(null);
    setDrafts([]);
  };

  const updateDraft = (idx: number, patch: Partial<Draft>) => {
    setDrafts(arr => arr.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const saveDraft = async (group: GroupSearchResult, idx: number) => {
    if (savingDraftIdx !== null) return;
    const d = drafts[idx];
    if (!d || d.saved) return;
    if (d.persons < 1) {
      toast({ title: "Personat duhet të jenë ≥ 1", variant: "destructive" });
      return;
    }
    const remainingForGroup =
      group.seatsRemaining -
      drafts.reduce((sum, x, i) => sum + (x.saved && i !== idx ? x.persons : 0), 0);
    if (d.persons > remainingForGroup) {
      toast({
        title: "SEAT të pamjaftueshme",
        description: `Mbeten vetëm ${remainingForGroup} ulëse për këtë grup.`,
        variant: "destructive",
      });
      return;
    }

    // Snapshot snapshot — që ndryshimet e mëvonshme te draft-i të mos prekin atë që do dërgohet.
    const body = {
      passengerName: d.passenger.trim() || null,
      status: "WAITING",
      price: d.price !== "" ? Math.round(Number(d.price)) : null,
      commission: null,
      operatorName,
      pnrNew: d.pnr.trim() || null,
      confirmedDate: flightDate,
      returnConfirmedDate: "",
      shiturDate: "",
      departureAirport: fromCode,
      arrivalAirport: toCode,
      paymentStatus: "",
      notes: `Nga rezervimi #${d.bookingRef || (booking.bookingRef ?? booking.id)}`,
      seatsSold: d.persons,
      bookingRef: d.bookingRef || String(booking.bookingRef ?? booking.id ?? ""),
      bookingPassengerId: d.bookingPassengerId ?? null,
    };

    // Radhit operacionin te SaveBar globale (RUAJ te rezervimi i kryen).
    const opId = draft.queueOp(
      `Cakto në grup: ${d.passenger || "Pasagjeri"} → ${group.departure}-${group.destination}`,
      async () => {
        const r = await fetch(`${API_BASE}/group-tickets/${group.id}/sales`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(await r.text());
        refetch();
        onAssigned?.();
      }
    );

    updateDraft(idx, { saved: true, opId });
    toast({
      title: "Draft i ruajtur",
      description: "Kliko RUAJ te rezervimi për të finalizuar caktimin.",
    });
  };

  if (!enabled) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <div className="text-sm text-orange-800">
            Mungojnë të dhëna të nevojshme (origjina, destinacioni, data, ose pasagjerët). Nuk mund të kërkohen grupe.
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-purple-300 bg-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-purple-600" />
            Cakto te Grupi
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          Po kërkohet për: <strong className="text-purple-800">{fromCode} → {toCode}</strong> në <strong className="text-purple-800">{format(new Date(flightDate), "dd MMM yyyy")}</strong> · <strong className="text-purple-800">{personsCount} {personsCount === 1 ? "person" : "persona"}</strong> · çmim/person ≈ <strong className="text-purple-800">€{fmtM(pricePerPerson)}</strong>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Duke kërkuar grupe…
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 py-4">Gabim gjatë kërkimit: {String((error as any)?.message ?? error)}</div>
        )}
        {!isLoading && !error && groups && groups.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nuk u gjet asnjë grup për këtë rrugë. Mund të krijoni një grup të ri manualisht te faqja "Grupet".
          </div>
        )}
        {!isLoading && !error && groups && groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g) => {
              const enoughSeats = g.seatsRemaining >= personsCount;
              const dateMatches = g.flightDate === flightDate;
              const formOpen = openFormGroupId === g.id;
              const allSaved = formOpen && drafts.length > 0 && drafts.every(d => d.saved);
              return (
                <div
                  key={g.id}
                  className={`p-3 rounded-lg border ${
                    g.matchType === "full" ? "border-green-300 bg-green-50/50" : "border-amber-300 bg-amber-50/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{g.departure} → {g.destination}</span>
                        <span className="text-sm text-gray-700">{format(new Date(g.flightDate), "dd MMM yyyy")}</span>
                        {g.flightTime && <span className="text-xs text-gray-500">{g.flightTime}</span>}
                        {g.airline && <Badge variant="outline" className="text-xs">{g.airline}</Badge>}
                        {g.matchType === "full" ? (
                          <Badge className="bg-green-600 text-white text-xs">Përputhje e plotë</Badge>
                        ) : (
                          <Badge className="bg-amber-500 text-white text-xs">Përputhje e pjesshme</Badge>
                        )}
                        {!dateMatches && (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-400">Datë e ndryshme</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PNR: <span className="font-mono">{g.pnrOriginal}</span> · Status: <span className="font-medium">{g.status}</span> · Të lira: <strong className={enoughSeats ? "text-green-700" : "text-red-600"}>{g.seatsRemaining}/{g.totalSeats}</strong>
                        {g.pricePerSeat != null && <> · Çmim/ulëse: €{fmtM(g.pricePerSeat)}</>}
                      </div>
                      {g.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{g.notes}</div>}
                    </div>
                    {!formOpen && (
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                        onClick={() => openDraftsForGroup(g)}
                        disabled={!enoughSeats || openFormGroupId !== null}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Shto këtu
                      </Button>
                    )}
                    {formOpen && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={closeDrafts}
                        disabled={savingDraftIdx !== null}
                      >
                        {allSaved ? "Mbyll" : "Anulo"}
                      </Button>
                    )}
                  </div>

                  {formOpen && (
                    <div className="mt-3 pt-3 border-t border-purple-200 space-y-2">
                      <div className="text-[11px] text-muted-foreground mb-1">
                        Data: <strong>{format(new Date(flightDate), "dd MMM yyyy")}</strong> · {fromCode} → {toCode} · Klikoni <Save className="inline h-3 w-3" /> për të ruajtur secilin rresht
                      </div>
                      <div className="overflow-x-auto -mx-3 px-3">
                        <table className="w-full text-xs border-separate border-spacing-y-1.5 min-w-[640px]">
                          <thead>
                            <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                              <th className="text-left px-2">Pasagjeri</th>
                              <th className="text-left px-2">Referenca</th>
                              <th className="text-left px-2">PNR</th>
                              <th className="text-left px-2">Data</th>
                              <th className="text-left px-2">Nisja</th>
                              <th className="text-left px-2">Mbërritja</th>
                              <th className="text-left px-2">Statusi</th>
                              <th className="text-left px-2">Çmimi €</th>
                              <th className="text-left px-2">Persona</th>
                              <th className="px-2 w-16"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {drafts.map((d, idx) => {
                              const isSaving = savingDraftIdx === idx;
                              return (
                                <tr key={idx} className={d.saved ? "bg-green-50" : "bg-white"}>
                                  <td className="px-2 py-1.5 rounded-l-lg border-y border-l border-gray-200">
                                    <input
                                      value={d.passenger}
                                      onChange={e => updateDraft(idx, { passenger: e.target.value })}
                                      disabled={d.saved}
                                      placeholder="Emri Mbiemri"
                                      className="w-full min-w-[140px] bg-transparent text-sm focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    {d.bookingRef ? (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[11px] font-bold border border-indigo-200"
                                        title="Referenca e rezervimit"
                                      >
                                        {d.bookingRef}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <input
                                      value={d.pnr}
                                      onChange={e => updateDraft(idx, { pnr: e.target.value.toUpperCase() })}
                                      disabled={d.saved}
                                      placeholder="PNR"
                                      className="w-24 bg-transparent font-mono text-sm uppercase focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <input
                                      type="date"
                                      value={d.date}
                                      onChange={e => updateDraft(idx, { date: e.target.value })}
                                      disabled={d.saved}
                                      className="w-32 bg-transparent text-sm focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <input
                                      value={d.departure}
                                      onChange={e => updateDraft(idx, { departure: e.target.value.toUpperCase() })}
                                      disabled={d.saved}
                                      className="w-14 bg-transparent text-sm uppercase font-semibold text-purple-700 focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <input
                                      value={d.arrival}
                                      onChange={e => updateDraft(idx, { arrival: e.target.value.toUpperCase() })}
                                      disabled={d.saved}
                                      className="w-14 bg-transparent text-sm uppercase font-semibold text-green-700 focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <select
                                      value={d.status}
                                      onChange={e => updateDraft(idx, { status: e.target.value as "WAITING" | "CONFIRMED" })}
                                      disabled={d.saved}
                                      className="bg-transparent text-xs font-semibold focus:outline-none disabled:text-gray-500"
                                    >
                                      <option value="WAITING">Pritje</option>
                                      <option value="CONFIRMED">Konfirmuar</option>
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    <input
                                      type="number"
                                      step="1"
                                      value={d.price}
                                      onChange={e => updateDraft(idx, { price: e.target.value })}
                                      disabled={d.saved}
                                      placeholder="0"
                                      className="w-20 bg-transparent text-sm focus:outline-none disabled:text-gray-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 border-y border-gray-200">
                                    {d.groupSize != null ? (
                                      <span
                                        className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-purple-100 text-purple-800 font-bold text-sm border border-purple-200"
                                        title={`${d.groupSize} pasagjerë vijnë bashkë nga referenca ${d.bookingRef}. Çdo rresht zbret 1 ulëse.`}
                                      >
                                        {d.groupSize}
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={() => updateDraft(idx, { persons: Math.max(1, d.persons - 1) })}
                                          disabled={d.saved}
                                          className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="w-7 text-center font-bold text-sm">{d.persons}</span>
                                        <button
                                          type="button"
                                          onClick={() => updateDraft(idx, { persons: d.persons + 1 })}
                                          disabled={d.saved}
                                          className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 rounded-r-lg border-y border-r border-gray-200 text-right whitespace-nowrap">
                                    {d.saved ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                                    ) : (
                                      <>
                                        {isSaving ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-purple-600 inline" />
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => saveDraft(g, idx)}
                                            disabled={savingDraftIdx !== null}
                                            title="Ruaj"
                                            className="p-1 rounded hover:bg-purple-100 text-purple-600 disabled:opacity-40"
                                          >
                                            <Save className="h-4 w-4" />
                                          </button>
                                        )}
                                        {drafts.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => removeDraft(idx)}
                                            disabled={savingDraftIdx !== null}
                                            title="Hiq"
                                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 ml-0.5 disabled:opacity-40"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {drafts.some(d => !d.saved) && (
                        <div className="flex items-center justify-end pt-1">
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={async () => {
                              for (let i = 0; i < drafts.length; i++) {
                                if (!drafts[i].saved) {
                                  // eslint-disable-next-line no-await-in-loop
                                  await saveDraft(g, i);
                                }
                              }
                            }}
                            disabled={savingDraftIdx !== null}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" /> Ruaj të gjitha
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-purple-200 text-xs text-muted-foreground flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            Pasagjerët shtohen me status <strong>WAITING</strong> dhe ruhen automatikisht me të dhënat nga ky rezervim (emër, çmim, datë). Mund t'i konfirmoni më vonë te faqja e Grupeve.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
