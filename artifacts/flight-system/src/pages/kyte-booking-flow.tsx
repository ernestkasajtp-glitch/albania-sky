import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Clock3, RefreshCw } from "lucide-react";
import KyteBookingForm, { type KyteBookingDetails, type KyteBookingOffer, type KytePassengerSlot } from "./kyte-booking-form";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

export type SandboxOffer = Omit<KyteBookingOffer, "bookingToken"> & {
  id: string;
  bookingToken: string | null;
  bookingTokenExpiresAt?: string | null;
  passengerSlots?: KytePassengerSlot[];
};

type SandboxBooking = {
  id: string;
  status: "creating" | "created" | "failed" | "unknown";
  providerBookingId?: string | null;
  providerStatus?: string | null;
  ticketTimeLimit?: string | null;
  totalCost?: string | null;
  currencyCode?: string | null;
  message?: string | null;
  createdAt: string;
};

function dateTime(value?: string | null) {
  if (!value) return "Nuk është përcaktuar";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("sq-AL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Tirane",
  });
}

async function apiError(response: Response) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : `Kërkesa dështoi (HTTP ${response.status}).`;
}

export function KyteBookingFlow({ offer, onClose, onCreated }: {
  offer: SandboxOffer;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<SandboxBooking | null>(null);
  const submitted = useRef(false);

  const submit = async (details: KyteBookingDetails) => {
    if (submitted.current || !offer.bookingToken) return;
    submitted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const passengers = details.passengers.map((passenger, index) => ({
        ...passenger,
        ...(index === 0 ? { contactInformation: {
          email: details.contactEmail,
          phone: { countryCode: details.phoneCountryCode, number: details.phoneNumber },
        } } : {}),
      }));
      const response = await fetch(`${API_BASE}/kyte/sandbox/book`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingToken: offer.bookingToken,
          passengers,
          ...(details.address ? { address: details.address } : {}),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const data = await response.json();
      if (!data || typeof data.id !== "string" || typeof data.status !== "string") {
        throw new Error("Nuk u mor status i vlefshëm për rezervimin. Kontrolloni historikun.");
      }
      setBooking(data as SandboxBooking);
      onCreated();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Përgjigjja e rezervimit nuk u mor."} Mos e dërgoni përsëri këtë ofertë pa kontrolluar historikun më poshtë.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (booking) {
    const known = booking.status === "created";
    return <section className="kyte-card mx-auto max-w-3xl p-6 sm:p-8" aria-live="polite" data-testid="status-kyte-sandbox-booking">
      <div className="mb-4 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">KYTE SANDBOX · REZERVIM PROVË</div>
      <h2 className="text-2xl font-bold text-slate-900">{known ? "Rezervimi provë u krijua" : "Kontrolloni statusin e rezervimit"}</h2>
      <p className="mt-2 text-sm text-slate-600">{known
        ? "Kjo është një provë pa pagesë. Nuk është biletë reale dhe nuk vlen për udhëtim."
        : "Rezultati te furnitori nuk është konfirmuar plotësisht. Mos krijoni një rezervim të dytë pa kontrolluar statusin."}</p>
      <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">ID e regjistrimit</dt><dd className="break-all font-semibold text-slate-900">{booking.id}</dd></div>
        <div><dt className="text-slate-500">ID Kyte (provë)</dt><dd className="break-all font-semibold text-slate-900">{booking.providerBookingId || "Në pritje"}</dd></div>
        <div><dt className="text-slate-500">Statusi</dt><dd className="font-semibold text-slate-900">{booking.status === "created" ? "Krijuar, pa pagesë" : booking.status === "unknown" ? "I panjohur" : booking.status === "failed" ? "Dështoi" : "Duke u krijuar"}</dd></div>
        <div><dt className="text-slate-500">Afati i rezervimit</dt><dd className="font-semibold text-slate-900">{dateTime(booking.ticketTimeLimit)}</dd></div>
      </dl>
      {booking.message && <p className="mt-4 text-sm text-amber-900">{booking.message}</p>}
      <button type="button" onClick={onClose} className="kyte-mini mt-6"><ArrowLeft size={15} aria-hidden="true" /> Kthehu te kërkimi</button>
    </section>;
  }

  if (submitted.current && !submitting) {
    return <section className="kyte-card mx-auto max-w-3xl p-6" role="alert" data-testid="status-kyte-booking-uncertain">
      <div className="flex items-start gap-3 text-amber-900"><AlertCircle size={20} aria-hidden="true" /><p>{error}</p></div>
      <button type="button" onClick={onClose} className="kyte-mini mt-5"><ArrowLeft size={15} aria-hidden="true" /> Kthehu te historiku</button>
    </section>;
  }

  const expiresAt = [offer.expiresAt, offer.bookingTokenExpiresAt].filter((value): value is string => !!value)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return <KyteBookingForm
    offer={{ ...offer, bookingToken: offer.bookingToken || "", expiresAt }}
    passengerSlots={offer.passengerSlots || []}
    isSubmitting={submitting}
    error={error}
    onCancel={onClose}
    onSubmit={submit}
  />;
}

export function KyteBookingHistory({ refreshKey }: { refreshKey: number }) {
  const [bookings, setBookings] = useState<SandboxBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/kyte/sandbox/bookings`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(await apiError(response));
      const data = await response.json();
      if (!Array.isArray(data?.bookings)) throw new Error("Historiku u kthye në format të pavlefshëm.");
      setBookings(data.bookings);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Historiku nuk u ngarkua.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  return <section className="kyte-card mt-6 p-5 sm:p-6" aria-labelledby="kyte-booking-history-title">
    <div className="flex items-center justify-between gap-3">
      <div><span className="text-xs font-bold uppercase tracking-widest text-amber-700">Vetëm Sandbox</span><h2 id="kyte-booking-history-title" className="text-lg font-bold text-slate-900">Rezervimet provë</h2></div>
      <button className="kyte-mini" type="button" onClick={() => void load()} disabled={loading} aria-label="Rifresko rezervimet provë"><RefreshCw size={15} aria-hidden="true" /> Rifresko</button>
    </div>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">Historiku nuk u ngarkua: {error}</p>}
    {loading && <p className="mt-4 text-sm text-slate-500">Duke ngarkuar rezervimet provë…</p>}
    {!loading && !error && bookings.length === 0 && <p className="mt-4 text-sm text-slate-500">Ende nuk ka rezervime provë.</p>}
    {!loading && bookings.length > 0 && <div className="mt-4 divide-y divide-slate-100">
      {bookings.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div><p className="font-semibold text-slate-900">{item.providerBookingId || item.id}</p><p className="text-slate-500">Krijuar {dateTime(item.createdAt)}</p></div>
        <div className="text-right"><p className={`font-semibold ${item.status === "unknown" ? "text-amber-700" : item.status === "created" ? "text-emerald-700" : "text-slate-600"}`}>{item.status === "created" ? "Pa pagesë" : item.status === "unknown" ? "Status i panjohur" : item.status === "failed" ? "Dështoi" : "Duke u krijuar"}</p><p className="flex items-center justify-end gap-1 text-xs text-slate-500"><Clock3 size={12} aria-hidden="true" /> Skadon {dateTime(item.ticketTimeLimit)}</p></div>
      </div>)}
    </div>}
  </section>;
}