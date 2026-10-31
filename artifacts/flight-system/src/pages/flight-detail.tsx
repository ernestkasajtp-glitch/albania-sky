import { useState, useEffect, useRef } from "react";
import { fmtM, fmtAmPm } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { useRoute, useSearch } from "wouter";
import { format } from "date-fns";
import { useGetFlight, useListBookings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GooglePriceAdminUpdater } from "@/components/GooglePriceAdminUpdater";
import { GoogleMonitoringToggle, GoogleMonitoringBadge } from "@/components/GoogleMonitoringToggle";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAgencyGroups } from "@/components/AgencyGroups";
import { FlightGroupBadges } from "@/components/FlightGroupBadges";
import { FlightDiscountEditor } from "@/components/FlightDiscountEditor";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export default function FlightDetail() {
  const [, params] = useRoute("/flights/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const search = useSearch();
  const openedEditFor = useRef<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const groupsQuery = useAgencyGroups(user?.role === "admin");

  const { data: flight, isLoading: isLoadingFlight } = useGetFlight(id, { query: { enabled: !!id } as any });
  const { data: bookings, isLoading: isLoadingBookings } = useListBookings({ flightId: id }, { query: { enabled: !!id } as any });

  const openEdit = () => {
    if (!flight) return;
    setEditFields({
      totalSeats: String(flight.totalSeats ?? ""),
      adultPrice: flight.adultPrice != null ? String(Math.round(Number(flight.adultPrice))) : "",
      childPrice: flight.childPrice != null ? String(Math.round(Number(flight.childPrice))) : "",
      infantPrice: flight.infantPrice != null ? String(Math.round(Number(flight.infantPrice))) : "",
      checkedBaggagePrice: (flight as any).checkedBaggagePrice != null ? String(Math.round(Number((flight as any).checkedBaggagePrice))) : "",
      priorityBoardingPrice: (flight as any).priorityBoardingPrice != null ? String(Math.round(Number((flight as any).priorityBoardingPrice))) : "",
    });
    setEditOpen(true);
  };

  useEffect(() => {
    if (flight && new URLSearchParams(search).get("edit") === "1" && openedEditFor.current !== id) {
      openedEditFor.current = id;
      openEdit();
    }
  }, [flight, id, search]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      const num = (v: string) => {
        const n = parseFloat(v);
        return isNaN(n) ? undefined : Math.round(n);
      };
      if (editFields.totalSeats !== "") body.totalSeats = parseInt(editFields.totalSeats);
      if (editFields.adultPrice !== "") body.adultPrice = num(editFields.adultPrice);
      if (editFields.childPrice !== "") body.childPrice = num(editFields.childPrice);
      if (editFields.infantPrice !== "") body.infantPrice = num(editFields.infantPrice);
      if (editFields.checkedBaggagePrice !== "") body.checkedBaggagePrice = num(editFields.checkedBaggagePrice);
      if (editFields.priorityBoardingPrice !== "") body.priorityBoardingPrice = num(editFields.priorityBoardingPrice);

      const resp = await fetch(`${API_BASE}/flights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errMsg = await resp.text().catch(() => "");
        alert(`Gabim gjatë ruajtjes: ${resp.status} ${errMsg}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/flights/${id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/flights"] });
      setEditOpen(false);
    } catch (err: any) {
      alert(`Gabim rrjeti: ${err?.message ?? "i panjohur"}`);
    } finally {
      setSaving(false);
    }
  };

  if (isLoadingFlight) return <div className="p-8 text-center">Duke ngarkuar...</div>;
  if (!flight) return <div className="p-8 text-center text-destructive">Fluturimi nuk u gjet</div>;

  const occupancyRate = (flight.soldSeats / flight.totalSeats) * 100;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Flight {fmtFlightNum(flight.flightNumber)}
            {(flight as any).googleMonitoringDisabled && <GoogleMonitoringBadge />}
            <span
              title="Kodi i fluturimit në sistem"
              className="font-mono text-sm font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5"
            >
              #{flight.id}
            </span>
          </h1>
          <p className="text-muted-foreground">{flight.airline} • {flight.fromCity} to {flight.toCity}</p>
          {user?.role === "admin" && <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">Grupet:</span>
            <FlightGroupBadges flight={flight} groups={groupsQuery.data} isLoading={groupsQuery.isPending} error={groupsQuery.error} />
          </div>}
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && <GoogleMonitoringToggle flightId={id} disabled={!!(flight as any).googleMonitoringDisabled} />}
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-1.5" /> Ndrysho Çmim / Vende
          </Button>
          <Badge className={`text-white ${flight.status === "open" ? "bg-green-500" : "bg-gray-500"}`}>
            {flight.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nisja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{format(new Date(flight.departureDate), "MMM dd, yyyy")}</div>
            <p className="text-xs text-muted-foreground">{fmtAmPm(flight.departureTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mbërritja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flight.arrivalDate ? format(new Date(flight.arrivalDate), "MMM dd, yyyy") : "—"}</div>
            <p className="text-xs text-muted-foreground">{fmtAmPm(flight.arrivalTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flight.soldSeats} / {flight.totalSeats}</div>
            <Progress value={occupancyRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Prices summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Çmimet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div><span className="text-muted-foreground">I rritur:</span> <span className="font-semibold">€{fmtM(flight.adultPrice)}</span></div>
            <div><span className="text-muted-foreground">Fëmijë:</span> <span className="font-semibold">€{fmtM(flight.childPrice)}</span></div>
            <div><span className="text-muted-foreground">Foshnjë:</span> <span className="font-semibold">€{fmtM(flight.infantPrice)}</span></div>
            {(flight as any).checkedBaggagePrice && <div><span className="text-muted-foreground">Bagazh{(flight as any).checkedBaggageKg ? ` ${Number((flight as any).checkedBaggageKg)}kg` : ""}:</span> <span className="font-semibold">€{fmtM((flight as any).checkedBaggagePrice)}</span></div>}
            {(flight as any).priorityBoardingPrice && <div><span className="text-muted-foreground">Priority 10kg:</span> <span className="font-semibold">€{fmtM((flight as any).priorityBoardingPrice)}</span></div>}
          </div>
          <div className="mt-3 max-w-sm">
            {!(flight as any).googleMonitoringDisabled && <GooglePriceAdminUpdater flightId={id} onUpdated={() => queryClient.invalidateQueries()} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rezervimet e këtij Fluturimi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Klienti</TableHead>
                <TableHead>Statusi</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingBookings ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4">Duke ngarkuar...</TableCell></TableRow>
              ) : bookings?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4">Nuk ka rezervime.</TableCell></TableRow>
              ) : (
                bookings?.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell><button onClick={() => setSelectedBookingId(booking.id)} className="text-primary hover:underline font-mono">{booking.bookingRef}</button></TableCell>
                    <TableCell>{booking.customerName}</TableCell>
                    <TableCell><Badge variant="outline">{booking.status}</Badge></TableCell>
                    <TableCell>€{fmtM(booking.totalAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ndrysho Fluturimin</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vende Totale</label>
              <input type="number" value={editFields.totalSeats ?? ""} onChange={e => setEditFields(f => ({ ...f, totalSeats: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Çmimi i Rritur (€)</label>
              <input type="number" step="1" value={editFields.adultPrice ?? ""} onChange={e => setEditFields(f => ({ ...f, adultPrice: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Çmimi Fëmijë (€)</label>
              <input type="number" step="1" value={editFields.childPrice ?? ""} onChange={e => setEditFields(f => ({ ...f, childPrice: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Çmimi Foshnjë (€)</label>
              <input type="number" step="1" value={editFields.infantPrice ?? ""} onChange={e => setEditFields(f => ({ ...f, infantPrice: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bagazh{(flight as any).checkedBaggageKg ? ` ${Number((flight as any).checkedBaggageKg)}kg` : ""} (€)</label>
              <input type="number" step="1" value={editFields.checkedBaggagePrice ?? ""} onChange={e => setEditFields(f => ({ ...f, checkedBaggagePrice: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority Boarding 10kg (€)</label>
              <input type="number" step="1" value={editFields.priorityBoardingPrice ?? ""} onChange={e => setEditFields(f => ({ ...f, priorityBoardingPrice: e.target.value }))}
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {user?.role === "admin" && <FlightDiscountEditor flightId={id} flight={flight} />}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Anulo</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Duke ruajtur..." : "Ruaj"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
