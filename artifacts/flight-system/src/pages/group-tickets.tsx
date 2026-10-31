import React, { useState, useMemo, useRef, useEffect } from "react";
import { fmtM, fmtAmPm, fmtDateTimeAmPm } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Minus, Pencil, Trash2, ChevronDown, ChevronRight, Upload, X, Search,
  Layers, MapPin, Check, AlertCircle, Save, Clock, CheckCircle2,
  ArrowRight, Users, CalendarDays, Plane, RefreshCw, FolderOpen, TrendingUp, Armchair, FileText
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DayPicker } from "react-day-picker";
import { addDays, subDays, parseISO, format, isValid } from "date-fns";
import "react-day-picker/style.css";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const COLOR_STYLES: Record<string, { row: string; dot: string }> = {
  ORANGE: { row: "bg-orange-50 border-l-4 border-orange-400", dot: "bg-orange-400" },
  GREEN:  { row: "bg-green-50 border-l-4 border-green-500",  dot: "bg-green-500" },
  RED:    { row: "bg-red-50 border-l-4 border-red-500",      dot: "bg-red-500" },
  BLUE:   { row: "bg-blue-50 border-l-4 border-blue-500",    dot: "bg-blue-500" },
};

const SALE_STATUS_STYLES: Record<string, string> = {
  WAITING:   "bg-yellow-100 text-yellow-700 border border-yellow-300",
  CONFIRMED: "bg-blue-100 text-blue-700 border border-blue-300",
  TICKETED:  "bg-green-100 text-green-700 border border-green-300",
  CANCELLED: "bg-red-100 text-red-700 border border-red-300",
};

const SALE_STATUS_LABELS: Record<string, string> = {
  WAITING: "Pritje", CONFIRMED: "Konfirmuar", TICKETED: "Ticketed", CANCELLED: "Anuluar",
};

function apiCall(path: string, opts?: RequestInit) {
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
}

function useGroupTickets() {
  return useQuery({
    queryKey: ["group-tickets"],
    queryFn: async () => {
      const r = await apiCall("/group-tickets");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
}

// ─── Inline Sale Form (shown inside expanded row) ─────────────────────────────
function InlineSaleForm({ ticket, onSaved }: { ticket: any; onSaved: () => void }) {
  // Alternatives = alternative DEPARTURE airports (e.g. BLQ, MXP, BGY near Bologna)
  const departureOptions = [
    ticket.departure,
    ...(ticket.alternatives ?? []).map((a: any) => a.destination),
  ].filter(Boolean);

  const [departureAirport, setDepartureAirport] = useState(departureOptions[0] ?? ticket.departure ?? "");
  const [arrivalAirport, setArrivalAirport] = useState(ticket.destination ?? "");
  const [date, setDate] = useState("");
  const [dateStatus, setDateStatus] = useState<"WAITING" | "CONFIRMED">("WAITING");
  const [price, setPrice] = useState("");
  const [passenger, setPassenger] = useState("");
  const [passengerStatus, setPassengerStatus] = useState<"WAITING" | "CONFIRMED">("WAITING");
  const [pnrNew, setPnrNew] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const status = passengerStatus === "CONFIRMED" && dateStatus === "CONFIRMED" ? "CONFIRMED" : "WAITING";

  const save = async () => {
    if (!passenger.trim()) { setError("Emri i pasagjerit është i detyrueshëm"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiCall(`/group-tickets/${ticket.id}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureAirport: departureAirport.trim() || null,
          arrivalAirport: arrivalAirport.trim() || null,
          pnrNew: pnrNew.trim() || null,
          seatsSold: 1,
          passengerName: passenger.trim(),
          status,
          confirmedDate: dateStatus === "CONFIRMED" ? date || null : null,
          shiturDate: date || null,
          price: price !== "" ? Number(price) : null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setPassenger(""); setDate(""); setPrice(""); setPnrNew("");
      setDateStatus("WAITING"); setPassengerStatus("WAITING");
      setDepartureAirport(departureOptions[0] ?? ticket.departure ?? "");
      setArrivalAirport(ticket.destination ?? "");
      onSaved();
    } catch (e: any) { setError(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 mb-3">
      <div className="text-xs font-semibold text-blue-600 mb-3 flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Shto Shitje të Re
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-lg mb-2 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Row 1: Departure + Arrival airports */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
            ✈ Aeroporti i Nisjes
          </label>
          <select
            value={departureAirport}
            onChange={e => setDepartureAirport(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white font-semibold"
          >
            {departureOptions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
            🛬 Aeroporti i Mbërritjes
          </label>
          <input
            value={arrivalAirport}
            onChange={e => setArrivalAirport(e.target.value.toUpperCase())}
            placeholder={ticket.destination}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white font-semibold uppercase"
          />
        </div>

        {/* Row 2: Date + status toggle */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Data e Udhëtimit</label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white"
            />
            <div className="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
              <button
                onClick={() => setDateStatus("WAITING")}
                className={`px-2.5 py-2 text-[10px] font-bold flex items-center gap-1 transition-colors ${
                  dateStatus === "WAITING" ? "bg-yellow-400 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                <Clock className="h-3 w-3" /> WAIT
              </button>
              <button
                onClick={() => setDateStatus("CONFIRMED")}
                className={`px-2.5 py-2 text-[10px] font-bold flex items-center gap-1 transition-colors border-l border-gray-200 ${
                  dateStatus === "CONFIRMED" ? "bg-blue-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" /> CONF
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Passenger + status toggle */}
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Emri i Pasagjerit</label>
          <div className="flex items-center gap-1.5">
            <input
              value={passenger}
              onChange={e => setPassenger(e.target.value)}
              placeholder="Emri Mbiemri..."
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white"
              onKeyDown={e => e.key === "Enter" && save()}
            />
            <div className="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
              <button
                onClick={() => setPassengerStatus("WAITING")}
                className={`px-2.5 py-2 text-[10px] font-bold flex items-center gap-1 transition-colors ${
                  passengerStatus === "WAITING" ? "bg-yellow-400 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                <Clock className="h-3 w-3" /> WAIT
              </button>
              <button
                onClick={() => setPassengerStatus("CONFIRMED")}
                className={`px-2.5 py-2 text-[10px] font-bold flex items-center gap-1 transition-colors border-l border-gray-200 ${
                  passengerStatus === "CONFIRMED" ? "bg-blue-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" /> CONF
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Price + PNR + Save */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Çmimi i Shitjes (€)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="0"
              step="1"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white"
              onKeyDown={e => e.key === "Enter" && save()}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">PNR i Ri</label>
            <input
              value={pnrNew}
              onChange={e => setPnrNew(e.target.value)}
              placeholder="opsional..."
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white font-mono"
              onKeyDown={e => e.key === "Enter" && save()}
            />
          </div>
        </div>

        <div className="flex items-end">
          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Duke ruajtur..." : "Shto Shitjen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Sale Modal ──────────────────────────────────────────────────────────
function EditSaleModal({ groupId, sale, onClose, onSaved }: { groupId: number; sale: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    departureAirport: sale.departureAirport ?? "",
    arrivalAirport: sale.arrivalAirport ?? "",
    pnrNew: sale.pnrNew ?? "",
    seatsSold: sale.seatsSold ?? 1,
    passengerName: sale.passengerName ?? "",
    status: sale.status ?? "WAITING",
    confirmedDate: sale.confirmedDate ?? "",
    shiturDate: sale.shiturDate ?? "",
    operatorName: sale.operatorName ?? "",
    price: sale.price != null ? String(sale.price) : "",
    paymentStatus: sale.paymentStatus ?? "",
    commission: sale.commission != null ? String(sale.commission) : "",
    email: sale.email ?? "",
    notes: sale.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const r = await apiCall(`/group-tickets/${groupId}/sales/${sale.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, seatsSold: Number(form.seatsSold), price: form.price !== "" ? Math.round(Number(form.price)) : null, commission: form.commission !== "" ? Math.round(Number(form.commission)) : null }),
      });
      if (!r.ok) throw new Error(await r.text());
      onSaved(); onClose();
    } catch (e: any) { setError(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Edito Shitjen</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">✈ Aeroporti i Nisjes</label>
              <input value={form.departureAirport} onChange={e => set("departureAirport", e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm font-semibold uppercase" placeholder="p.sh. BLQ" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">🛬 Aeroporti i Mbërritjes</label>
              <input value={form.arrivalAirport} onChange={e => set("arrivalAirport", e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm font-semibold uppercase" placeholder="p.sh. TIA" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">PNR i Ri</label><input value={form.pnrNew} onChange={e => set("pnrNew", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Vende të Shitura</label><input type="number" value={form.seatsSold} onChange={e => set("seatsSold", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" min={1} /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Emri i Pasagjerit</label><input value={form.passengerName} onChange={e => set("passengerName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Statusi</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="WAITING">Pritje</option>
                <option value="CONFIRMED">Konfirmuar</option>
                <option value="TICKETED">Ticketed</option>
                <option value="CANCELLED">Anuluar</option>
              </select>
            </div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Operatori</label><input value={form.operatorName} onChange={e => set("operatorName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Data Konfirmimit</label><input type="date" value={form.confirmedDate} onChange={e => set("confirmedDate", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Data Shitjes</label><input type="date" value={form.shiturDate} onChange={e => set("shiturDate", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Çmimi (€)</label><input type="number" value={form.price} onChange={e => set("price", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Komisioni (€)</label><input type="number" value={form.commission} onChange={e => set("commission", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Statusi Pagesës</label><input value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Email</label><input value={form.email} onChange={e => set("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" type="email" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Shënime</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2} /></div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Anulo</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Duke ruajtur..." : "Ruaj"}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Modal ──────────────────────────────────────────────────────────────
const EMPTY_GROUP = {
  pnrOriginal: "", departure: "", destination: "", flightDate: "", flightTime: "",
  returnInfo: "", totalSeats: 0, pricePerSeat: "", color: "ORANGE", status: "",
  airline: "", dateFlexBack: 14, dateFlexForward: 30, notes: "", options: "",
  alternatives: [] as { destination: string; notes: string }[],
};

function GroupModal({ group, onClose, onSaved }: { group?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(
    group
      ? { ...EMPTY_GROUP, ...group, pricePerSeat: group.pricePerSeat != null ? String(group.pricePerSeat) : "", alternatives: (group.alternatives ?? []).map((a: any) => ({ destination: a.destination, notes: a.notes ?? "" })) }
      : { ...EMPTY_GROUP }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));
  const addAlt = () => setForm((f: any) => ({ ...f, alternatives: [...f.alternatives, { destination: "", notes: "" }] }));
  const removeAlt = (i: number) => setForm((f: any) => ({ ...f, alternatives: f.alternatives.filter((_: any, idx: number) => idx !== i) }));
  const setAlt = (i: number, key: string, val: string) => setForm((f: any) => ({ ...f, alternatives: f.alternatives.map((a: any, idx: number) => idx === i ? { ...a, [key]: val } : a) }));

  const save = async () => {
    if (!form.pnrOriginal || !form.departure || !form.destination || !form.flightDate) {
      setError("Fushat e detyrueshme: PNR, Nisja, Destinacioni, Data");
      return;
    }
    setSaving(true); setError("");
    try {
    const body = { ...form, totalSeats: Number(form.totalSeats), pricePerSeat: form.pricePerSeat !== "" ? Math.round(Number(form.pricePerSeat)) : null, dateFlexBack: Number(form.dateFlexBack), dateFlexForward: Number(form.dateFlexForward) };
      const r = group
        ? await apiCall(`/group-tickets/${group.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await apiCall("/group-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      onSaved(); onClose();
    } catch (e: any) { setError(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{group ? "Edito Grupin" : "Shto Grup të Ri"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">PNR Original *</label><input value={form.pnrOriginal} onChange={e => set("pnrOriginal", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="ABC123" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Kompania Ajrore</label><input value={form.airline} onChange={e => set("airline", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="WIZ, FZA..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Nisja (DEPA) *</label><input value={form.departure} onChange={e => set("departure", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm uppercase" placeholder="TIA" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Destinacioni kryesor (DEST) *</label><input value={form.destination} onChange={e => set("destination", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm uppercase" placeholder="FCO" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Data e Fluturimit *</label><input type="date" value={form.flightDate} onChange={e => set("flightDate", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Ora</label><input value={form.flightTime} onChange={e => set("flightTime", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="14:30" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Kthimi</label><input value={form.returnInfo} onChange={e => set("returnInfo", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Vende Totale</label><input type="number" value={form.totalSeats} onChange={e => set("totalSeats", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" min={0} /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Neto Total Grup (€)</label><input type="number" value={form.pricePerSeat} onChange={e => set("pricePerSeat", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" step="1" /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Statusi</label><select value={form.status} onChange={e => set("status", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">— Bosh</option><option value="HOLD">HOLD</option><option value="WAITING">WAITING</option><option value="CONFIRMED">CONFIRMED</option><option value="FLEX">FLEX</option><option value="CHANGE">CHANGE (±ditë flex)</option><option value="CANCELED">CANCELED</option></select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Ngjyra</label><select value={form.color} onChange={e => set("color", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="ORANGE">🟠 Orange</option><option value="GREEN">🟢 Green</option><option value="RED">🔴 Red</option><option value="BLUE">🔵 Blue</option></select></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Flex mbrapa (ditë)</label><input type="number" value={form.dateFlexBack} onChange={e => set("dateFlexBack", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" min={0} /></div>
            <div><label className="text-xs font-medium text-gray-500 mb-1 block">Flex para (ditë)</label><input type="number" value={form.dateFlexForward} onChange={e => set("dateFlexForward", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" min={0} /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-500 mb-1 block">Shënime</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2} /></div>

          {/* Alternatives */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="text-xs font-medium text-gray-500">✈ Aeroportet Alternative të Nisjes</label>
                <p className="text-[10px] text-gray-400 mt-0.5">P.sh. për BLQ: MXP, BGY, PSA, TSF — aeroportet pranë qytetit të nisjes</p>
              </div>
              <button onClick={addAlt} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"><Plus className="h-3 w-3" /> Shto</button>
            </div>
            <div className="space-y-2">
              {form.alternatives.map((alt: any, i: number) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={alt.destination} onChange={e => setAlt(i, "destination", e.target.value.toUpperCase())} className="w-28 border rounded-lg px-3 py-1.5 text-sm uppercase font-semibold" placeholder="MXP" />
                  <input value={alt.notes} onChange={e => setAlt(i, "notes", e.target.value)} className="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder="Shënime opsionale..." />
                  <button onClick={() => removeAlt(i)} className="p-1.5 text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {form.alternatives.length === 0 && <p className="text-xs text-gray-400 italic">Shto aeroportet alternative të nisjes — do të shfaqen si dropdown kur regjistrohet shitja.</p>}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Anulo</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Duke ruajtur..." : "Ruaj"}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Excel Modal ───────────────────────────────────────────────────────
const SYSTEM_FIELDS = [
  { key: "pnrOriginal", label: "PNR Original" },
  { key: "purchaseDate", label: "Dt Blerje" },
  { key: "departure", label: "Nisja (DEPA)" },
  { key: "destination", label: "Destinacioni (DEST)" },
  { key: "flightDate", label: "Data e Fluturimit" },
  { key: "flightTime", label: "Ora (nisja)" },
  { key: "returnFlightDate", label: "Data Kthimit" },
  { key: "returnFlightTime", label: "Ora (kthim)" },
  { key: "totalSeats", label: "Vende Totale" },
  { key: "pricePerSeat", label: "Neto Total (€)" },
  { key: "status", label: "Statusi" },
  { key: "airline", label: "Kompania Ajrore" },
  { key: "country", label: "Shteti" },
  { key: "installment1", label: "K1 (€)" },
  { key: "installment2", label: "K2 (€)" },
  { key: "color", label: "Ngjyra" },
  { key: "notes", label: "Shënime" },
];

const ALL_LIST_COLS = ["dtBlerje","pnr","dataFlex","k1","k2","k3","detyrim","netoP","kompania"] as const;
type ListCol = typeof ALL_LIST_COLS[number];

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (f: File) => {
    setFile(f); setLoading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await apiCall("/group-tickets/import", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setHeaders(data.headers); setPreview(data.preview);
      const autoMap: Record<string, string> = {};
      data.systemFields.forEach((sf: any) => {
        const matched = data.headers.find((h: string) => h.toLowerCase().includes(sf.key.toLowerCase()) || h.toLowerCase().includes(sf.label.toLowerCase().split(" ")[0].toLowerCase()));
        if (matched) autoMap[sf.key] = matched;
      });
      setMapping(autoMap); setStep("map");
    } catch (e: any) { setError(e.message ?? "Gabim gjatë leximit"); }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("mapping", JSON.stringify(mapping));
      const r = await apiCall("/group-tickets/import/confirm", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setResult(data); setStep("result"); onDone();
    } catch (e: any) { setError(e.message ?? "Gabim"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2"><Upload className="h-5 w-5" /> Import nga Excel</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4 flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div onClick={() => fileRef.current?.click()} className="w-full max-w-md border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">Kliko ose tërhiq skedarin Excel këtu</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx, .xls</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
              {loading && <p className="text-sm text-blue-600">Duke lexuar skedarin...</p>}
            </div>
          )}
          {step === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Lidhi kolonat e Excel-it me fushat e sistemit:</p>
              <div className="grid grid-cols-2 gap-3">
                {SYSTEM_FIELDS.map(sf => (
                  <div key={sf.key}>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">{sf.label}</label>
                    <select value={mapping[sf.key] ?? ""} onChange={e => setMapping(m => ({ ...m, [sf.key]: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— mos lidh —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {preview.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Preview (5 rreshtat e parë):</p>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50"><tr>{headers.map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>)}</tr></thead>
                      <tbody>{preview.map((row, i) => (<tr key={i} className="border-t">{headers.map(h => <td key={h} className="px-2 py-1.5 text-gray-600">{String(row[h] ?? "")}</td>)}</tr>))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {step === "result" && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="h-8 w-8 text-green-600" /></div>
              <div>
                <p className="text-xl font-bold text-green-700">Import i Suksesshëm!</p>
                <p className="text-sm text-gray-500 mt-1">{result.imported} nga {result.total} grupe u importuan.</p>
              </div>
              {result.errors.length > 0 && (
                <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-left">
                  <p className="text-xs font-medium text-yellow-700 mb-1">Gabime ({result.errors.length}):</p>
                  <ul className="text-xs text-yellow-600 space-y-0.5">{result.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          {step === "map" && (<><Button variant="outline" onClick={() => setStep("upload")}>Prapa</Button><Button onClick={handleConfirm} disabled={loading}>{loading ? "Duke importuar..." : "Konfirmo Importin"}</Button></>)}
          {(step === "upload" || step === "result") && (<Button variant={step === "result" ? "default" : "outline"} onClick={onClose}>{step === "result" ? "Mbyll" : "Anulo"}</Button>)}
        </div>
      </div>
    </div>
  );
}

// ─── Expanded Sales Panel ─────────────────────────────────────────────────────
// ─── Spreadsheet Row ──────────────────────────────────────────────────────────
type SaleRowData = {
  id?: number;
  passengerName: string; status: string; price: string; commission: string;
  operatorName: string; pnrNew: string; confirmedDate: string; returnConfirmedDate: string; shiturDate: string;
  departureAirport: string; arrivalAirport: string; paymentStatus: string;
  email: string; notes: string; seatsSold?: number;
  bookingRef?: string;
};

function emptyRowData(ticket: any): SaleRowData {
  return {
    id: undefined, passengerName: "", status: "WAITING",
    price: "",
    commission: "", operatorName: "", pnrNew: "",
    confirmedDate: ticket.flightDate ?? "", returnConfirmedDate: ticket.returnFlightDate ?? "", shiturDate: "",
    departureAirport: ticket.departure ?? "", arrivalAirport: ticket.destination ?? "",
    paymentStatus: "", email: "", notes: "",
    bookingRef: "",
  };
}

function saleToRowData(sale: any): SaleRowData {
  return {
    id: sale.id,
    passengerName: sale.passengerName ?? "", status: sale.status ?? "WAITING",
    price: sale.price != null ? String(sale.price) : "",
    commission: sale.commission != null ? String(sale.commission) : "",
    operatorName: sale.operatorName ?? "", pnrNew: sale.pnrNew ?? "",
    confirmedDate: sale.confirmedDate ?? "", returnConfirmedDate: sale.returnConfirmedDate ?? "", shiturDate: sale.shiturDate ?? "",
    departureAirport: sale.departureAirport ?? "", arrivalAirport: sale.arrivalAirport ?? "",
    paymentStatus: sale.paymentStatus ?? "", email: sale.email ?? "", notes: sale.notes ?? "",
    seatsSold: sale.seatsSold ?? 1,
    bookingRef: sale.bookingRef ?? "",
  };
}

const INPUT_CLS = "w-full border border-transparent hover:border-gray-200 focus:border-blue-400 rounded px-1.5 py-1 text-xs bg-transparent focus:bg-white outline-none transition-colors";
const SEL_CLS   = "w-full border border-transparent hover:border-gray-200 focus:border-blue-400 rounded px-1 py-1 text-xs bg-transparent focus:bg-white outline-none transition-colors cursor-pointer";

// ─── Flex Date Picker ─────────────────────────────────────────────────────────
function FlexDatePicker({
  value, onChange, flightDate, flexBack, flexForward, isChange,
}: {
  value: string; onChange: (v: string) => void;
  flightDate: string; flexBack: number; flexForward: number; isChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const flight  = flightDate && isValid(parseISO(flightDate)) ? parseISO(flightDate) : null;
  const minDate = flight && isChange ? subDays(flight, flexBack)    : undefined;
  const maxDate = flight && isChange ? addDays(flight, flexForward)  : undefined;
  const defaultMonth = minDate ?? flight ?? new Date();

  const selected  = value && isValid(parseISO(value)) ? parseISO(value) : undefined;
  const displayTxt = selected ? format(selected, "dd/MM/yy") : "";

  const handleSelect = (date: Date | undefined) => {
    if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); }
  };

  const disabled = isChange && minDate && maxDate
    ? [{ before: minDate }, { after: maxDate }]
    : [];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full border border-transparent hover:border-gray-200 focus:border-blue-400 rounded px-1.5 py-1 text-xs bg-transparent hover:bg-white focus:bg-white outline-none transition-colors text-left"
      >
        <CalendarDays className="h-3 w-3 text-gray-400 shrink-0" />
        <span className={displayTxt ? "text-gray-800" : "text-gray-300"}>{displayTxt || "Data"}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-1" style={{ minWidth: 280 }}>
          {isChange && minDate && maxDate && (
            <style>{`
              .rdp-flex_valid button:not([disabled]) {
                background-color: #dcfce7 !important;
                color: #166534 !important;
                font-weight: 700 !important;
                border-radius: 4px;
              }
            `}</style>
          )}
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={defaultMonth}
            disabled={disabled.length > 0 ? disabled : undefined}
            modifiers={isChange && minDate && maxDate ? { valid: { from: minDate, to: maxDate } } : undefined}
            modifiersClassNames={isChange && minDate && maxDate ? { valid: "rdp-flex_valid" } : undefined}
          />
          {isChange && minDate && maxDate && (
            <div className="px-3 pb-2 text-[10px] text-gray-400 text-center border-t pt-2">
              Datat e vlefshme: <span className="font-semibold text-green-700">{format(minDate, "dd/MM/yy")} → {format(maxDate, "dd/MM/yy")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// COMMON fields to copy when adding a passenger (name/PNR are unique per person)
const COPY_FIELDS: (keyof SaleRowData)[] = [
  "status", "price", "operatorName", "confirmedDate",
  "departureAirport", "arrivalAirport", "paymentStatus",
];

function SaleSpreadsheetRow({
  rowNum, initial, groupId, netPrice, togetherness,
  flightDate, flexBack, flexForward, groupStatus, returnFlightDate,
  fillSignal, clearSignal, departureAlts, arrivalAlts,
  isGroupLeader, groupLeaderPnr,
  onSaved, onDeleted, onFormChange, onAddPassenger, onRemovePassenger,
}: {
  rowNum: number; initial: SaleRowData; groupId: number;
  netPrice: number | null; togetherness: number;
  flightDate: string; flexBack: number; flexForward: number; groupStatus: string;
  returnFlightDate?: string;
  fillSignal?: { data: SaleRowData; ts: number };
  clearSignal?: number;
  departureAlts?: string[];
  arrivalAlts?: string[];
  isGroupLeader: boolean;
  groupLeaderPnr: string;
  onSaved: () => void; onDeleted: () => void;
  onFormChange: (f: SaleRowData) => void;
  onAddPassenger: (currentForm: SaleRowData) => void;
  onRemovePassenger: () => void;
}) {
  const [form, setForm] = useState<SaleRowData>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [depFocused, setDepFocused] = useState(false);
  const [arrFocused, setArrFocused] = useState(false);

  // sync when server refreshes (e.g. after save → row gets an id)
  const prevId = useRef(initial.id);
  if (initial.id !== prevId.current) {
    prevId.current = initial.id;
    setForm(initial);
    setDirty(false);
  }

  // fill signal from parent (copy from another row)
  const prevFillTs = useRef(0);
  if (fillSignal && !form.id && fillSignal.ts > prevFillTs.current) {
    prevFillTs.current = fillSignal.ts;
    const d = fillSignal.data;
    setForm(f => {
      const next = { ...f };
      COPY_FIELDS.forEach(k => { (next as any)[k] = (d as any)[k]; });
      return next;
    });
    setDirty(true);
  }

  // clear signal from parent (remove passenger — reset unsaved row to empty)
  const prevClearTs = useRef(0);
  if (clearSignal && !form.id && clearSignal > prevClearTs.current) {
    prevClearTs.current = clearSignal;
    setForm(initial);
    setDirty(false);
  }

  const set = (k: keyof SaleRowData, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
    setDirty(true);
    onFormChange(next);
  };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const priceVal = form.price !== "" ? Number(form.price) : null;
      const commVal  = priceVal != null && netPrice != null ? priceVal - netPrice : null;
      // non-leader rows in a group use the group leader's PNR
      const effectivePnr = isGroupLeader ? form.pnrNew : groupLeaderPnr;
      const body = { ...form, pnrNew: effectivePnr, seatsSold: 1, price: priceVal, commission: commVal };
      const url = form.id
        ? `/group-tickets/${groupId}/sales/${form.id}`
        : `/group-tickets/${groupId}/sales`;
      const r = await apiCall(url, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setDirty(false);
      onSaved();
    } catch (e: any) { setErr(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!form.id) { setForm(initial); setDirty(false); return; }
    setSaving(true);
    try {
      const r = await apiCall(`/group-tickets/${groupId}/sales/${form.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      onDeleted();
    } catch (e: any) { setErr(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  const priceNum  = parseFloat(form.price) || 0;
  const komisioni = priceNum > 0 && netPrice != null ? priceNum - netPrice : null;

  const statusBg: Record<string, string> = {
    WAITING: "", CONFIRMED: "bg-blue-50/40", TICKETED: "bg-green-50/40", CANCELLED: "bg-red-50/40 opacity-60",
  };

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors group ${statusBg[form.status] ?? ""}`}>
      {/* # */}
      <td className="px-1 py-1 text-center select-none w-7 shrink-0">
        <span className="text-[10px] text-gray-400 font-mono">{rowNum}</span>
      </td>
      {/* Persona bashkë */}
      <td className="px-1 py-0.5 w-[46px] text-center">
        {togetherness > 1
          ? <span className="inline-flex items-center justify-center gap-0.5 text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
              <Users className="h-2.5 w-2.5" />{togetherness}
            </span>
          : <span className="text-gray-200 text-[10px]">1</span>}
      </td>
      {/* Emri */}
      <td className="px-1 py-0.5 min-w-[150px]">
        <input value={form.passengerName} onChange={e => set("passengerName", e.target.value)}
          placeholder="Emri Mbiemri" className={INPUT_CLS} />
      </td>
      {/* Referenca (booking ref) — klikohet për të hapur rezervimin inline */}
      <td className="px-1 py-0.5 w-[96px]">
        {form.bookingRef ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-booking-preview", { detail: { bookingRef: form.bookingRef } }))}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200 hover:underline font-mono text-[10px] font-bold border border-indigo-200 cursor-pointer transition-colors"
            title="Hap rezervimin"
          >
            {form.bookingRef}
          </button>
        ) : (
          <span className="text-gray-300 text-[10px]">—</span>
        )}
      </td>
      {/* Statusi */}
      <td className="px-1 py-0.5 w-[105px]">
        <select value={form.status} onChange={e => set("status", e.target.value)} className={SEL_CLS}>
          <option value="WAITING">Pritje</option>
          <option value="CONFIRMED">Konfirmuar</option>
          <option value="TICKETED">Ticketed</option>
          <option value="CANCELLED">Anuluar</option>
        </select>
      </td>
      {/* Shitje */}
      <td className="px-1 py-0.5 w-[72px]">
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-gray-400 shrink-0">€</span>
          <input type="number" value={form.price} onChange={e => set("price", e.target.value)}
            placeholder="0" className={INPUT_CLS + " text-right"} step="1" />
        </div>
      </td>
      {/* Komisioni (auto) */}
      <td className="px-2 py-0.5 w-[78px] text-right">
        {komisioni !== null
          ? <span className={`text-[11px] font-bold ${komisioni >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              €{fmtM(komisioni)}
            </span>
          : <span className="text-gray-200 text-[10px]">—</span>}
      </td>
      {/* Operatori */}
      <td className="px-1 py-0.5 min-w-[90px]">
        <input value={form.operatorName} onChange={e => set("operatorName", e.target.value)}
          placeholder="Agjencia" className={INPUT_CLS} />
      </td>
      {/* PNR */}
      <td className="px-1 py-0.5 w-[84px]">
        {isGroupLeader ? (
          <input value={form.pnrNew} onChange={e => set("pnrNew", e.target.value.toUpperCase())}
            placeholder="PNR" className={INPUT_CLS + " font-mono font-bold tracking-wider"} />
        ) : (
          <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${groupLeaderPnr ? "text-violet-700 bg-violet-50 border border-violet-200" : "text-gray-300"}`}>
            {groupLeaderPnr || "—"}
          </span>
        )}
      </td>
      {/* Data */}
      <td className="px-1 py-0.5 w-[106px]">
        <FlexDatePicker
          value={form.confirmedDate}
          onChange={v => set("confirmedDate", v)}
          flightDate={flightDate}
          flexBack={flexBack}
          flexForward={flexForward}
          isChange={groupStatus === "CHANGE"}
        />
        {returnFlightDate && (
          <div className="mt-0.5 border-t border-dashed border-rose-200 pt-0.5">
            <FlexDatePicker
              value={form.returnConfirmedDate}
              onChange={v => set("returnConfirmedDate", v)}
              flightDate={returnFlightDate}
              flexBack={flexBack}
              flexForward={flexForward}
              isChange={groupStatus === "CHANGE"}
            />
          </div>
        )}
      </td>
      {/* Nisja */}
      <td className="px-1 py-0.5 w-[54px]">
        <div className="relative">
          <input value={form.departureAirport} onChange={e => set("departureAirport", e.target.value.toUpperCase())}
            onFocus={() => setDepFocused(true)} onBlur={() => setTimeout(() => setDepFocused(false), 150)}
            placeholder="DEP" maxLength={4} className={INPUT_CLS + " font-bold text-indigo-600 uppercase text-center"} />
          {depFocused && departureAlts && departureAlts.length > 0 && (
            <div className="absolute z-20 top-full left-0 mt-0.5 bg-white border border-indigo-200 rounded-lg shadow-lg p-1.5 flex flex-wrap gap-1" style={{ minWidth: 120 }}>
              {departureAlts.map(alt => (
                <button key={alt} onMouseDown={() => set("departureAirport", alt)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${form.departureAirport === alt ? "bg-indigo-600 text-white border-indigo-600" : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"}`}>
                  {alt}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      {/* Mbërritja */}
      <td className="px-1 py-0.5 w-[54px]">
        <div className="relative">
          <input value={form.arrivalAirport} onChange={e => set("arrivalAirport", e.target.value.toUpperCase())}
            onFocus={() => setArrFocused(true)} onBlur={() => setTimeout(() => setArrFocused(false), 150)}
            placeholder="ARR" maxLength={4} className={INPUT_CLS + " font-bold text-emerald-600 uppercase text-center"} />
          {arrFocused && arrivalAlts && arrivalAlts.length > 0 && (
            <div className="absolute z-20 top-full left-0 mt-0.5 bg-white border border-emerald-200 rounded-lg shadow-lg p-1.5 flex flex-wrap gap-1" style={{ minWidth: 120 }}>
              {arrivalAlts.map(alt => (
                <button key={alt} onMouseDown={() => set("arrivalAirport", alt)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${form.arrivalAirport === alt ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}>
                  {alt}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      {/* Pagesa */}
      <td className="px-1 py-0.5 w-[86px]">
        <input value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}
          placeholder="CONFIRMED" className={INPUT_CLS} />
      </td>
      {/* Veprime */}
      <td className="px-1 py-0.5 w-[116px]">
        <div className="flex items-center gap-0.5">
          {err && <span className="text-red-500 text-[10px]" title={err}>!</span>}
          {/* +/- Pasagjer */}
          <div className="flex items-center rounded overflow-hidden border border-violet-200 shrink-0" title="Shto / Hiq pasagjer">
            <button
              onClick={() => onAddPassenger(form)}
              className="flex items-center justify-center px-1.5 py-0.5 text-violet-600 bg-violet-50 hover:bg-violet-200 transition-colors border-r border-violet-200"
              title="Shto pasagjer"
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="px-1 text-[10px] font-bold text-violet-700 bg-white select-none tabular-nums min-w-[18px] text-center">
              {togetherness}
            </span>
            <button
              onClick={onRemovePassenger}
              className="flex items-center justify-center px-1.5 py-0.5 text-violet-600 bg-violet-50 hover:bg-violet-200 transition-colors border-l border-violet-200"
              title="Hiq pasagjer"
            >
              <Minus className="h-3 w-3" />
            </button>
          </div>
          {/* Save */}
          <button
            onClick={save} disabled={saving || !dirty}
            className={`p-1 rounded transition-colors ${dirty ? "text-blue-500 hover:bg-blue-50" : "text-gray-200 cursor-default"}`}
            title="Ruaj"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          {/* Delete */}
          <button
            onClick={del} disabled={saving}
            className="p-1 rounded text-red-300 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            title={form.id ? "Fshi shitjen" : "Pastro"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Spreadsheet Panel ────────────────────────────────────────────────────────
// ─── Komente Thread (immutable + reply) ──────────────────────────────────
function GroupCommentsThread({ ticket, onChanged }: { ticket: any; onChanged: () => void }) {
  const comments: Array<{ id: string; text: string; author?: string; createdAt: string; replyTo?: string | null }> =
    Array.isArray(ticket.comments) ? ticket.comments : [];

  const [newText, setNewText] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [error, setError] = useState("");

  const submit = async (text: string, parent: string | null) => {
    const r = await apiCall(`/group-tickets/${ticket.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, replyTo: parent }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error ?? "Gabim gjatë ruajtjes së komentit");
    }
  };

  const handleSaveNew = async () => {
    const t = newText.trim();
    if (!t) return;
    setError(""); setSavingNew(true);
    try {
      await submit(t, null);
      setNewText("");
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setSavingNew(false); }
  };

  const handleSaveReply = async (parentId: string) => {
    const t = replyText.trim();
    if (!t) return;
    setError(""); setSavingReply(true);
    try {
      await submit(t, parentId);
      setReplyText(""); setReplyTo(null);
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setSavingReply(false); }
  };

  // Build tree: root comments + their replies (one level)
  const roots = comments.filter(c => !c.replyTo);
  const repliesOf = (id: string) => comments.filter(c => c.replyTo === id);

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return fmtDateTimeAmPm(d, { dateOptions: { day: "2-digit", month: "2-digit", year: "2-digit" } });
    } catch { return iso; }
  };

  const CommentBubble = ({ c, isReply }: { c: typeof comments[number]; isReply?: boolean }) => (
    <div className={`group rounded-lg border ${isReply ? "bg-white border-gray-200" : "bg-amber-50/60 border-amber-200"} px-3 py-2`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
            {(c.author ?? "?").charAt(0).toUpperCase()}
          </span>
          <span className="font-semibold text-gray-700">{c.author ?? "—"}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-400">{fmtDate(c.createdAt)}</span>
          <span className="text-gray-300 ml-1">· i ruajtur (s'mund të ndryshohet)</span>
        </div>
        {!isReply && (
          <button
            onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(""); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-50"
            title="Përgjigju"
          >
            <Plus className="h-3 w-3" /> Reply
          </button>
        )}
      </div>
      <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{c.text}</div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-amber-600" /> Komente për grupin
          <span className="ml-1 text-gray-400 normal-case font-medium">({comments.length})</span>
        </h4>
      </div>

      {error && <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}

      {/* Thread */}
      {roots.length === 0 ? (
        <div className="text-xs text-gray-400 italic py-2">Nuk ka komente për këtë grup. Shto të parin më poshtë.</div>
      ) : (
        <div className="space-y-2 mb-3">
          {roots.map(r => (
            <div key={r.id} className="space-y-1.5">
              <CommentBubble c={r} />
              {repliesOf(r.id).length > 0 && (
                <div className="ml-6 space-y-1.5 border-l-2 border-amber-100 pl-3">
                  {repliesOf(r.id).map(rep => <CommentBubble key={rep.id} c={rep} isReply />)}
                </div>
              )}
              {replyTo === r.id && (
                <div className="ml-6 pl-3 border-l-2 border-indigo-200">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Shkruaj përgjigjen…"
                    className="w-full border border-indigo-200 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setReplyTo(null); setReplyText(""); }} disabled={savingReply}>Anulo</Button>
                    <Button type="button" size="sm" onClick={() => handleSaveReply(r.id)} disabled={savingReply || !replyText.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      {savingReply ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Ruaj përgjigjen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment input */}
      <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-2">
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          rows={2}
          placeholder="Shkruaj një koment të ri…"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Pas ruajtjes, komenti nuk mund të ndryshohet apo fshihet — vetëm përgjigje.</span>
          <Button type="button" size="sm" onClick={handleSaveNew} disabled={savingNew || !newText.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
            {savingNew ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Ruaj komentin
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExpandedPanel({ ticket, onEditSale: _onEditSale, onDeleteSale: _onDeleteSale }: { ticket: any; onEditSale: (sale: any) => void; onDeleteSale: (saleId: number) => void }) {
  const qc = useQueryClient();
  const refetch = () => qc.invalidateQueries({ queryKey: ["group-tickets"] });

  const totalSeats: number   = ticket.totalSeats ?? 0;
  const existingSales: any[] = ticket.sales ?? [];
  // pricePerSeat = total group price; per-person = total / seats
  const netTotal: number | null      = ticket.pricePerSeat != null ? Number(ticket.pricePerSeat) : null;
  const netPrice: number | null      = netTotal != null && totalSeats > 0 ? Math.round(netTotal / totalSeats) : null;
  const flightDate       = ticket.flightDate ?? "";
  const returnFlightDate = ticket.returnFlightDate ?? "";
  const flexBack         = Number(ticket.dateFlexBack  ?? 14);
  const flexForward      = Number(ticket.dateFlexForward ?? 30);
  const groupStatus      = ticket.status ?? "open";

  // Global airport alternatives (same query as ManagementTab — uses cached data)
  const { data: _airportAlts = [] } = useQuery<any[]>({
    queryKey: ["airport-alternatives"],
    queryFn: async () => { const r = await apiCall("/airport-alternatives"); return r.ok ? r.json() : []; },
    staleTime: 5 * 60 * 1000,
  });
  const alternatives: string[] = useMemo(() => {
    const result: string[] = [];
    for (const row of _airportAlts as any[]) {
      if (row.mainAirport === ticket.destination && row.alternativeAirport !== ticket.destination) {
        if (!result.includes(row.alternativeAirport)) result.push(row.alternativeAirport);
      }
    }
    return result;
  }, [_airportAlts, ticket.destination]);

  const initialRows: SaleRowData[] = useMemo(() => {
    const filled = existingSales.map(saleToRowData);
    const empty = Array.from({ length: Math.max(0, totalSeats - filled.length) }, () => emptyRowData(ticket));
    return [...filled, ...empty];
  }, [existingSales, totalSeats, ticket.id]);

  // Current live form state for every row (tracks unsaved edits)
  const [currentForms, setCurrentForms] = useState<Record<number, SaleRowData>>({});
  const getForm = (i: number) => currentForms[i] ?? initialRows[i];

  // Per-row fill signals
  const [fills, setFills] = useState<Record<number, { data: SaleRowData; ts: number }>>({});

  // Per-row clear signals (to reset an unsaved row to empty)
  const [clears, setClears] = useState<Record<number, number>>({});

  // Group leader helpers — the leader is the row with the smallest index in the group
  const isGroupLeaderOf = (i: number): boolean => {
    const gid = groups[i];
    if (!gid) return true; // solo row = its own leader
    const members = Object.entries(groups).filter(([, g]) => g === gid).map(([idx]) => Number(idx));
    return Math.min(...members) === i;
  };

  const groupLeaderPnrOf = (i: number): string => {
    const gid = groups[i];
    if (!gid) return ""; // solo row — isGroupLeader=true, this value unused
    const members = Object.entries(groups).filter(([, g]) => g === gid).map(([idx]) => Number(idx));
    const leaderIdx = Math.min(...members);
    return currentForms[leaderIdx]?.pnrNew ?? initialRows[leaderIdx]?.pnrNew ?? "";
  };

  // Departure alternatives (for the group's departure airport)
  const departureAlts: string[] = useMemo(() => {
    const result: string[] = [];
    for (const row of _airportAlts as any[]) {
      if (row.mainAirport === ticket.departure && row.alternativeAirport !== ticket.departure) {
        if (!result.includes(row.alternativeAirport)) result.push(row.alternativeAirport);
      }
    }
    return result;
  }, [_airportAlts, ticket.departure]);

  // Arrival alternatives include the main destination + its alternatives
  const arrivalAlts: string[] = useMemo(() => {
    return [ticket.destination, ...alternatives].filter(Boolean);
  }, [ticket.destination, alternatives]);

  // Group assignments: row index → group id (same id = same booking group)
  const [groups, setGroups] = useState<Record<number, number>>({});
  const nextGid = useRef(1);

  // Auto-grup nga bookingRef te sales-et e ruajtura — që togethernessOf të tregojë N (jo 1)
  useEffect(() => {
    const byRef: Record<string, number[]> = {};
    initialRows.forEach((r, i) => {
      const ref = (r.bookingRef ?? "").trim();
      if (!ref) return;
      if (!byRef[ref]) byRef[ref] = [];
      byRef[ref].push(i);
    });
    const next: Record<number, number> = {};
    let gidCounter = nextGid.current;
    for (const ref in byRef) {
      const idxs = byRef[ref];
      if (idxs.length <= 1) continue;
      const gid = gidCounter++;
      for (const i of idxs) next[i] = gid;
    }
    nextGid.current = gidCounter;
    setGroups(prev => ({ ...next, ...prev }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows]);

  // "Shto Pasagjer" handler
  const handleAddPassenger = (rowIdx: number, form: SaleRowData) => {
    // find the next TRULY empty row: no DB id, no passenger name, and NOT already part of any group
    const nextEmpty = initialRows.findIndex((r, i) =>
      i > rowIdx &&
      !r.id &&
      !(currentForms[i]?.passengerName) &&
      !groups[i]  // crucial: don't touch rows that belong to another group
    );
    if (nextEmpty === -1) return; // no free slots

    // assign group ids
    setGroups(g => {
      const gid = g[rowIdx] ?? nextGid.current++;
      return { ...g, [rowIdx]: gid, [nextEmpty]: gid };
    });

    // send fill signal to that specific row
    setFills(f => ({ ...f, [nextEmpty]: { data: form, ts: Date.now() } }));
  };

  // "Hiq Pasagjer" handler — removes the LAST unsaved row in the same group
  const handleRemovePassenger = (rowIdx: number) => {
    const gid = groups[rowIdx];
    if (!gid) return; // not in a group

    // all indices in this group, sorted descending
    const members = Object.entries(groups)
      .filter(([, g]) => g === gid)
      .map(([i]) => Number(i))
      .sort((a, b) => b - a);

    if (members.length <= 1) return; // solo, nothing to remove

    // find the last unsaved member (no DB id)
    const lastUnsaved = members.find(i => !initialRows[i]?.id);
    if (lastUnsaved === undefined) return;

    // remove from group map
    setGroups(g => {
      const next = { ...g };
      delete next[lastUnsaved];
      // if only 1 left in group, ungroup that one too
      const remaining = Object.entries(next).filter(([, v]) => v === gid);
      if (remaining.length === 1) delete next[Number(remaining[0][0])];
      return next;
    });

    // send clear signal to that row
    setClears(c => ({ ...c, [lastUnsaved]: Date.now() }));
  };

  // Count togetherness for each row
  const togethernessOf = (i: number): number => {
    const gid = groups[i];
    if (!gid) return 1;
    return Object.values(groups).filter(g => g === gid).length;
  };

  const sold = existingSales.length;
  const remaining = Math.max(0, totalSeats - sold);

  return (
    <div className="bg-gray-50 border-t border-dashed border-gray-200">
      {/* header bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {ticket.departure} → {ticket.destination}
          {ticket.flightTime && <span className="text-gray-400 ml-1">({fmtAmPm(ticket.flightTime)})</span>}
        </span>
        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
          {sold} / {totalSeats} shitje
        </span>
        {remaining > 0 && (
          <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 border border-orange-100 rounded px-2 py-0.5">
            {remaining} vende lira
          </span>
        )}
        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="flex items-center gap-1 text-[10px]">
            <MapPin className="h-3 w-3 text-indigo-400 shrink-0" />
            <span className="text-gray-400">Alternativa:</span>
            {alternatives.map(alt => (
              <span key={alt} className="font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">{alt}</span>
            ))}
          </div>
        )}
        {/* CHANGE flex range */}
        {groupStatus === "CHANGE" && flightDate && (
          <div className="flex flex-col items-end gap-0.5 text-[10px] ml-auto">
            <div className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-green-500" />
              <span className="text-gray-400">Datat flex (nisja):</span>
              <span className="font-bold text-green-700">
                {format(subDays(parseISO(flightDate), flexBack), "dd/MM/yy")} → {format(addDays(parseISO(flightDate), flexForward), "dd/MM/yy")}
              </span>
            </div>
            {returnFlightDate && isValid(parseISO(returnFlightDate)) && (
              <div className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 text-rose-400" />
                <span className="text-gray-400">Datat flex (kthim):</span>
                <span className="font-bold text-rose-600">
                  {format(subDays(parseISO(returnFlightDate), flexBack), "dd/MM/yy")} → {format(addDays(parseISO(returnFlightDate), flexForward), "dd/MM/yy")}
                </span>
              </div>
            )}
          </div>
        )}
        {netTotal != null && (
          <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1">
            <span>Neto grup:</span>
            <span className="font-bold text-gray-700">€{fmtM(netTotal)}</span>
            {netPrice != null && totalSeats > 0 && (
              <span className="text-indigo-500 font-semibold">(€{fmtM(netPrice)}/p)</span>
            )}
          </span>
        )}
      </div>

      {/* spreadsheet */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1080 }}>
          <thead>
            <tr className="bg-gray-100 text-[10px] text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-200">
              <th className="px-2 py-1.5 text-center w-7">#</th>
              <th className="px-2 py-1.5 text-center w-[46px]" title="Persona bashkë në të njëjtën rezervim">
                <Users className="h-3 w-3 mx-auto" />
              </th>
              <th className="px-2 py-1.5 text-left min-w-[150px]">Emri i Pasagjerit</th>
              <th className="px-2 py-1.5 text-left w-[96px]">Referenca</th>
              <th className="px-2 py-1.5 text-left w-[105px]">Statusi</th>
              <th className="px-2 py-1.5 text-right w-[72px]">Shitje (€)</th>
              <th className="px-2 py-1.5 text-right w-[78px] text-emerald-600">Komisioni</th>
              <th className="px-2 py-1.5 text-left min-w-[90px]">Operatori</th>
              <th className="px-2 py-1.5 text-left w-[84px]">PNR</th>
              <th className="px-2 py-1.5 text-left w-[106px]">Data</th>
              <th className="px-2 py-1.5 text-center w-[54px]">Nisja</th>
              <th className="px-2 py-1.5 text-center w-[54px]">Mbërritja</th>
              <th className="px-2 py-1.5 text-left w-[86px]">Pagesa</th>
              <th className="px-2 py-1.5 w-[116px]"></th>
            </tr>
          </thead>
          <tbody>
            {initialRows.map((row, i) => (
              <SaleSpreadsheetRow
                key={`${ticket.id}-row-${i}`}
                rowNum={i + 1}
                initial={row}
                groupId={ticket.id}
                netPrice={netPrice}
                togetherness={togethernessOf(i)}
                flightDate={flightDate}
                returnFlightDate={returnFlightDate || undefined}
                flexBack={flexBack}
                flexForward={flexForward}
                groupStatus={groupStatus}
                fillSignal={fills[i]}
                clearSignal={clears[i]}
                departureAlts={departureAlts}
                arrivalAlts={arrivalAlts}
                isGroupLeader={isGroupLeaderOf(i)}
                groupLeaderPnr={groupLeaderPnrOf(i)}
                onFormChange={f => setCurrentForms(c => ({ ...c, [i]: f }))}
                onAddPassenger={form => handleAddPassenger(i, form)}
                onRemovePassenger={() => handleRemovePassenger(i)}
                onSaved={refetch}
                onDeleted={refetch}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Airport Alternatives Tab ─────────────────────────────────────────────────
function AirportAlternativesTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["airport-alternatives"],
    queryFn: async () => {
      const r = await apiCall("/airport-alternatives");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const row of rows as any[]) {
      if (!map[row.mainAirport]) map[row.mainAirport] = [];
      map[row.mainAirport].push(row);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  // New airport form
  const [newMain, setNewMain] = useState("");
  const [newAlts, setNewAlts] = useState(""); // space-separated
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Inline add (per row)
  const [inlineRow, setInlineRow] = useState<string | null>(null); // which mainAirport row is open
  const [inlineVal, setInlineVal] = useState("");
  const [inlineSaving, setInlineSaving] = useState(false);

  const refetch = () => qc.invalidateQueries({ queryKey: ["airport-alternatives"] });

  const addNew = async () => {
    const main = newMain.trim().toUpperCase();
    const alts = newAlts.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!main || alts.length === 0) { setError("Plotëso aeroportin kryesor dhe së paku 1 alternativë."); return; }
    setSaving(true); setError("");
    try {
      for (const alt of alts) {
        await apiCall("/airport-alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainAirport: main, alternativeAirport: alt }),
        });
      }
      setNewMain(""); setNewAlts(""); refetch();
    } catch (e: any) { setError(e.message ?? "Gabim"); }
    finally { setSaving(false); }
  };

  const addInline = async (main: string) => {
    const alts = inlineVal.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (alts.length === 0) { setInlineRow(null); setInlineVal(""); return; }
    setInlineSaving(true);
    try {
      for (const alt of alts) {
        await apiCall("/airport-alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainAirport: main, alternativeAirport: alt }),
        });
      }
      setInlineRow(null); setInlineVal(""); refetch();
    } catch { /* silent */ }
    finally { setInlineSaving(false); }
  };

  const doDelete = async (id: number) => {
    await apiCall(`/airport-alternatives/${id}`, { method: "DELETE" });
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Add new airport row */}
      <div className="bg-card border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
          <Plus className="h-3.5 w-3.5" /> Shto Aeroport të Ri
        </p>
        {error && (
          <div className="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-lg mb-3 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">Aeroporti Kryesor</label>
            <input
              value={newMain}
              onChange={e => setNewMain(e.target.value.toUpperCase())}
              placeholder="TIA"
              maxLength={4}
              className="border rounded-lg px-3 py-2 text-sm font-bold font-mono w-20 bg-background text-center tracking-widest"
              onKeyDown={e => e.key === "Enter" && addNew()}
            />
          </div>
          <div className="text-2xl text-gray-300 pb-1.5">→</div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
              Aeroportet Alternative <span className="normal-case font-normal">(të ndara me hapësirë)</span>
            </label>
            <input
              value={newAlts}
              onChange={e => setNewAlts(e.target.value.toUpperCase())}
              placeholder="BRI BOL VCE MXP"
              className="border rounded-lg px-3 py-2 text-sm font-mono w-full bg-background tracking-widest"
              onKeyDown={e => e.key === "Enter" && addNew()}
            />
          </div>
          <button
            onClick={addNew}
            disabled={saving}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            {saving ? "Duke ruajtur..." : "Shto"}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Duke ngarkuar...</p>
      ) : grouped.length === 0 ? (
        <div className="border rounded-xl py-16 text-center text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nuk ka aeroporte të regjistruara akoma.</p>
          <p className="text-xs mt-1">Shto aeroportin e parë nga forma sipër.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden divide-y">
          {grouped.map(([main, alts]) => (
            <div key={main} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
              {/* Main airport badge */}
              <div className="shrink-0 w-16">
                <span className="inline-flex items-center justify-center bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg px-2.5 py-1.5 font-bold text-sm font-mono tracking-widest w-full">
                  {main}
                </span>
              </div>

              {/* Arrow */}
              <div className="text-gray-300 text-lg shrink-0">→</div>

              {/* Alternative chips */}
              <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                {(alts as any[]).map((alt: any) => (
                  <div
                    key={alt.id}
                    className="group flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md px-2.5 py-1 font-bold text-sm font-mono tracking-widest hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-default"
                  >
                    {alt.alternativeAirport}
                    <button
                      onClick={() => doDelete(alt.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:scale-110"
                      title="Fshi"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {/* Inline add */}
                {inlineRow === main ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={inlineVal}
                      onChange={e => setInlineVal(e.target.value.toUpperCase())}
                      placeholder="BRI BOL..."
                      className="border rounded-md px-2.5 py-1 text-sm font-mono w-28 bg-background tracking-widest outline-none focus:border-primary"
                      onKeyDown={e => {
                        if (e.key === "Enter") addInline(main);
                        if (e.key === "Escape") { setInlineRow(null); setInlineVal(""); }
                      }}
                    />
                    <button
                      onClick={() => addInline(main)}
                      disabled={inlineSaving}
                      className="text-emerald-600 hover:text-emerald-700 p-1 rounded"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { setInlineRow(null); setInlineVal(""); }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setInlineRow(main); setInlineVal(""); }}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary transition-colors"
                    title="Shto alternativë"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const Upload2 = Upload;

const STATUS_LABELS: Record<string, string> = {
  "":          "—",
  HOLD:        "HOLD",
  WAITING:     "WAITING",
  CONFIRMED:   "CONFIRMED",
  FLEX:        "FLEX",
  CHANGE:      "CHANGE",
  CANCELED:    "CANCELED",
};

const STATUS_COLORS: Record<string, string> = {
  "":          "bg-gray-100 text-gray-400 border-gray-200",
  HOLD:        "bg-orange-50 text-orange-700 border-orange-300",
  WAITING:     "bg-yellow-50 text-yellow-700 border-yellow-300",
  CONFIRMED:   "bg-blue-50 text-blue-700 border-blue-300 font-semibold",
  FLEX:        "bg-violet-50 text-violet-700 border-violet-300",
  CHANGE:      "bg-amber-50 text-amber-700 border-amber-300 font-bold",
  CANCELED:    "bg-red-50 text-red-700 border-red-300",
};

// ─── Krijo / Edito Grup Form ──────────────────────────────────────────────────
function KrijoGrupForm({ onSuccess, editGroup, onCancel }: { onSuccess: () => void; editGroup?: any; onCancel?: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!editGroup;

  const emptyForm = {
    purchaseDate: today,
    departure: "",
    destination: "",
    flightDate: "",
    flightTime: "",
    totalSeats: "",
    pricePerSeat: "",
    airline: "",
    status: "",
    pnrOriginal: "",
    notes: "",
    installment1: "",
    installment2: "",
    country: "",
    returnFlightDate: "",
    returnFlightTime: "",
  };

  const groupToForm = (g: any): Record<string, string> => ({
    purchaseDate: g.purchaseDate ?? today,
    departure: g.departure ?? "",
    destination: g.destination ?? "",
    flightDate: g.flightDate ?? "",
    flightTime: g.flightTime ?? "",
    totalSeats: g.totalSeats != null ? String(g.totalSeats) : "",
    pricePerSeat: g.pricePerSeat != null ? String(Number(g.pricePerSeat)) : "",
    airline: g.airline ?? "",
    status: g.status ?? "open",
    pnrOriginal: g.pnrOriginal ?? "",
    notes: g.notes ?? "",
    installment1: g.installment1 != null ? String(Number(g.installment1)) : "",
    installment2: g.installment2 != null ? String(Number(g.installment2)) : "",
    country: g.country ?? "",
    returnFlightDate: g.returnFlightDate ?? "",
    returnFlightTime: g.returnFlightTime ?? "",
  });

  const [form, setForm] = useState<Record<string, string>>(isEdit ? groupToForm(editGroup) : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);

  React.useEffect(() => {
    if (editGroup) setForm(groupToForm(editGroup));
    else setForm(emptyForm);
    setError(""); setSuccess(null);
  }, [editGroup?.id]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const totalSeatsN  = Number(form.totalSeats) || 0;
  const netTotalN    = Number(form.pricePerSeat) || 0;  // total grup
  const totalPrice   = netTotalN;                        // IS the total
  const pricePerSeatN = totalSeatsN > 0 ? netTotalN / totalSeatsN : 0; // per person (display only)

  const k1Default = totalPrice > 0 ? +fmtM(totalPrice * 0.10) : 0;
  const k2Default = totalPrice > 0 ? +fmtM(totalPrice * 0.30) : 0;
  const k1Actual = form.installment1 !== "" ? Number(form.installment1) : k1Default;
  const k2Actual = form.installment2 !== "" ? Number(form.installment2) : k2Default;
  // K3 = total minus only EXPLICITLY set payments (suggestions don't count as paid)
  const k1Paid = form.installment1 !== "" ? Number(form.installment1) : 0;
  const k2Paid = form.installment2 !== "" ? Number(form.installment2) : 0;
  const k3Suggested = +fmtM(totalPrice - k1Paid - k2Paid);
  const k3Actual = form.installment3 !== "" ? Number(form.installment3) : k3Suggested;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.departure.trim()) { setError("Nisja është e detyrueshme"); return; }
    if (!form.destination.trim()) { setError("Mberritja është e detyrueshme"); return; }
    if (!form.flightDate.trim()) { setError("Data e nisjes është e detyrueshme"); return; }
    setSaving(true);
    try {
      const pnr = form.pnrOriginal.trim() || `GRP-${Date.now()}`;
      const body: Record<string, any> = {
        pnrOriginal: pnr,
        departure: form.departure.trim().toUpperCase(),
        destination: form.destination.trim().toUpperCase(),
        flightDate: form.flightDate,
        flightTime: form.flightTime.trim() || null,
        totalSeats: totalSeatsN,
              pricePerSeat: netTotalN > 0 ? Math.round(netTotalN) : null,
        airline: form.airline.trim() || null,
        country: form.country?.trim() || null,
        returnFlightDate: form.returnFlightDate || null,
        returnFlightTime: form.returnFlightTime || null,
        status: form.status,
        notes: form.notes.trim() || null,
        purchaseDate: form.purchaseDate || null,
        installment1: k1Actual > 0 ? k1Actual : null,
        installment2: k2Actual > 0 ? k2Actual : null,
        color: isEdit ? (editGroup.color ?? "ORANGE") : "ORANGE",
      };
      const url = isEdit ? `/group-tickets/${editGroup.id}` : "/group-tickets";
      const method = isEdit ? "PUT" : "POST";
      const r = await apiCall(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Gabim gjatë ruajtjes");
      }
      const saved = await r.json();
      await qc.invalidateQueries({ queryKey: ["group-tickets"] });
      setSuccess(saved);
      if (!isEdit) setForm(emptyForm);
      setTimeout(() => { setSuccess(null); onSuccess(); }, 2200);
    } catch (e: any) {
      setError(e.message ?? "Gabim i panjohur");
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-emerald-700 text-sm font-medium">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {isEdit ? "Grupi u ndryshua me sukses!" : "Grupi u krijua me sukses!"} Duke kthyer te lista…
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>
      )}

      {/* ── Seksioni 1: Detajet e Fluturimit ── */}
      <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Plane className="h-4 w-4 text-blue-500" />
          {isEdit ? `Edito Grupin — ${editGroup.departure} → ${editGroup.destination}` : "Detajet e Fluturimit"}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Dt Blerje</label>
            <input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Statusi</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} className={fieldCls}>
              <option value="">— Bosh</option>
              <option value="HOLD">HOLD</option>
              <option value="WAITING">WAITING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="FLEX">FLEX</option>
              <option value="CHANGE">CHANGE (±ditë flex)</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Nisje <span className="text-red-400">*</span></label>
            <input type="text" placeholder="TIA" value={form.departure} onChange={e => set("departure", e.target.value.toUpperCase())} className={fieldCls} maxLength={4} />
          </div>
          <div>
            <label className={labelCls}>Mberritja <span className="text-red-400">*</span></label>
            <input type="text" placeholder="MXP" value={form.destination} onChange={e => set("destination", e.target.value.toUpperCase())} className={fieldCls} maxLength={4} />
          </div>
          <div>
            <label className={labelCls}>Dt Nisje <span className="text-red-400">*</span></label>
            <input type="date" value={form.flightDate} onChange={e => set("flightDate", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Ora (nisje)</label>
            <input type="time" value={form.flightTime} onChange={e => set("flightTime", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Data e kthimit <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="date" value={form.returnFlightDate} onChange={e => set("returnFlightDate", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Ora (kthim)</label>
            <input type="time" value={form.returnFlightTime} onChange={e => set("returnFlightTime", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Kompania ajrore</label>
            <input type="text" placeholder="Ryanair, Wizz Air…" value={form.airline} onChange={e => set("airline", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Shteti</label>
            <input type="text" placeholder="Itali, Gjermani…" value={form.country} onChange={e => set("country", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>PNR / Kodi</label>
            <input type="text" placeholder="Gjenerohet automatikisht" value={form.pnrOriginal} onChange={e => set("pnrOriginal", e.target.value.toUpperCase())} className={fieldCls} />
          </div>
        </div>
      </div>

      {/* ── Seksioni 2: Çmimet ── */}
      <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" /> Vendet &amp; Çmimet
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Nr. Vendeve</label>
            <input type="number" min={0} placeholder="0" value={form.totalSeats} onChange={e => set("totalSeats", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Neto Total Grup (€)</label>
            <input type="number" min={0} step="1" placeholder="0" value={form.pricePerSeat} onChange={e => set("pricePerSeat", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Neto / Person (€) <span className="text-gray-400 font-normal">(auto)</span></label>
            <div className={`${fieldCls} bg-gray-50 text-indigo-700 font-semibold`}>
              {pricePerSeatN > 0 ? `€ ${fmtM(pricePerSeatN)}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Seksioni 3: Pagesat / Kestet ── */}
      <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-500" /> Pagesat / Kestet
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>
              Kesti 1
              <span className="ml-1 text-gray-400 font-normal">(10% e totalit)</span>
            </label>
            <input
              type="number" min={0} step="1"
              placeholder={k1Default > 0 ? fmtM(k1Default) : "0.00"}
              value={form.installment1}
              onChange={e => set("installment1", e.target.value)}
              className={`${fieldCls} ${form.installment1 === "" ? "text-gray-400" : "text-gray-900"}`}
            />
            {k1Default > 0 && form.installment1 === "" && (
              <p className="text-[11px] text-gray-400 mt-0.5">Default: €{fmtM(k1Default)}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>
              Kesti 2
              <span className="ml-1 text-gray-400 font-normal">(30% e totalit)</span>
            </label>
            <input
              type="number" min={0} step="1"
              placeholder={k2Default > 0 ? fmtM(k2Default) : "0.00"}
              value={form.installment2}
              onChange={e => set("installment2", e.target.value)}
              className={`${fieldCls} ${form.installment2 === "" ? "text-gray-400" : "text-gray-900"}`}
            />
            {k2Default > 0 && form.installment2 === "" && (
              <p className="text-[11px] text-gray-400 mt-0.5">Default: €{fmtM(k2Default)}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>
              Kesti 3
              <span className="ml-1 text-gray-400 font-normal">(Total − K1 − K2)</span>
            </label>
            <input
              type="number" step="1"
              placeholder={k3Suggested !== 0 ? fmtM(k3Suggested) : "0.00"}
              value={form.installment3 ?? ""}
              onChange={e => set("installment3", e.target.value)}
              className={`${fieldCls} ${form.installment3 === "" ? "text-gray-400" : (k3Actual < 0 ? "text-red-600" : "text-gray-900")}`}
            />
            {totalPrice > 0 && form.installment3 === "" && (
              <p className="text-[11px] text-gray-400 mt-0.5">Sugjeruar: €{fmtM(k3Suggested)}</p>
            )}
          </div>
        </div>

        {/* Visual breakdown bar */}
        {totalPrice > 0 && (
          <div className="mt-2">
            <div className="flex rounded-full overflow-hidden h-2.5 gap-px">
              <div className="bg-blue-400 transition-all" style={{ width: `${Math.min(100, (k1Actual / totalPrice) * 100)}%` }} />
              <div className="bg-emerald-400 transition-all" style={{ width: `${Math.min(100, (k2Actual / totalPrice) * 100)}%` }} />
              <div className={`transition-all flex-1 ${k3Actual < 0 ? "bg-red-300" : "bg-gray-200"}`} />
            </div>
            <div className="flex text-[10px] text-gray-400 mt-1 gap-4">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />K1 {((k1Actual/totalPrice)*100).toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />K2 {((k2Actual/totalPrice)*100).toFixed(0)}%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />K3 {((Math.max(0,k3Actual)/totalPrice)*100).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Shënime ── */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <label className={labelCls}>Shënime (opsionale)</label>
        <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} className={`${fieldCls} resize-none`} placeholder="Çdo informacion shtesë…" />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => { if (isEdit && onCancel) onCancel(); else { setForm(emptyForm); setError(""); } }} disabled={saving}>
          {isEdit ? "Anulo" : "Pastro"}
        </Button>
        <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
          {saving
            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Duke ruajtur…</>
            : isEdit
              ? <><Save className="h-4 w-4 mr-2" />Ruaj Ndryshimet</>
              : <><Save className="h-4 w-4 mr-2" />Krijo Grupin</>
          }
        </Button>
      </div>
    </form>
  );
}

export default function GroupTicketsPage({ embedGroupId }: { embedGroupId?: number } = {}) {
  const qc = useQueryClient();
  const { data: tickets = [], isLoading } = useGroupTickets();

  const [activeTab, setActiveTab] = useState<"list" | "create" | "groups" | "manage" | "airports">(embedGroupId != null ? "manage" : "list");
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [groupModal, setGroupModal] = useState<{ open: boolean; group?: any }>({ open: false });
  const [editSaleModal, setEditSaleModal] = useState<{ open: boolean; groupId?: number; sale?: any }>({ open: false });
  const [importModal, setImportModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "group" | "sale"; id: number; groupId?: number } | null>(null);
  const [commentsModal, setCommentsModal] = useState<{ open: boolean; ticketId?: number }>({ open: false });
  const [highlightTicketId, setHighlightTicketId] = useState<number | null>(null);

  // Single-group filter (when embedded from booking detail) — kur është aktiv, shfaqet vetëm ai grup
  const [singleGroupId, setSingleGroupId] = useState<number | null>(() => {
    if (embedGroupId != null) return embedGroupId;
    try {
      const params = new URLSearchParams(window.location.search);
      const og = params.get("onlyGroup");
      if (og) return Number(og);
    } catch {}
    return null;
  });

  // Deep-link: ?openGroup=<id> ose sessionStorage("openGroupId") — hap grupin, scroll te rreshti, highlight 3s
  useEffect(() => {
    if (isLoading || tickets.length === 0) return;
    let raw: string | null = null;
    let onlyMode = false;
    if (embedGroupId != null) {
      raw = String(embedGroupId);
      onlyMode = true;
    }
    try {
      if (!raw) {
        const params = new URLSearchParams(window.location.search);
        const og = params.get("onlyGroup");
        if (og) { raw = og; onlyMode = true; }
      }
    } catch {}
    if (!raw) {
      try {
        raw = sessionStorage.getItem("openGroupId");
        if (raw) sessionStorage.removeItem("openGroupId");
      } catch {}
    }
    if (!raw) {
      const params = new URLSearchParams(window.location.search);
      raw = params.get("openGroup");
    }
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const found = tickets.find((t: any) => t.id === id);
    if (!found) return;
    if (onlyMode) setSingleGroupId(id);
    setActiveTab(onlyMode ? "manage" : "list");
    // Reset filtra-t që rreshti i grupit të jetë i dukshëm pa pengesë
    setListFilter({
      nisja: "", mberritja: "", status: "", dateFrom: "", dateTo: "", country: "",
      pnr: "", kompania: "", vendeMin: "", vendeMax: "",
      purchaseDateFrom: "", purchaseDateTo: "",
      k1Status: "", k2Status: "", k3Status: "",
    });
    setExpandedIds(prev => { const n = new Set(prev); n.add(id); return n; });
    setHighlightTicketId(id);
    // 2 attempts të skrollohet — rreshti mund të mos jetë ende në DOM në provën e parë
    const tryScroll = (attempt: number) => {
      const el = document.getElementById(`group-row-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempt < 5) {
        setTimeout(() => tryScroll(attempt + 1), 200);
      }
    };
    setTimeout(() => tryScroll(0), 250);
    setTimeout(() => setHighlightTicketId(null), 4000);
    // Pastro query param që të mos ri-triggerojë
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("openGroup")) {
        url.searchParams.delete("openGroup");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  }, [isLoading, tickets]);

  // ─── Inline new-group row ──────────────────────────────────────────────────
  const EMPTY_NEW_ROW = { pnrOriginal: "", purchaseDate: "", departure: "", destination: "", flightDate: "", flightTime: "", airline: "", totalSeats: "", pricePerSeat: "", status: "", country: "", returnFlightDate: "", returnFlightTime: "", installment1: "", installment2: "", installment3: "" };
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>(EMPTY_NEW_ROW);
  const [newRowRoundTrip, setNewRowRoundTrip] = useState(false);
  const [savingNewRow, setSavingNewRow] = useState(false);
  const setNR = (k: string, v: string) => setNewRow(r => ({ ...r, [k]: v }));

  const saveNewRow = async () => {
    if (!newRow.departure.trim() || !newRow.destination.trim() || !newRow.flightDate.trim()) return;
    setSavingNewRow(true);
    try {
      const totalSeatsN = Number(newRow.totalSeats) || 0;
      const netTotalN = Number(newRow.pricePerSeat) || 0;
      const body: Record<string, any> = {
        pnrOriginal: newRow.pnrOriginal.trim() || `GRP-${Date.now()}`,
        departure: newRow.departure.trim().toUpperCase(),
        destination: newRow.destination.trim().toUpperCase(),
        flightDate: newRow.flightDate,
        flightTime: newRow.flightTime.trim() || null,
        airline: newRow.airline.trim() || null,
        totalSeats: totalSeatsN || null,
        pricePerSeat: netTotalN > 0 ? Math.round(netTotalN) : null,
        status: newRow.status,
        purchaseDate: newRow.purchaseDate || null,
        color: "ORANGE",
        country: newRow.country.trim() || null,
        returnFlightDate: newRowRoundTrip ? (newRow.returnFlightDate || null) : null,
        returnFlightTime: newRowRoundTrip ? (newRow.returnFlightTime || null) : null,
        installment1: newRow.installment1 !== "" ? Math.round(Number(newRow.installment1)) : null,
        installment2: newRow.installment2 !== "" ? Math.round(Number(newRow.installment2)) : null,
        installment3: newRow.installment3 !== "" ? Math.round(Number(newRow.installment3)) : null,
      };
      const r = await apiCall("/group-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Gabim gjatë ruajtjes");
      await qc.invalidateQueries({ queryKey: ["group-tickets"] });
      setNewRow(EMPTY_NEW_ROW);
      setNewRowRoundTrip(false);
      setShowNewRow(false);
    } catch (e) { /* silent */ }
    finally { setSavingNewRow(false); }
  };

  // ─── Inline edit existing row ──────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<Record<string, string>>({});
  const [savingEditRow, setSavingEditRow] = useState(false);
  const setER = (k: string, v: string) => setEditRowData(r => ({ ...r, [k]: v }));

  const startEdit = (ticket: any) => {
    setEditingId(ticket.id);
    setEditRowData({
      pnrOriginal: ticket.pnrOriginal ?? "",
      purchaseDate: ticket.purchaseDate ?? "",
      departure: ticket.departure ?? "",
      destination: ticket.destination ?? "",
      flightDate: ticket.flightDate ?? "",
      flightTime: ticket.flightTime ?? "",
      airline: ticket.airline ?? "",
      totalSeats: ticket.totalSeats != null ? String(ticket.totalSeats) : "",
      pricePerSeat: ticket.pricePerSeat != null ? String(ticket.pricePerSeat) : "",
      status: ticket.status ?? "open",
      installment1: ticket.installment1 != null ? String(ticket.installment1) : "",
      installment2: ticket.installment2 != null ? String(ticket.installment2) : "",
      installment3: ticket.installment3 != null ? String(ticket.installment3) : "",
      country: ticket.country ?? "",
      returnFlightDate: ticket.returnFlightDate ?? "",
      returnFlightTime: ticket.returnFlightTime ?? "",
    });
  };

  const saveEditRow = async () => {
    if (!editingId) return;
    setSavingEditRow(true);
    try {
      const totalSeatsN = Number(editRowData.totalSeats) || 0;
      const netTotalN = Number(editRowData.pricePerSeat) || 0;
      const body: Record<string, any> = {
        departure: editRowData.departure.trim().toUpperCase(),
        destination: editRowData.destination.trim().toUpperCase(),
        flightDate: editRowData.flightDate,
        flightTime: editRowData.flightTime.trim() || null,
        airline: editRowData.airline.trim() || null,
        totalSeats: totalSeatsN,
        pricePerSeat: netTotalN > 0 ? Math.round(netTotalN) : null,
        pnrOriginal: editRowData.pnrOriginal.trim() || undefined,
        status: editRowData.status,
        purchaseDate: editRowData.purchaseDate || null,
        installment1: editRowData.installment1 !== "" ? Math.round(Number(editRowData.installment1)) : null,
        installment2: editRowData.installment2 !== "" ? Math.round(Number(editRowData.installment2)) : null,
        installment3: editRowData.installment3 !== "" ? Math.round(Number(editRowData.installment3)) : null,
        country: editRowData.country?.trim() || null,
        returnFlightDate: editRowData.returnFlightDate || null,
        returnFlightTime: editRowData.returnFlightTime || null,
      };
      const r = await apiCall(`/group-tickets/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Gabim gjatë ruajtjes");
      await qc.invalidateQueries({ queryKey: ["group-tickets"] });
      setEditingId(null);
    } catch (e) { /* silent */ }
    finally { setSavingEditRow(false); }
  };

  // ─── Inline installment quick-save ────────────────────────────────────────
  const saveInstallment = async (id: number, field: "installment1" | "installment2" | "installment3", value: string) => {
    const payload: Record<string, string | null> = { [field]: value.trim() === "" ? null : value.trim() };
    await apiCall(`/group-tickets/${id}/installments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    qc.invalidateQueries({ queryKey: ["group-tickets"] });
  };

  // ─── Download group template ───────────────────────────────────────────────
  const downloadGroupTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
      "PNR Original", "Dt Blerje", "Nisja (DEPA)", "Destinacioni (DEST)",
      "Data e Fluturimit", "Ora (nisja)", "Data Kthimit", "Ora (kthim)",
      "Vende Totale", "Neto Total (€)", "Statusi", "Kompania Ajrore", "Shteti",
      "K1 (€)", "K2 (€)", "Shënime",
    ];
    const example = [
      "GRP-001", "2026-06-01", "TIA", "BLQ",
      "2026-07-30", "14:30", "", "",
      "40", "2000", "WAITING", "WIZ", "Itali",
      "200", "400", "",
    ];
    const note = [
      "* PNR është i detyrueshëm", "* Data: YYYY-MM-DD", "* DEPA: 3 shkronja",
      "* DEST: 3 shkronja", "* Fluturim kthimi: lër bosh nëse vetëm vajtje",
      "", "* Data Kthimit: YYYY-MM-DD (vetëm vajtje-ardhje)", "",
      "", "", "* HOLD / WAITING / CONFIRMED / FLEX / CHANGE / CANCELED (ose bosh)", "* p.sh. WIZ / RYR", "* p.sh. Itali",
      "* K1: kësti i parë (€)", "* K2: kësti i dytë (€)", "* K3 (Detyrim) llogaritet automatikisht: Neto−K1−K2",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example, note]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grupe Template");
    XLSX.writeFile(wb, "grupe_template.xlsx");
  };

  const [statusFilter, setStatusFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [search, setSearch] = useState("");

  // ─── List tab column visibility ───────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<ListCol>>(new Set(["dtBlerje","pnr","dataFlex","k1","k2","k3","detyrim","netoP","kompania"]));
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const toggleCol = (c: ListCol) => setVisibleCols(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const vc = (c: ListCol) => visibleCols.has(c);
  const COL_LABELS: Record<ListCol, string> = { dtBlerje: "Dt Blerje", pnr: "PNR", dataFlex: "Data Flex", k1: "K1", k2: "K2", k3: "K3", detyrim: "Detyrim", netoP: "Neto/P", kompania: "Kompania" };

  // ─── List tab filters ─────────────────────────────────────────────────────
  const [listFilter, setListFilter] = useState({
    nisja: "", mberritja: "", status: "", dateFrom: "", dateTo: "", country: "",
    pnr: "", kompania: "", vendeMin: "", vendeMax: "",
    purchaseDateFrom: "", purchaseDateTo: "",
    k1Status: "", k2Status: "", k3Status: "",
  });
  const setLF = (k: string, v: string) => setListFilter(f => ({ ...f, [k]: v }));

  // ─── List tab sort ────────────────────────────────────────────────────────
  type SortField = "purchaseDate"|"pnr"|"departure"|"destination"|"flightDate"|"totalSeats"|"pricePerSeat"|"status"|"airline"|"country"|"k1"|"k2"|"k3";
  const [sortField, setSortField] = useState<SortField>("flightDate");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };
  const SortIcon = ({ f }: { f: SortField }) => {
    if (sortField !== f) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-blue-500 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // ─── Airport Alternatives lookup (for destination column) ─────────────────
  const { data: airportAlts = [] } = useQuery<any[]>({
    queryKey: ["airport-alternatives"],
    queryFn: async () => {
      const r = await apiCall("/airport-alternatives");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Unidirectional map: main_airport → [alternatives] (excluding self-references)
  // Used only for display in the Alternativat column.
  // Airports that appear only as alternative_airport (not as main_airport) show no alternatives.
  const destAltsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of airportAlts as any[]) {
      if (row.mainAirport === row.alternativeAirport) continue; // skip self-references
      if (!map.has(row.mainAirport)) map.set(row.mainAirport, []);
      const list = map.get(row.mainAirport)!;
      if (!list.includes(row.alternativeAirport)) list.push(row.alternativeAirport);
    }
    return map;
  }, [airportAlts]);

  // ─── Group Search ─────────────────────────────────────────────────────────
  const [srchForm, setSrchForm] = useState({ from: "", to: "", date: "", persons: "1" });
  const [activeSearch, setActiveSearch] = useState<{ from: string; to: string; date: string; persons: number } | null>(null);

  const { data: searchResults = [], isFetching: searchLoading, error: searchError } = useQuery<any[]>({
    queryKey: ["group-search", activeSearch],
    queryFn: async () => {
      if (!activeSearch) return [];
      const params = new URLSearchParams({
        from: activeSearch.from,
        to: activeSearch.to,
        date: activeSearch.date,
        persons: String(activeSearch.persons),
      });
      const r = await apiCall(`/group-tickets/search?${params}`);
      if (!r.ok) throw new Error("Search dështoi");
      return r.json();
    },
    enabled: activeSearch !== null,
  });

  // Map of id → matchType from search results (for filtering + styling)
  const searchResultMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of searchResults as any[]) m.set(g.id, g.matchType);
    return m;
  }, [searchResults]);

  // Map of id → full search result data (to compute reason for partial)
  const searchResultDataMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const g of searchResults as any[]) m.set(g.id, g);
    return m;
  }, [searchResults]);

  // Compute reasons why a group is a partial match (shown in Alternativat column)
  const getPartialReasons = (ticketId: number): string[] => {
    const sr = searchResultDataMap.get(ticketId);
    if (!sr || sr.matchType !== "partial" || !activeSearch) return [];
    const reasons: string[] = [];
    const personsNum = activeSearch.persons ?? 1;
    // 1. Seats check
    if ((sr.seatsRemaining ?? 0) < personsNum) {
      reasons.push("Vende të pamjaftueshme");
    }
    // 2. Date check
    const searchDate = activeSearch.date;
    if (sr.status === "CHANGE") {
      const fd = sr.flightDate ?? "";
      const back = Number(sr.dateFlexBack ?? 14);
      const fwd = Number(sr.dateFlexForward ?? 30);
      if (fd) {
        const base = parseISO(fd);
        const rangeFrom = format(subDays(base, back), "yyyy-MM-dd");
        const rangeTo = format(addDays(base, fwd), "yyyy-MM-dd");
        if (searchDate < rangeFrom || searchDate > rangeTo) {
          reasons.push("Data jashtë intervalit");
        }
      }
    } else {
      if (sr.flightDate && sr.flightDate !== searchDate) {
        reasons.push("Data nuk përputhet");
      }
    }
    if (reasons.length === 0) reasons.push("Kriter i paplotë");
    return reasons;
  };

  const filteredTickets = useMemo(() => {
    // helper: calculate K values for a ticket (same logic as calcRow below)
    const getKVals = (t: any) => {
      const tp = Number(t.pricePerSeat) || 0;
      const k1p = t.installment1 != null ? Number(t.installment1) : 0;
      const k2p = t.installment2 != null ? Number(t.installment2) : 0;
      const k3p = t.installment3 != null ? Number(t.installment3) : 0;
      const detyrim = Math.round(tp - k1p - k2p - k3p);
      return { k1p, k2p, k3p, detyrim };
    };
    let result = (tickets as any[]).filter(t => {
      // ── single-group mode (embed) ──────────────────────────────────────────
      if (singleGroupId != null && t.id !== singleGroupId) return false;
      // ── panel filters ──────────────────────────────────────────────────────
      if (listFilter.nisja && !t.departure?.toUpperCase().includes(listFilter.nisja.toUpperCase())) return false;
      if (listFilter.mberritja && !t.destination?.toUpperCase().includes(listFilter.mberritja.toUpperCase())) return false;
      if (listFilter.pnr && !t.pnrOriginal?.toLowerCase().includes(listFilter.pnr.toLowerCase())) return false;
      if (listFilter.kompania && !t.airline?.toLowerCase().includes(listFilter.kompania.toLowerCase())) return false;
      if (listFilter.status && t.status !== listFilter.status) return false;
      if (listFilter.dateFrom && t.flightDate < listFilter.dateFrom) return false;
      if (listFilter.dateTo && t.flightDate > listFilter.dateTo) return false;
      if (listFilter.country && !t.country?.toLowerCase().includes(listFilter.country.toLowerCase())) return false;
      if (listFilter.purchaseDateFrom && (t.purchaseDate ?? "") < listFilter.purchaseDateFrom) return false;
      if (listFilter.purchaseDateTo && (t.purchaseDate ?? "") > listFilter.purchaseDateTo) return false;
      const seats = Number(t.totalSeats) || 0;
      if (listFilter.vendeMin && seats < Number(listFilter.vendeMin)) return false;
      if (listFilter.vendeMax && seats > Number(listFilter.vendeMax)) return false;
      // K filters: "paid" = value set and >0; "unpaid" = not set or 0
      const { k1p, k2p, k3p, detyrim } = getKVals(t);
      if (listFilter.k1Status === "paid" && k1p <= 0) return false;
      if (listFilter.k1Status === "unpaid" && k1p > 0) return false;
      if (listFilter.k2Status === "paid" && k2p <= 0) return false;
      if (listFilter.k2Status === "unpaid" && k2p > 0) return false;
      if (listFilter.k3Status === "paid" && detyrim > 0) return false;
      if (listFilter.k3Status === "unpaid" && detyrim <= 0) return false;
      // ── global dropdowns + text search ────────────────────────────────────
      if (statusFilter && t.status !== statusFilter) return false;
      if (colorFilter && t.color !== colorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.pnrOriginal?.toLowerCase().includes(q) && !t.departure?.toLowerCase().includes(q) && !t.destination?.toLowerCase().includes(q) && !t.airline?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    // ── when booking-engine search active → filter + sort by match ────────
    if (activeSearch && !searchLoading) {
      result = result.filter((t: any) => searchResultMap.has(t.id));
      result = [...result].sort((a: any, b: any) => {
        const aFull = searchResultMap.get(a.id) === "full" ? 0 : 1;
        const bFull = searchResultMap.get(b.id) === "full" ? 0 : 1;
        return aFull - bFull;
      });
      return result;
    }
    // ── column sort ────────────────────────────────────────────────────────
    result = [...result].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (sortField === "k1") { av = (a.installment1 != null ? Number(a.installment1) : 0); bv = (b.installment1 != null ? Number(b.installment1) : 0); }
      else if (sortField === "k2") { av = (a.installment2 != null ? Number(a.installment2) : 0); bv = (b.installment2 != null ? Number(b.installment2) : 0); }
      else if (sortField === "k3") { const ka = getKVals(a); const kb = getKVals(b); av = ka.k3p; bv = kb.k3p; }
      else if (sortField === "totalSeats") { av = Number(a.totalSeats) || 0; bv = Number(b.totalSeats) || 0; }
      else if (sortField === "pricePerSeat") { av = Number(a.pricePerSeat) || 0; bv = Number(b.pricePerSeat) || 0; }
      else { av = (a[sortField] ?? ""); bv = (b[sortField] ?? ""); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [tickets, listFilter, statusFilter, colorFilter, search, activeSearch, searchLoading, searchResultMap, sortField, sortDir]);

  // Live search — auto-triggers 400ms after typing when all 3 fields filled
  useEffect(() => {
    const f = srchForm.from.trim().toUpperCase();
    const t = srchForm.to.trim().toUpperCase();
    const d = srchForm.date;
    if (!f || !t || !d) { setActiveSearch(null); return; }
    const timer = setTimeout(() => {
      setActiveSearch({ from: f, to: t, date: d, persons: Math.max(1, Number(srchForm.persons) || 1) });
    }, 400);
    return () => clearTimeout(timer);
  }, [srchForm.from, srchForm.to, srchForm.date, srchForm.persons]);

  // filtered for the manage ("Menaxhimi") tab — uses statusFilter/colorFilter/search + activeSearch
  const filtered = useMemo(() => {
    let result = (tickets as any[]).filter(t => {
      if (singleGroupId != null && t.id !== singleGroupId) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (colorFilter && t.color !== colorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.pnrOriginal?.toLowerCase().includes(q) || t.departure?.toLowerCase().includes(q) || t.destination?.toLowerCase().includes(q) || t.airline?.toLowerCase().includes(q);
      }
      return true;
    });
    // When search is active and done, show only matching groups sorted full → partial
    if (activeSearch && !searchLoading) {
      result = result.filter((t: any) => searchResultMap.has(t.id));
      result = [...result].sort((a: any, b: any) => {
        const aFull = searchResultMap.get(a.id) === "full" ? 0 : 1;
        const bFull = searchResultMap.get(b.id) === "full" ? 0 : 1;
        return aFull - bFull;
      });
    }
    return result;
  }, [tickets, statusFilter, colorFilter, search, activeSearch, searchLoading, searchResultMap]);

  const toggleExpand = (id: number) => {
    setExpandedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const refetch = () => qc.invalidateQueries({ queryKey: ["group-tickets"] });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id, groupId }: { type: "group" | "sale"; id: number; groupId?: number }) => {
      const url = type === "group" ? `/group-tickets/${id}` : `/group-tickets/${groupId}/sales/${id}`;
      const r = await apiCall(url, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("Fshirja dështoi");
    },
    onSuccess: () => { refetch(); setDeleteConfirm(null); },
  });


  const embedOnlyMode = singleGroupId != null;
  return (
    <div className="space-y-4">
      {/* Header — i fshehur në embed mode */}
      {!embedOnlyMode && (
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-500" /> Bileta Grupi
          </h1>
          <p className="text-muted-foreground text-sm">Klikoni mbi një grup për të shtuar shitje direkt.</p>
        </div>
        {activeTab === "list" && (
          <div className="flex items-center gap-2">
            <button onClick={downloadGroupTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Template
            </button>
            <Button variant="outline" size="sm" onClick={() => setImportModal(true)}>
              <Upload className="mr-1.5 h-4 w-4" /> Import Excel
            </Button>
            <Button size="sm" onClick={() => { setShowNewRow(v => !v); setNewRow(EMPTY_NEW_ROW); setEditingId(null); }} className={showNewRow ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 hover:bg-blue-700 text-white"}>
              {showNewRow ? <><X className="mr-1.5 h-4 w-4" /> Anulo</> : <><Plus className="mr-1.5 h-4 w-4" /> Krijo Grup</>}
            </Button>
          </div>
        )}
        {activeTab === "manage" && (
          <Button variant="outline" size="sm" onClick={() => setImportModal(true)}>
            <Upload2 className="mr-1.5 h-4 w-4" /> Import Excel
          </Button>
        )}
      </div>
      )}

      {/* Tabs — i fshehur në embed mode */}
      {!embedOnlyMode && (
      <div className="flex gap-1 bg-muted/50 border rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Layers className="h-3.5 w-3.5" /> Grupet
        </button>
        <button
          onClick={() => { setEditingGroup(null); setActiveTab("create"); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "create" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Plus className="h-3.5 w-3.5" /> {activeTab === "create" && editingGroup ? "Edito" : "Krijo"}
        </button>
        <button
          onClick={() => setActiveTab("manage")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "manage" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Menaxhimi
        </button>
        <button
          onClick={() => setActiveTab("airports")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "airports" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MapPin className="h-3.5 w-3.5" /> Aeroportet
        </button>
      </div>
      )}

      {/* ═══ GRUPET TAB — Lista kryesore ═══ */}
      {activeTab === "list" && (() => {
        // ── per-row calculations helper ──────────────────────────────────────
        const calcRow = (t: any) => {
          const totalPrice = Number(t.pricePerSeat) || 0; // pricePerSeat = total grup
          // Display values: show suggestion (10%/20%) when not explicitly set, shown grayed out
          const k1Display = totalPrice > 0 ? +fmtM(totalPrice * 0.10) : 0;
          const k2Display = totalPrice > 0 ? +fmtM(totalPrice * 0.20) : 0;
          const k1 = t.installment1 != null ? Number(t.installment1) : k1Display;
          const k2 = t.installment2 != null ? Number(t.installment2) : k2Display;
          // Only count explicitly set payments (not suggestions)
          const k1Paid = t.installment1 != null ? Number(t.installment1) : 0;
          const k2Paid = t.installment2 != null ? Number(t.installment2) : 0;
          const k3Paid = t.installment3 != null ? Number(t.installment3) : 0;
          const k3Suggested = +fmtM(totalPrice - k1Paid - k2Paid);
          const k3 = t.installment3 != null ? Number(t.installment3) : k3Suggested;
          const detyrim = +fmtM(totalPrice - k1Paid - k2Paid - k3Paid);
          return { totalPrice, k1, k2, k3, k3Suggested, detyrim, k1IsDefault: t.installment1 == null, k2IsDefault: t.installment2 == null, k3IsDefault: t.installment3 == null };
        };

        // ── totals (over filtered rows only) ───────────────────────────────
        const totals = filteredTickets.reduce((acc: any, t: any) => {
          const { totalPrice, detyrim } = calcRow(t);
          if (totalPrice <= 0) return acc;
          acc.vende += Number(t.totalSeats) || 0;
          acc.total += totalPrice;
          // PAGUAR: only explicitly set values
          const k1Paid = t.installment1 != null ? Number(t.installment1) : 0;
          const k2Paid = t.installment2 != null ? Number(t.installment2) : 0;
          const k3Paid = t.installment3 != null ? Number(t.installment3) : 0;
          acc.paidK1 += k1Paid;
          acc.paidK2 += k2Paid;
          acc.paidK3 += k3Paid;
          acc.detyrim += detyrim; // Detyrim = Neto − K1 − K2 − K3 (paguar)
          // WAITING: sugjerimet vetëm ku vlera nuk është vendosur
          const k1Sug = t.installment1 == null ? +fmtM(totalPrice * 0.10) : 0;
          const k2Sug = t.installment2 == null ? +fmtM(totalPrice * 0.20) : 0;
          acc.waitK1 += k1Sug;
          acc.waitK2 += k2Sug;
          return acc;
        }, { vende: 0, total: 0, paidK1: 0, paidK2: 0, paidK3: 0, detyrim: 0, waitK1: 0, waitK2: 0 });

        const LF_EMPTY = { nisja: "", mberritja: "", status: "", dateFrom: "", dateTo: "", country: "", pnr: "", kompania: "", vendeMin: "", vendeMax: "", purchaseDateFrom: "", purchaseDateTo: "", k1Status: "", k2Status: "", k3Status: "" };
        const hasActiveFilter = Object.values(listFilter).some(v => v !== "") || !!statusFilter || !!colorFilter || !!search;

        // ── seats & group count per status ─────────────────────────────────
        const seatsByStatus  = filteredTickets.reduce((acc: Record<string, number>, t: any) => {
          const s = (t.status ?? "WAITING").toUpperCase();
          acc[s] = (acc[s] ?? 0) + (Number(t.totalSeats) || 0);
          return acc;
        }, {} as Record<string, number>);
        const soldByStatus   = filteredTickets.reduce((acc: Record<string, number>, t: any) => {
          const s = (t.status ?? "WAITING").toUpperCase();
          acc[s] = (acc[s] ?? 0) + (Number(t.soldSeats) || 0);
          return acc;
        }, {} as Record<string, number>);
        const countByStatus  = filteredTickets.reduce((acc: Record<string, number>, t: any) => {
          const s = (t.status ?? "WAITING").toUpperCase();
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const STATUS_SUMMARY: Array<{ key: string; label: string; color: string; bg: string; border: string; dot: string }> = [
          { key: "HOLD",      label: "Hold",       color: "text-gray-600",    bg: "bg-gray-50",     border: "border-gray-200",   dot: "bg-gray-400" },
          { key: "WAITING",   label: "Pritje",     color: "text-yellow-700",  bg: "bg-yellow-50",   border: "border-yellow-200", dot: "bg-yellow-400" },
          { key: "CONFIRMED", label: "Konfirmuar", color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200",   dot: "bg-blue-500" },
          { key: "FLEX",      label: "Flex",       color: "text-indigo-700",  bg: "bg-indigo-50",   border: "border-indigo-200", dot: "bg-indigo-500" },
          { key: "CHANGE",    label: "Change",     color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-200", dot: "bg-purple-500" },
          { key: "CANCELED",  label: "Anuluar",    color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",    dot: "bg-red-400" },
        ];

        return (
          <div className="space-y-3">

            {/* ════════════════════════════════════════════════════════════
                ── PASQYRA FINANCIARE (Summary Panel) ─────────────────────
            ══════════════════════════════════════════════════════════════*/}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Header strip */}
              <div className="px-4 py-2 bg-gradient-to-r from-slate-50 to-white border-b border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-500" /> Pasqyra Financiare
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {filteredTickets.length} grupe &middot; {totals.vende} vende
                </span>
              </div>

              {/* ── Financial cards row ── */}
              <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-gray-100">
                {/* Neto Total */}
                <div className="px-5 py-3.5 flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Neto Total</span>
                  <span className="text-2xl font-extrabold text-gray-800 tracking-tight">€{fmtM(totals.total)}</span>
                  <span className="text-[10px] text-gray-400">{filteredTickets.length} grupe</span>
                </div>
                {/* K1 Paguar */}
                <div className="px-5 py-3.5 flex flex-col gap-0.5 bg-green-50/70">
                  <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> K1 &mdash; Paguar
                  </span>
                  <span className="text-2xl font-extrabold text-green-700 tracking-tight">€{fmtM(totals.paidK1)}</span>
                  <span className="text-[10px] text-green-500 font-medium">
                    {totals.total > 0 ? ((totals.paidK1 / totals.total) * 100).toFixed(0) : 0}% e totalit
                    {totals.waitK1 > 0 && <span className="text-blue-300 ml-2">sug. €{fmtM(totals.waitK1)}</span>}
                  </span>
                </div>
                {/* K2 Paguar */}
                <div className="px-5 py-3.5 flex flex-col gap-0.5 bg-emerald-50/70">
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> K2 &mdash; Paguar
                  </span>
                  <span className="text-2xl font-extrabold text-emerald-700 tracking-tight">€{fmtM(totals.paidK2)}</span>
                  <span className="text-[10px] text-emerald-500 font-medium">
                    {totals.total > 0 ? ((totals.paidK2 / totals.total) * 100).toFixed(0) : 0}% e totalit
                    {totals.waitK2 > 0 && <span className="text-emerald-300 ml-2">sug. €{fmtM(totals.waitK2)}</span>}
                  </span>
                </div>
                {/* K3 Paguar */}
                <div className="px-5 py-3.5 flex flex-col gap-0.5 bg-orange-50/70">
                  <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" /> K3 &mdash; Paguar
                  </span>
                  <span className="text-2xl font-extrabold text-orange-700 tracking-tight">€{fmtM(totals.paidK3)}</span>
                  <span className="text-[10px] text-orange-500 font-medium">
                    {totals.total > 0 ? ((totals.paidK3 / totals.total) * 100).toFixed(0) : 0}% e totalit
                  </span>
                </div>
                {/* Detyrim (Pa paguar) */}
                <div className={`px-5 py-3.5 flex flex-col gap-0.5 ${totals.detyrim <= 0 ? "bg-green-50/40" : "bg-rose-50/70"}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 ${totals.detyrim <= 0 ? "text-green-600" : "text-rose-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${totals.detyrim <= 0 ? "bg-green-500" : "bg-rose-400"}`} /> Detyrim &mdash; Pa paguar
                  </span>
                  <span className={`text-2xl font-extrabold tracking-tight ${totals.detyrim < 0 ? "text-red-600" : totals.detyrim === 0 ? "text-green-600" : "text-rose-600"}`}>
                    €{fmtM(totals.detyrim)}
                  </span>
                  <span className={`text-[10px] font-medium ${totals.detyrim <= 0 ? "text-green-500" : "text-rose-400"}`}>
                    {totals.total > 0 ? ((totals.detyrim / totals.total) * 100).toFixed(0) : 0}% &middot; Total−K1−K2−K3
                  </span>
                </div>
              </div>

              {/* ── Seats by status strip ── */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Armchair className="h-3 w-3" /> Vende sipas statusit
                </span>
                <div className="flex flex-wrap gap-2">
                  {STATUS_SUMMARY.map(({ key, label, color, bg, border, dot }) => {
                    const total = seatsByStatus[key] ?? 0;
                    const sold  = soldByStatus[key]  ?? 0;
                    const free  = total - sold;
                    const count = countByStatus[key] ?? 0;
                    if (total === 0 && count === 0) return null;
                    return (
                      <div key={key} className={`flex items-stretch rounded-xl border ${border} ${bg} shadow-sm overflow-hidden`}>
                        {/* left: status label */}
                        <div className={`flex items-center gap-1.5 px-3 py-2 ${color} font-bold text-xs border-r ${border}`}>
                          <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
                          {label}
                          <span className="opacity-50 font-normal text-[9px]">({count})</span>
                        </div>
                        {/* middle: total */}
                        <div className="flex flex-col items-center justify-center px-3 py-1.5 border-r border-dashed border-gray-200">
                          <span className="text-[9px] text-gray-400 uppercase font-semibold">Total</span>
                          <span className={`text-sm font-extrabold ${color}`}>{total}</span>
                        </div>
                        {/* middle: shitura */}
                        <div className="flex flex-col items-center justify-center px-3 py-1.5 border-r border-dashed border-gray-200">
                          <span className="text-[9px] text-red-400 uppercase font-semibold">Shitura</span>
                          <span className="text-sm font-extrabold text-red-600">{sold}</span>
                        </div>
                        {/* right: të lira */}
                        <div className="flex flex-col items-center justify-center px-3 py-1.5">
                          <span className="text-[9px] text-green-500 uppercase font-semibold">Të lira</span>
                          <span className={`text-sm font-extrabold ${free > 0 ? "text-green-600" : "text-gray-400"}`}>{free}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Filtra ───────────────────────────────────────────────── */}
            <div className="bg-gray-50 border rounded-xl p-3 space-y-2.5">
              {/* ── header ── */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Filtra &amp; Sort
                </span>
                <div className="flex items-center gap-2">
                  {hasActiveFilter && (
                    <button onClick={() => setListFilter(LF_EMPTY)}
                      className="text-xs text-red-500 hover:underline">✕ Pastro</button>
                  )}
                  {/* Column picker */}
                  <div className="relative">
                    <button onClick={() => setColPickerOpen(o => !o)} className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white hover:bg-gray-50 text-gray-600">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                      Kollonat
                    </button>
                    {colPickerOpen && (
                      <div className="absolute right-0 top-7 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px] space-y-1.5">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Shfaq / Fshih</div>
                        {ALL_LIST_COLS.map(col => (
                          <label key={col} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                            <input type="checkbox" checked={vc(col)} onChange={() => toggleCol(col)} className="w-3 h-3 accent-blue-600" />
                            <span className="text-xs text-gray-700">{COL_LABELS[col]}</span>
                          </label>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button onClick={() => setColPickerOpen(false)} className="text-xs text-blue-600 hover:underline w-full text-right">Mbyll</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Row 1: identifikues ── */}
              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Nisja</span>
                  <input placeholder="TIA" value={listFilter.nisja}
                    onChange={e => setLF("nisja", e.target.value.toUpperCase())}
                    className="border rounded-lg px-2 py-1 text-xs font-mono uppercase w-16 bg-white focus:ring-2 ring-blue-300 outline-none" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Destinacion</span>
                  <input placeholder="MXP" value={listFilter.mberritja}
                    onChange={e => setLF("mberritja", e.target.value.toUpperCase())}
                    className="border rounded-lg px-2 py-1 text-xs font-mono uppercase w-16 bg-white focus:ring-2 ring-blue-300 outline-none" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">PNR</span>
                  <input placeholder="GRP-001" value={listFilter.pnr}
                    onChange={e => setLF("pnr", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs font-mono w-24 bg-white focus:ring-2 ring-blue-300 outline-none" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Kompania</span>
                  <input placeholder="Wizz..." value={listFilter.kompania}
                    onChange={e => setLF("kompania", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs w-24 bg-white focus:ring-2 ring-blue-300 outline-none" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Shteti</span>
                  <input placeholder="Itali" value={listFilter.country}
                    onChange={e => setLF("country", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs w-24 bg-white focus:ring-2 ring-blue-300 outline-none" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Statusi</span>
                  <select value={listFilter.status} onChange={e => setLF("status", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 ring-blue-300 outline-none">
                    <option value="">Të gjitha</option>
                    <option value="HOLD">HOLD</option>
                    <option value="WAITING">WAITING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="FLEX">FLEX</option>
                    <option value="CHANGE">CHANGE</option>
                    <option value="CANCELED">CANCELED</option>
                  </select>
                </div>
              </div>

              {/* ── Row 2: data & vende ── */}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Data Nisje (nga → deri)</span>
                  <div className="flex items-center gap-1">
                    <input type="date" value={listFilter.dateFrom} onChange={e => setLF("dateFrom", e.target.value)}
                      className="border rounded-lg px-1.5 py-1 text-xs bg-white focus:ring-2 ring-blue-300 outline-none" />
                    <span className="text-gray-400 text-xs">—</span>
                    <input type="date" value={listFilter.dateTo} onChange={e => setLF("dateTo", e.target.value)}
                      className="border rounded-lg px-1.5 py-1 text-xs bg-white focus:ring-2 ring-blue-300 outline-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Data Krijimi (nga → deri)</span>
                  <div className="flex items-center gap-1">
                    <input type="date" value={listFilter.purchaseDateFrom} onChange={e => setLF("purchaseDateFrom", e.target.value)}
                      className="border rounded-lg px-1.5 py-1 text-xs bg-white focus:ring-2 ring-purple-300 outline-none" />
                    <span className="text-gray-400 text-xs">—</span>
                    <input type="date" value={listFilter.purchaseDateTo} onChange={e => setLF("purchaseDateTo", e.target.value)}
                      className="border rounded-lg px-1.5 py-1 text-xs bg-white focus:ring-2 ring-purple-300 outline-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-gray-400 uppercase">Nr. Vende (min–max)</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} placeholder="min" value={listFilter.vendeMin} onChange={e => setLF("vendeMin", e.target.value)}
                      className="border rounded-lg px-2 py-1 text-xs w-16 bg-white focus:ring-2 ring-blue-300 outline-none" />
                    <span className="text-gray-400 text-xs">—</span>
                    <input type="number" min={0} placeholder="max" value={listFilter.vendeMax} onChange={e => setLF("vendeMax", e.target.value)}
                      className="border rounded-lg px-2 py-1 text-xs w-16 bg-white focus:ring-2 ring-blue-300 outline-none" />
                  </div>
                </div>
              </div>

              {/* ── Row 3: K1 K2 K3 filters ── */}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-blue-400 uppercase">K1</span>
                  <select value={listFilter.k1Status} onChange={e => setLF("k1Status", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 ring-blue-300 outline-none text-blue-700">
                    <option value="">Të gjitha</option>
                    <option value="paid">Paguar (K1 &gt; 0)</option>
                    <option value="unpaid">Pa paguar (K1 = 0)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-emerald-400 uppercase">K2</span>
                  <select value={listFilter.k2Status} onChange={e => setLF("k2Status", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 ring-emerald-300 outline-none text-emerald-700">
                    <option value="">Të gjitha</option>
                    <option value="paid">Paguar (K2 &gt; 0)</option>
                    <option value="unpaid">Pa paguar (K2 = 0)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold text-orange-400 uppercase">K3 (Detyrim)</span>
                  <select value={listFilter.k3Status} onChange={e => setLF("k3Status", e.target.value)}
                    className="border rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 ring-orange-300 outline-none text-orange-700">
                    <option value="">Të gjitha</option>
                    <option value="paid">Likuiduar (K3 = 0)</option>
                    <option value="unpaid">Me detyrim (K3 &gt; 0)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <div className="text-[9px] text-gray-400 italic">Klik kolonë → sort ↑↓</div>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground px-1">
              {isLoading ? "Duke ngarkuar..." : activeSearch && !searchLoading
                ? `${filteredTickets.length} grup${filteredTickets.length !== 1 ? "e" : ""} të gjetura (nga ${tickets.length} totale)`
                : hasActiveFilter
                  ? `${filteredTickets.length} nga ${tickets.length} grupe`
                  : `${tickets.length} grupe`}
            </div>

            <div className="border rounded-xl overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 select-none">
                    {vc("dtBlerje") && <TableHead className="text-xs whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort("purchaseDate")}>Dt Blerje<SortIcon f="purchaseDate" /></TableHead>}
                    {vc("pnr") && <TableHead className="text-xs whitespace-nowrap font-mono cursor-pointer hover:bg-gray-100" onClick={() => handleSort("pnr")}>PNR<SortIcon f="pnr" /></TableHead>}
                    <TableHead className="text-xs cursor-pointer hover:bg-gray-100" onClick={() => handleSort("departure")}>Nisja<SortIcon f="departure" /></TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-gray-100" onClick={() => handleSort("destination")}>Mberritja<SortIcon f="destination" /></TableHead>
                    <TableHead className="text-xs whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort("flightDate")}>Dt Nisja<SortIcon f="flightDate" /></TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort("totalSeats")}>Vende<SortIcon f="totalSeats" /></TableHead>
                    {vc("netoP") && <TableHead className="text-xs text-right whitespace-nowrap">Neto/P</TableHead>}
                    <TableHead className="text-xs text-right whitespace-nowrap cursor-pointer hover:bg-gray-100" onClick={() => handleSort("pricePerSeat")}>Neto Total<SortIcon f="pricePerSeat" /></TableHead>
                    <TableHead className="text-xs cursor-pointer hover:bg-gray-100" onClick={() => handleSort("status")}>Statusi<SortIcon f="status" /></TableHead>
                    {vc("dataFlex") && <TableHead className="text-xs whitespace-nowrap text-green-600">Data Flex</TableHead>}
                    {vc("k1") && <TableHead className="text-xs text-right text-blue-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("k1")}>K1<SortIcon f="k1" /></TableHead>}
                    {vc("k2") && <TableHead className="text-xs text-right text-emerald-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("k2")}>K2<SortIcon f="k2" /></TableHead>}
                    {vc("k3") && <TableHead className="text-xs text-right text-orange-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("k3")}>K3<SortIcon f="k3" /></TableHead>}
                    {vc("detyrim") && <TableHead className="text-xs text-right text-rose-600">Detyrim</TableHead>}
                    {vc("kompania") && <TableHead className="text-xs cursor-pointer hover:bg-gray-100" onClick={() => handleSort("airline")}>Kompania<SortIcon f="airline" /></TableHead>}
                    <TableHead className="text-xs cursor-pointer hover:bg-gray-100" onClick={() => handleSort("country")}>Shteti<SortIcon f="country" /></TableHead>
                    <TableHead className="text-xs text-right">Veprime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* ── Inline new-group row ─────────────────────────────── */}
                  {showNewRow && (() => {
                    const nrSeats = Number(newRow.totalSeats) || 0;
                    const nrTotal = Number(newRow.pricePerSeat) || 0;
                    const nrPP = nrSeats > 0 && nrTotal > 0 ? fmtM(nrTotal / nrSeats) : "—";
                    const nrK1 = nrTotal > 0 ? fmtM(nrTotal * 0.1) : "—";
                    const nrK2 = nrTotal > 0 ? fmtM(nrTotal * 0.2) : "—";
                    const nrK1val = newRow.installment1 !== "" ? Number(newRow.installment1) : 0;
                    const nrK2val = newRow.installment2 !== "" ? Number(newRow.installment2) : 0;
                    const nrK3 = nrTotal > 0 ? fmtM(nrTotal - nrK1val - nrK2val) : "—";
                    const inpCls = "w-full border border-blue-300 rounded px-1.5 py-1 text-xs bg-white focus:ring-2 ring-blue-400 outline-none";
                    return (
                      <TableRow className="bg-blue-50 border-b-2 border-blue-200" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNewRow(); } }}>
                        {vc("dtBlerje") && <TableCell className="py-1.5 px-2"><input type="date" value={newRow.purchaseDate} onChange={e => setNR("purchaseDate", e.target.value)} className={inpCls} style={{ minWidth: 110 }} /></TableCell>}
                        {vc("pnr") && <TableCell className="py-1.5 px-2"><input value={newRow.pnrOriginal} onChange={e => setNR("pnrOriginal", e.target.value)} placeholder="GRP-001" className={`${inpCls} font-mono w-24`} /></TableCell>}
                        <TableCell className="py-1.5 px-2"><input value={newRow.departure} onChange={e => setNR("departure", e.target.value.toUpperCase().slice(0,3))} placeholder="TIA" className={`${inpCls} uppercase font-bold text-indigo-700 w-14`} maxLength={3} /></TableCell>
                        <TableCell className="py-1.5 px-2"><input value={newRow.destination} onChange={e => setNR("destination", e.target.value.toUpperCase().slice(0,3))} placeholder="BLQ" className={`${inpCls} uppercase font-bold text-emerald-700 w-14`} maxLength={3} /></TableCell>
                        <TableCell className="py-1.5 px-2">
                          <div className="flex flex-col gap-0.5">
                            <input type="date" value={newRow.flightDate} onChange={e => setNR("flightDate", e.target.value)} className={inpCls} style={{ minWidth: 110 }} />
                            <input value={newRow.flightTime} onChange={e => setNR("flightTime", e.target.value)} placeholder="14:30" className={`${inpCls} w-20 text-gray-500`} />
                            <label className="flex items-center gap-1 cursor-pointer mt-0.5 select-none">
                              <input type="checkbox" checked={newRowRoundTrip} onChange={e => { setNewRowRoundTrip(e.target.checked); if (!e.target.checked) { setNR("returnFlightDate", ""); setNR("returnFlightTime", ""); } }} className="w-3 h-3 rounded accent-indigo-600" />
                              <span className="text-[10px] text-indigo-500 font-medium">↩ Vajtje-Ardhje</span>
                            </label>
                            {newRowRoundTrip && (
                              <div className="border-t border-dashed border-indigo-300 mt-0.5 pt-0.5">
                                <input type="date" value={newRow.returnFlightDate} onChange={e => setNR("returnFlightDate", e.target.value)} className={`${inpCls} text-indigo-600`} style={{ minWidth: 110 }} />
                                <input value={newRow.returnFlightTime} onChange={e => setNR("returnFlightTime", e.target.value)} placeholder="↩ ora" className={`${inpCls} w-20 text-indigo-400 mt-0.5`} />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right"><input type="number" value={newRow.totalSeats} onChange={e => setNR("totalSeats", e.target.value)} placeholder="40" className={`${inpCls} w-14 text-right`} min={0} /></TableCell>
                        {vc("netoP") && <TableCell className="text-right text-xs font-semibold text-indigo-700 px-2">{nrPP !== "—" ? `€${nrPP}` : "—"}</TableCell>}
                        <TableCell className="py-1.5 px-2 text-right"><input type="number" value={newRow.pricePerSeat} onChange={e => setNR("pricePerSeat", e.target.value)} placeholder="0" step="1" className={`${inpCls} w-20 text-right`} /></TableCell>
                        <TableCell className="py-1.5 px-2">
                          <select value={newRow.status} onChange={e => setNR("status", e.target.value)} className={`${inpCls} w-28`}>
                            <option value="">— Bosh</option>
                            <option value="HOLD">HOLD</option>
                            <option value="WAITING">WAITING</option>
                            <option value="CONFIRMED">CONFIRMED</option>
                            <option value="FLEX">FLEX</option>
                            <option value="CHANGE">CHANGE</option>
                            <option value="CANCELED">CANCELED</option>
                          </select>
                        </TableCell>
                        {vc("dataFlex") && <TableCell className="text-xs text-gray-300 px-2">—</TableCell>}
                        {vc("k1") && <TableCell className="py-1 px-1.5"><input type="number" step="1" value={newRow.installment1} onChange={e => setNR("installment1", e.target.value)} placeholder={nrK1 !== "—" ? nrK1 : ""} className={`${inpCls} w-20 text-right text-blue-600 placeholder:text-blue-300`} /></TableCell>}
                        {vc("k2") && <TableCell className="py-1 px-1.5"><input type="number" step="1" value={newRow.installment2} onChange={e => setNR("installment2", e.target.value)} placeholder={nrK2 !== "—" ? nrK2 : ""} className={`${inpCls} w-20 text-right text-emerald-600 placeholder:text-emerald-300`} /></TableCell>}
                        {vc("k3") && <TableCell className="py-1 px-1.5"><input type="number" step="1" value={newRow.installment3} onChange={e => setNR("installment3", e.target.value)} placeholder={nrK3 !== "—" ? nrK3 : ""} className={`${inpCls} w-20 text-right text-orange-600 placeholder:text-orange-300`} /></TableCell>}
                        {vc("kompania") && <TableCell className="py-1.5 px-2"><input value={newRow.airline} onChange={e => setNR("airline", e.target.value)} placeholder="WIZ" className={`${inpCls} w-16`} /></TableCell>}
                        <TableCell className="py-1.5 px-2"><input value={newRow.country} onChange={e => setNR("country", e.target.value)} placeholder="Itali..." className={`${inpCls} w-20`} /></TableCell>
                        <TableCell className="py-1.5 px-2">
                          <div className="flex gap-1 justify-end">
                            <button onClick={saveNewRow} disabled={savingNewRow || !newRow.departure || !newRow.destination || !newRow.flightDate} className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-40">
                              <Save className="h-3 w-3" />{savingNewRow ? "..." : "Ruaj"}
                            </button>
                            <button onClick={() => { setShowNewRow(false); setNewRow(EMPTY_NEW_ROW); setNewRowRoundTrip(false); }} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                  {(isLoading || (activeSearch && searchLoading)) ? (
                    <TableRow><TableCell colSpan={20} className="text-center py-10 text-muted-foreground flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin inline mr-2" />Duke kërkuar...</TableCell></TableRow>
                  ) : filteredTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={20} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Layers className="h-8 w-8 text-gray-300" />
                          <p>{activeSearch ? `Asnjë grup nuk u gjet për ${activeSearch.from} → ${activeSearch.to}, ${activeSearch.date}.` : hasActiveFilter ? "Asnjë grup nuk përputhet me filtrat." : "Nuk ka grupe të krijuara."}</p>
                          {!hasActiveFilter && !activeSearch && (
                            <button onClick={() => { setShowNewRow(true); }} className="text-blue-600 text-sm hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Krijo grupin e parë</button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredTickets.map((ticket: any) => {
                    const cs = COLOR_STYLES[ticket.color] ?? COLOR_STYLES.ORANGE;
                    const { totalPrice, k1, k2, k3, k3Suggested, detyrim, k1IsDefault, k2IsDefault, k3IsDefault } = calcRow(ticket);
                    const isEditing = editingId === ticket.id;
                    const inpE = "w-full border border-amber-300 rounded px-1.5 py-1 text-xs bg-white focus:ring-2 ring-amber-400 outline-none";

                    if (isEditing) {
                      const erSeats = Number(editRowData.totalSeats) || 0;
                      const erTotal = Number(editRowData.pricePerSeat) || 0;
                      const erPP = erSeats > 0 && erTotal > 0 ? fmtM(erTotal / erSeats) : "—";
                      const erK1 = erTotal > 0 ? fmtM(erTotal * 0.1) : "—";
                      const erK2 = erTotal > 0 ? fmtM(erTotal * 0.2) : "—";
                      const erK1val = editRowData.installment1 !== "" ? Number(editRowData.installment1) : 0;
                      const erK2val = editRowData.installment2 !== "" ? Number(editRowData.installment2) : 0;
                      const erK3 = erTotal > 0 ? fmtM(erTotal - erK1val - erK2val) : "—";
                      const erK3suggest = erTotal > 0 ? fmtM(erTotal - erK1val - erK2val) : "0.00";
                      return (
                        <TableRow key={ticket.id} className="bg-amber-50 border-b-2 border-amber-300" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditRow(); } }}>
                          {vc("dtBlerje") && <TableCell className="py-1.5 px-2"><input type="date" value={editRowData.purchaseDate} onChange={e => setER("purchaseDate", e.target.value)} className={inpE} style={{ minWidth: 110 }} /></TableCell>}
                          {vc("pnr") && <TableCell className="py-1.5 px-2"><input value={editRowData.pnrOriginal} onChange={e => setER("pnrOriginal", e.target.value)} placeholder="GRP-001" className={`${inpE} font-mono w-24`} /></TableCell>}
                          <TableCell className="py-1.5 px-2"><input value={editRowData.departure} onChange={e => setER("departure", e.target.value.toUpperCase().slice(0,3))} className={`${inpE} uppercase font-bold text-indigo-700 w-14`} maxLength={3} /></TableCell>
                          <TableCell className="py-1.5 px-2"><input value={editRowData.destination} onChange={e => setER("destination", e.target.value.toUpperCase().slice(0,3))} className={`${inpE} uppercase font-bold text-emerald-700 w-14`} maxLength={3} /></TableCell>
                          <TableCell className="py-1.5 px-2">
                            <div className="flex flex-col gap-0.5">
                              <input type="date" value={editRowData.flightDate} onChange={e => setER("flightDate", e.target.value)} className={inpE} style={{ minWidth: 110 }} />
                              <input value={editRowData.flightTime} onChange={e => setER("flightTime", e.target.value)} placeholder="14:30" className={`${inpE} w-20 text-gray-500`} />
                              <div className="border-t border-dashed border-indigo-200 mt-0.5 pt-0.5">
                                <input type="date" value={editRowData.returnFlightDate ?? ""} onChange={e => setER("returnFlightDate", e.target.value)} className={`${inpE} text-indigo-600`} style={{ minWidth: 110 }} />
                                <input value={editRowData.returnFlightTime ?? ""} onChange={e => setER("returnFlightTime", e.target.value)} placeholder="↩ ora" className={`${inpE} w-20 text-indigo-400 mt-0.5`} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-right"><input type="number" value={editRowData.totalSeats} onChange={e => setER("totalSeats", e.target.value)} placeholder="40" className={`${inpE} w-14 text-right`} min={0} /></TableCell>
                          {vc("netoP") && <TableCell className="text-right text-xs font-semibold text-indigo-700 px-2">{erPP !== "—" ? `€${erPP}` : "—"}</TableCell>}
                          <TableCell className="py-1.5 px-2 text-right"><input type="number" value={editRowData.pricePerSeat} onChange={e => setER("pricePerSeat", e.target.value)} placeholder="0" step="1" className={`${inpE} w-20 text-right`} /></TableCell>
                          <TableCell className="py-1.5 px-2">
                            <select value={editRowData.status} onChange={e => setER("status", e.target.value)} className={`${inpE} w-28`}>
                              <option value="">— Bosh</option>
                              <option value="HOLD">HOLD</option>
                              <option value="WAITING">WAITING</option>
                              <option value="CONFIRMED">CONFIRMED</option>
                              <option value="FLEX">FLEX</option>
                              <option value="CHANGE">CHANGE</option>
                              <option value="CANCELED">CANCELED</option>
                            </select>
                          </TableCell>
                          {vc("dataFlex") && <TableCell className="text-xs text-gray-300 px-2">—</TableCell>}
                          {vc("k1") && <TableCell className="py-1.5 px-1.5">
                            <input type="number" step="1" value={editRowData.installment1} onChange={e => setER("installment1", e.target.value)} placeholder={erK1 !== "—" ? erK1 : "0"} className={`${inpE} w-20 text-right text-blue-600`} />
                          </TableCell>}
                          {vc("k2") && <TableCell className="py-1.5 px-1.5">
                            <input type="number" step="1" value={editRowData.installment2} onChange={e => setER("installment2", e.target.value)} placeholder={erK2 !== "—" ? erK2 : "0"} className={`${inpE} w-20 text-right text-emerald-600`} />
                          </TableCell>}
                          {vc("k3") && <TableCell className="py-1.5 px-1.5">
                            <input type="number" step="1" value={editRowData.installment3 ?? ""} onChange={e => setER("installment3", e.target.value)} placeholder={erK3suggest} className={`${inpE} w-20 text-right text-orange-600`} />
                          </TableCell>}
                          {vc("kompania") && <TableCell className="py-1.5 px-2"><input value={editRowData.airline} onChange={e => setER("airline", e.target.value)} placeholder="WIZ" className={`${inpE} w-16`} /></TableCell>}
                          <TableCell className="py-1.5 px-2"><input value={editRowData.country ?? ""} onChange={e => setER("country", e.target.value)} placeholder="Itali..." className={`${inpE} w-20`} /></TableCell>
                          <TableCell className="py-1.5 px-2">
                            <div className="flex gap-1 justify-end">
                              <button onClick={saveEditRow} disabled={savingEditRow} className="flex items-center gap-1 px-2 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600 disabled:opacity-40">
                                <Save className="h-3 w-3" />{savingEditRow ? "..." : "Ruaj"}
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const isPartialMatch = activeSearch && searchResultMap.get(ticket.id) === "partial";
                    const isFullMatch   = activeSearch && searchResultMap.get(ticket.id) === "full";
                    return (
                      <TableRow key={ticket.id} className={`${isPartialMatch ? "opacity-75 border-l-4 border-red-300 bg-red-50/30" : isFullMatch ? "bg-green-50 border-l-4 border-green-400" : cs.row} text-sm`}>
                        {vc("dtBlerje") && <TableCell className="text-xs text-gray-500 whitespace-nowrap">{ticket.purchaseDate ?? "—"}</TableCell>}
                        {vc("pnr") && <TableCell className="text-xs font-mono text-gray-600 whitespace-nowrap">{ticket.pnrOriginal ?? "—"}</TableCell>}
                        <TableCell className="font-bold text-indigo-700">{ticket.departure}</TableCell>
                        <TableCell className="font-bold text-emerald-700">{ticket.destination}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col leading-tight gap-0.5">
                            <span className="font-medium">{ticket.flightDate}</span>
                            {ticket.flightTime && <span className="text-gray-400 text-[10px]">{fmtAmPm(ticket.flightTime)}</span>}
                            {ticket.returnFlightDate && (
                              <>
                                <span className="text-[9px] text-indigo-400 font-semibold mt-0.5">↩ {ticket.returnFlightDate}</span>
                                {ticket.returnFlightTime && <span className="text-gray-400 text-[10px]">{fmtAmPm(ticket.returnFlightTime)}</span>}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-gray-700">{ticket.totalSeats != null ? ticket.totalSeats : "—"}</TableCell>
                        {vc("netoP") && <TableCell className="text-right text-xs font-semibold text-indigo-700">
                          {ticket.pricePerSeat != null && ticket.totalSeats ? `€${fmtM(Number(ticket.pricePerSeat) / Number(ticket.totalSeats))}` : "—"}
                        </TableCell>}
                        <TableCell className="text-right text-xs font-bold text-gray-700">{totalPrice > 0 ? `€${fmtM(totalPrice)}` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[ticket.status ?? ""] ?? "bg-gray-100 text-gray-400 border-gray-200"}`}>
                            {STATUS_LABELS[ticket.status ?? ""] ?? ticket.status ?? "—"}
                          </Badge>
                        </TableCell>
                        {vc("dataFlex") && <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {ticket.status === "CHANGE" && ticket.flightDate && isValid(parseISO(ticket.flightDate)) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-green-700 font-semibold">
                                  {format(subDays(parseISO(ticket.flightDate), Number(ticket.dateFlexBack ?? 14)), "dd/MM/yy")}
                                  {" → "}
                                  {format(addDays(parseISO(ticket.flightDate), Number(ticket.dateFlexForward ?? 30)), "dd/MM/yy")}
                                </span>
                                {ticket.returnFlightDate && isValid(parseISO(ticket.returnFlightDate)) && (
                                  <span className="text-indigo-600 font-semibold">
                                    {"↩ "}
                                    {format(subDays(parseISO(ticket.returnFlightDate), Number(ticket.dateFlexBack ?? 14)), "dd/MM/yy")}
                                    {" → "}
                                    {format(addDays(parseISO(ticket.returnFlightDate), Number(ticket.dateFlexForward ?? 30)), "dd/MM/yy")}
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                            {(() => {
                              const EXCLUDE = ["TIA","PRN","TGD","OHD","SKP"];
                              const alts = (destAltsMap.get(ticket.destination) ?? []).filter(a => !EXCLUDE.includes(a));
                              if (alts.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-0.5">
                                  {alts.map(a => (
                                    <span key={a} className="text-[9px] font-mono font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1 py-0.5 leading-none">{a}</span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </TableCell>}
                        {vc("k1") && <TableCell className="text-right px-1.5">
                          {!k1IsDefault && k1 > 0 ? (
                            <span className="inline-block text-xs font-mono font-bold bg-blue-100 text-blue-700 border border-blue-300 rounded-md px-2 py-0.5">€{fmtM(k1)}</span>
                          ) : k1 > 0 ? (
                            <span className="text-xs font-mono text-blue-300">{fmtM(k1)}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </TableCell>}
                        {vc("k2") && <TableCell className="text-right px-1.5">
                          <div className="flex flex-col items-end gap-0.5">
                            {!k2IsDefault && k2 > 0 ? (
                              <span className="inline-block text-xs font-mono font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-md px-2 py-0.5">€{fmtM(k2)}</span>
                            ) : k2 > 0 ? (
                              <span className="text-xs font-mono text-emerald-300">{fmtM(k2)}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                            {ticket.flightDate && isValid(parseISO(ticket.flightDate)) && (
                              <span className="text-gray-400 text-[9px] leading-none">{format(subDays(parseISO(ticket.flightDate), 60), "dd/MM/yy")}</span>
                            )}
                          </div>
                        </TableCell>}
                        {vc("k3") && <TableCell className="text-right px-1.5">
                          <div className="flex flex-col items-end gap-0.5">
                            {!k3IsDefault && k3 > 0 ? (
                              <span className="inline-block text-xs font-mono font-bold bg-orange-100 text-orange-700 border border-orange-300 rounded-md px-2 py-0.5">€{fmtM(k3)}</span>
                            ) : k3 > 0 ? (
                              <span className="text-xs font-mono text-orange-300" title={`Sugjeruar: Total − K1 − K2 = €${fmtM(k3Suggested)}`}>{fmtM(k3)}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                            {ticket.flightDate && isValid(parseISO(ticket.flightDate)) && (
                              <span className="text-gray-400 text-[9px] leading-none">{format(subDays(parseISO(ticket.flightDate), 30), "dd/MM/yy")}</span>
                            )}
                          </div>
                        </TableCell>}
                        {vc("detyrim") && <TableCell className="text-right px-1.5">
                          {detyrim === 0 ? (
                            <span className="inline-block text-xs font-bold bg-green-100 text-green-700 border border-green-300 rounded-md px-2 py-0.5 tracking-wide">PAID</span>
                          ) : detyrim < 0 ? (
                            <span className="text-xs font-mono font-bold text-red-500">{fmtM(detyrim)}</span>
                          ) : (
                            <span className="text-xs font-mono font-bold text-rose-600" title="Total − K1 − K2 − K3">€{fmtM(detyrim)}</span>
                          )}
                        </TableCell>}
                        {vc("kompania") && <TableCell className="text-xs text-gray-600 font-medium">{ticket.airline ?? "—"}</TableCell>}
                        <TableCell className="text-xs text-gray-600 font-medium">{ticket.country ?? "—"}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setCommentsModal({ open: true, ticketId: ticket.id })}
                              className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                (ticket.comments?.length ?? 0) > 0
                                  ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300"
                                  : "text-gray-500 bg-gray-50 hover:bg-amber-50 hover:text-amber-700 border-gray-200"
                              }`}
                              title="Komente për grupin"
                            >
                              <FileText className="h-3 w-3" /> Komente
                              {(ticket.comments?.length ?? 0) > 0 && (
                                <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                                  {ticket.comments.length}
                                </span>
                              )}
                            </button>
                            <button onClick={() => { setShowNewRow(false); startEdit(ticket); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600" title="Edito"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteConfirm({ type: "group", id: ticket.id })} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600" title="Fshi"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ── Footer totalet ──────────────────────────────────────────── */}
            {filteredTickets.length > 0 && (
              <div className="border rounded-xl bg-gray-50 px-4 py-3 space-y-2">
                {/* Header info */}
                <div className="flex flex-wrap gap-5 items-center">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[110px]">Totale ({filteredTickets.length} grupe)</span>
                  <div className="flex flex-wrap gap-5">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Nr. Vende</span>
                      <span className="text-base font-bold text-gray-800">{totals.vende}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200 self-center" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Çmimi Total</span>
                      <span className="text-base font-bold text-gray-800">€{fmtM(totals.total)}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200 self-center" />
                    {/* K3 detyrim — always real */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-semibold text-orange-400 uppercase">K3 (Detyrim)</span>
                      <span className={`text-base font-bold ${totals.detyrim < 0 ? "text-red-500" : totals.detyrim === 0 ? "text-green-600" : "text-orange-600"}`}>€{fmtM(totals.detyrim)}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-2 flex flex-wrap gap-4">
                  {/* PAGUAR row */}
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">✓ Paguar</span>
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-semibold text-blue-400 uppercase">K1</span>
                        <span className="text-sm font-bold text-blue-600">€{fmtM(totals.paidK1)}</span>
                      </div>
                      <div className="w-px h-6 bg-green-200 self-center" />
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-semibold text-emerald-400 uppercase">K2</span>
                        <span className="text-sm font-bold text-emerald-600">€{fmtM(totals.paidK2)}</span>
                      </div>
                    </div>
                  </div>
                  {/* WAITING row */}
                  {(totals.waitK1 > 0 || totals.waitK2 > 0) && (
                    <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
                      <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wide">⏳ Waiting</span>
                      <div className="flex gap-3">
                        {totals.waitK1 > 0 && (
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-semibold text-blue-300 uppercase">K1 sug.</span>
                            <span className="text-sm font-bold text-blue-300">€{fmtM(totals.waitK1)}</span>
                          </div>
                        )}
                        {totals.waitK1 > 0 && totals.waitK2 > 0 && <div className="w-px h-6 bg-yellow-200 self-center" />}
                        {totals.waitK2 > 0 && (
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-semibold text-emerald-300 uppercase">K2 sug.</span>
                            <span className="text-sm font-bold text-emerald-300">€{fmtM(totals.waitK2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ KRIJO / EDITO TAB ═══ */}
      {activeTab === "create" && (
        <div className="py-2">
          <KrijoGrupForm
            editGroup={editingGroup ?? undefined}
            onSuccess={() => { setEditingGroup(null); setActiveTab("list"); }}
            onCancel={() => { setEditingGroup(null); setActiveTab("list"); }}
          />
        </div>
      )}

      {/* Airport Alternatives Tab */}
      {activeTab === "airports" && <AirportAlternativesTab />}

      {/* ═══ MENAXHIMI TAB — full management ═══ */}
      {activeTab === "manage" && <>

      {/* ── Kërko Grup (live) — i fshehur në embed mode ─────────────────── */}
      {!embedOnlyMode && (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" /> Kërko Grup sipas Destinacionit
            {searchLoading && <RefreshCw className="h-3 w-3 animate-spin ml-1 text-blue-400" />}
          </span>
          {activeSearch && (
            <button onClick={() => { setActiveSearch(null); setSrchForm({ from: "", to: "", date: "", persons: "1" }); }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X className="h-3 w-3" /> Pastro
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase">Nisja</label>
            <input className="border rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase bg-white w-[80px] focus:ring-2 ring-blue-300 outline-none" placeholder="TIA" value={srchForm.from} maxLength={5} onChange={e => setSrchForm(s => ({ ...s, from: e.target.value.toUpperCase() }))} />
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400 mb-1 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase">Mberritja</label>
            <input className="border rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase bg-white w-[80px] focus:ring-2 ring-blue-300 outline-none" placeholder="BGY" value={srchForm.to} maxLength={5} onChange={e => setSrchForm(s => ({ ...s, to: e.target.value.toUpperCase() }))} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-0.5"><CalendarDays className="h-3 w-3" />Data</label>
            <input type="date" className="border rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 ring-blue-300 outline-none" value={srchForm.date} onChange={e => setSrchForm(s => ({ ...s, date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-0.5"><Users className="h-3 w-3" />Persona</label>
            <input type="number" min={1} className="border rounded-lg px-2.5 py-1.5 text-sm bg-white w-[70px] focus:ring-2 ring-blue-300 outline-none" value={srchForm.persons} onChange={e => setSrchForm(s => ({ ...s, persons: e.target.value }))} />
          </div>
        </div>
        {/* Compact summary — results are shown directly in the table below */}
        {activeSearch && (
          <div className="text-xs flex items-center gap-2 pt-0.5">
            {searchLoading ? (
              <span className="text-blue-500 flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Duke kërkuar...</span>
            ) : (() => {
              const full = (searchResults as any[]).filter(g => g.matchType === "full").length;
              const partial = (searchResults as any[]).filter(g => g.matchType === "partial").length;
              if (full === 0 && partial === 0) return <span className="text-red-500">Asnjë grup nuk u gjet — {activeSearch.from} → {activeSearch.to}, {activeSearch.date}</span>;
              return (
                <span className="text-blue-700">
                  {full > 0 && <span className="font-semibold text-emerald-700">{full} grup{full !== 1 ? "e" : ""} të mundura</span>}
                  {full > 0 && partial > 0 && <span className="text-gray-400"> · </span>}
                  {partial > 0 && <span className="font-semibold text-red-500">{partial} alternativ{partial !== 1 ? "e" : "ë"} të paplotë</span>}
                  <span className="text-gray-400"> — shfaqen në tabelë poshtë</span>
                </span>
              );
            })()}
          </div>
        )}
      </div>
      )}

      {/* Filters — i fshehur në embed mode */}
      {!embedOnlyMode && (
          <div className="page-filter-panel bg-card border rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[200px] flex-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input placeholder="PNR, Nisja, Destinacioni, Kompania..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground" />
            {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Të gjitha statuset</option>
              <option value="HOLD">HOLD</option>
              <option value="WAITING">WAITING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="FLEX">FLEX</option>
              <option value="CHANGE">CHANGE</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Të gjitha ngjyrat</option>
              <option value="ORANGE">🟠 Orange</option>
              <option value="GREEN">🟢 Green</option>
              <option value="RED">🔴 Red</option>
              <option value="BLUE">🔵 Blue</option>
            </select>
          </div>
          {(statusFilter || colorFilter || search) && (
            <button onClick={() => { setStatusFilter(""); setColorFilter(""); setSearch(""); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-3.5 w-3.5" /> Pastro
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground px-1">
          {isLoading ? "Duke ngarkuar..." : `${filtered.length} grupe`}
        </div>
      </div>
      )}

      {/* Table */}
      <div className="border rounded-xl">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-6"></TableHead>
              <TableHead>DEPA</TableHead>
              <TableHead>DEST</TableHead>
              <TableHead>PNR</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ora</TableHead>
              <TableHead className="text-center">Tot / Shit / Mbetur</TableHead>
              <TableHead className="text-right">Çmimi</TableHead>
              <TableHead>Statusi</TableHead>
              <TableHead className="whitespace-nowrap text-green-600 text-xs">Data Flex</TableHead>
              <TableHead>Alternativat</TableHead>
              <TableHead className="text-right">Veprime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={13} className="text-center py-10 text-muted-foreground">Duke ngarkuar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={13} className="text-center py-10 text-muted-foreground">Nuk ka grupe biletash.</TableCell></TableRow>
            ) : (() => {
              // index of first partial match (for separator row)
              const firstPartialIdx = activeSearch
                ? filtered.findIndex((t: any) => searchResultMap.get(t.id) === "partial")
                : -1;
              return filtered.map((ticket: any, ticketIdx: number) => {
                const cs = COLOR_STYLES[ticket.color] ?? COLOR_STYLES.ORANGE;
                const isExpanded = expandedIds.has(ticket.id);
                const isPartialMatch = activeSearch && searchResultMap.get(ticket.id) === "partial";
                const isFullMatch   = activeSearch && searchResultMap.get(ticket.id) === "full";
                const partialReasons = isPartialMatch ? getPartialReasons(ticket.id) : [];
                const showSeparator = activeSearch && ticketIdx === firstPartialIdx && firstPartialIdx > 0;
                // Auto dot color based on payment installments
                const _tTotal = Number(ticket.pricePerSeat) || 0;
                const _tK1 = ticket.installment1 != null ? Number(ticket.installment1) : 0;
                const _tK2 = ticket.installment2 != null ? Number(ticket.installment2) : 0;
                const _tK3 = Math.max(0, _tTotal - _tK1 - _tK2);
                const autoDotCls = _tTotal > 0 && _tK3 <= 0
                  ? "bg-green-500"
                  : ticket.installment2 != null
                    ? "bg-orange-200 border border-orange-300"
                    : ticket.installment1 != null
                      ? "bg-orange-400"
                      : cs.dot;
                return (
                  <React.Fragment key={ticket.id}>
                    {/* ── Separator row before first partial ── */}
                    {showSeparator && (
                      <TableRow key={`sep-${ticket.id}`}>
                        <TableCell colSpan={13} className="py-1.5 px-4 bg-orange-50 border-y border-orange-200">
                          <span className="text-[11px] font-medium text-orange-600 flex items-center gap-1.5">
                            <span className="text-orange-500">⊗</span>
                            Këto grupe kanë aeroportin alternativ por nuk plotësojnë të gjitha kriteret
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* ── Group row ── */}
                    <TableRow
                      id={`group-row-${ticket.id}`}
                      className={`${isPartialMatch ? "opacity-70 bg-red-50/40 border-l-4 border-red-300" : isFullMatch ? "bg-green-50 border-l-4 border-green-400" : cs.row} ${highlightTicketId === ticket.id ? "!bg-yellow-200 ring-2 ring-yellow-400 ring-offset-1" : ""} cursor-pointer hover:brightness-95 transition-all`}
                      onClick={() => toggleExpand(ticket.id)}
                    >
                      <TableCell className="py-2 pl-3 pr-1">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-500" />
                          : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell className="px-1">
                        <span className={`inline-block w-3 h-3 rounded-full ${autoDotCls}`} />
                      </TableCell>
                      <TableCell className="font-bold text-sm">{ticket.departure}</TableCell>
                      <TableCell className="font-bold text-sm">{ticket.destination}</TableCell>
                      <TableCell><span className="font-mono text-xs font-bold tracking-wider">{ticket.pnrOriginal}</span></TableCell>
                      <TableCell className="text-sm text-gray-600">{ticket.flightDate}</TableCell>
                      <TableCell className="text-sm text-gray-500">{fmtAmPm(ticket.flightTime) || "—"}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-mono">
                          <span className="font-bold text-gray-800">{ticket.totalSeats}</span>
                          <span className="text-gray-400"> / </span>
                          <span className="font-bold text-green-600">{ticket.seatsSoldTotal}</span>
                          <span className="text-gray-400"> / </span>
                          <span className={`font-bold ${ticket.seatsRemaining === 0 ? "text-red-500" : "text-blue-600"}`}>{ticket.seatsRemaining}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {ticket.pricePerSeat != null && ticket.totalSeats
                          ? `€${fmtM(Number(ticket.pricePerSeat) / Number(ticket.totalSeats))}/p`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[ticket.status ?? ""] ?? "bg-gray-100 text-gray-400 border-gray-200"}`}>
                          {STATUS_LABELS[ticket.status ?? ""] ?? ticket.status ?? "—"}
                        </Badge>
                      </TableCell>
                      {/* Data Flex column */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {ticket.status === "CHANGE" && ticket.flightDate && isValid(parseISO(ticket.flightDate)) ? (
                          <span className="text-green-700 font-semibold flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 text-green-500 shrink-0" />
                            {format(subDays(parseISO(ticket.flightDate), Number(ticket.dateFlexBack ?? 14)), "dd/MM/yy")}
                            {" → "}
                            {format(addDays(parseISO(ticket.flightDate), Number(ticket.dateFlexForward ?? 30)), "dd/MM/yy")}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const alts = destAltsMap.get(ticket.destination) ?? [];
                            if (alts.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 text-xs text-indigo-600 flex-wrap">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {alts.join(", ")}
                              </div>
                            );
                          })()}
                          {partialReasons.map((reason, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                              ✕ {reason}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setCommentsModal({ open: true, ticketId: ticket.id })}
                            className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              (ticket.comments?.length ?? 0) > 0
                                ? "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300"
                                : "text-gray-500 bg-gray-50 hover:bg-amber-50 hover:text-amber-700 border-gray-200"
                            }`}
                            title="Komente për grupin"
                          >
                            <FileText className="h-3 w-3" /> Komente
                            {(ticket.comments?.length ?? 0) > 0 && (
                              <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                                {ticket.comments.length}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => setExpandedIds(prev => { const s = new Set(prev); s.has(ticket.id) ? s.delete(ticket.id) : s.add(ticket.id); return s; })}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                            title="Shto shitje"
                          >
                            <Plus className="h-3 w-3" /> Shitje
                          </button>
                          <button onClick={() => setDeleteConfirm({ type: "group", id: ticket.id })} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600" title="Fshi grup"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* ── Expanded panel ── */}
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={13} className="p-0">
                          <ExpandedPanel
                            ticket={ticket}
                            onEditSale={sale => setEditSaleModal({ open: true, groupId: ticket.id, sale })}
                            onDeleteSale={saleId => setDeleteConfirm({ type: "sale", id: saleId, groupId: ticket.id })}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              });
            })()}
          </TableBody>
        </Table>
      </div>

      </>}

      {/* Modals */}
      {editSaleModal.open && editSaleModal.groupId && (
        <EditSaleModal groupId={editSaleModal.groupId} sale={editSaleModal.sale} onClose={() => setEditSaleModal({ open: false })} onSaved={refetch} />
      )}
      {importModal && (
        <ImportModal onClose={() => setImportModal(false)} onDone={refetch} />
      )}

      {/* Comments modal — shown for the selected group */}
      {commentsModal.open && commentsModal.ticketId != null && (() => {
        const t = (tickets as any[]).find(x => x.id === commentsModal.ticketId);
        if (!t) return null;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCommentsModal({ open: false })}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-gray-700">
                    Komente — {t.departure} → {t.destination} <span className="text-gray-400 font-normal">· {t.flightDate} · {t.pnrOriginal}</span>
                  </h3>
                </div>
                <button onClick={() => setCommentsModal({ open: false })} className="p-1 rounded hover:bg-gray-100" title="Mbyll">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="p-4">
                <GroupCommentsThread ticket={t} onChanged={refetch} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold mb-1">Konfirmo Fshirjen</h3>
            <p className="text-sm text-gray-500 mb-4">
              {deleteConfirm.type === "group"
                ? "A jeni i sigurt? Të gjitha shitjet do të fshihen gjithashtu."
                : "A jeni i sigurt që doni të fshini këtë shitje?"}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Anulo</Button>
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Duke fshirë..." : "Fshi"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
