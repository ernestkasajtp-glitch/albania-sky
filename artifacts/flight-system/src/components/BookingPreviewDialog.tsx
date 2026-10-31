import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export function BookingPreviewDialog() {
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const id = detail.bookingId;
      const ref = detail.bookingRef;
      if (id) { setBookingId(Number(id)); return; }
      if (!ref) return;
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`${API_BASE}/bookings/by-ref/${encodeURIComponent(ref)}`, { credentials: "include" });
        if (!r.ok) throw new Error("Nuk u gjet rezervimi: " + ref);
        const data = await r.json();
        setBookingId(Number(data.id));
      } catch (e: any) {
        setErr(e?.message ?? "Gabim");
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener("open-booking-preview", handler as EventListener);
    return () => window.removeEventListener("open-booking-preview", handler as EventListener);
  }, []);

  const close = () => {
    if (!canCloseBookingDetail()) return;
    setBookingId(null);
    setErr(null);
  };

  return (
    <Dialog open={!!bookingId || loading || !!err} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base text-muted-foreground font-normal">
            Detajet e Rezervimit
          </DialogTitle>
        </DialogHeader>
        {loading && <div className="py-12 text-center text-sm text-muted-foreground">Duke ngarkuar…</div>}
        {err && <div className="py-8 text-center text-sm text-red-600">{err}</div>}
        {bookingId && <BookingDetailContent bookingId={bookingId} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}
