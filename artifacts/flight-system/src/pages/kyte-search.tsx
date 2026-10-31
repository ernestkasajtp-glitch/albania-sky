import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertCircle, ArrowRight, Clock3, LockKeyhole, Plus, Radar, Search, Trash2, TriangleAlert } from "lucide-react";
import { Form } from "@/components/ui/form";
import { KyteBookingFlow, KyteBookingHistory, type SandboxOffer } from "./kyte-booking-flow";
import { formatKytePrice } from "./kyte-price";
import "./kyte-search.css";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && new Date(`${value}T12:00:00`).toISOString().slice(0, 10) === value;
const schema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/, "Vendosni kodin IATA me 3 shkronja."),
  destination: z.string().regex(/^[A-Z]{3}$/, "Vendosni kodin IATA me 3 shkronja."),
  departureDate: z.string().refine(validDate, "Zgjidhni një datë të vlefshme nisjeje."),
  returnDate: z.string(),
  adults: z.coerce.number().int().min(1, "Duhet të jetë të paktën 1 i rritur.").max(9, "Maksimumi 9 pasagjerë."),
  childAges: z.array(z.number().int().min(2).max(17)),
  infantAges: z.array(z.number().int().min(0).max(1)),
  nonStop: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.origin === v.destination && v.origin.length === 3) ctx.addIssue({ code: "custom", path: ["destination"], message: "Destinacioni duhet të jetë ndryshe nga nisja." });
  if (validDate(v.departureDate) && v.departureDate < today()) ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Data e nisjes nuk mund të jetë në të kaluarën." });
  if (v.returnDate && (!validDate(v.returnDate) || v.returnDate < v.departureDate)) ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Kthimi duhet të jetë në ose pas datës së nisjes." });
  if (v.adults + v.childAges.length + v.infantAges.length > 9) ctx.addIssue({ code: "custom", path: ["adults"], message: "Maksimumi 9 pasagjerë gjithsej." });
  if (v.infantAges.length > v.adults) ctx.addIssue({ code: "custom", path: ["infantAges"], message: "Çdo foshnjë duhet të shoqërohet nga një i rritur." });
});
type SearchForm = z.infer<typeof schema>;
type Segment = {
  flightNumber: string; carrier: string;
  departure: { airport: string; date: string; time: string };
  arrival: { airport: string; date: string; time: string };
};
type Offer = SandboxOffer & { journeys: { segments: Segment[]; totalDurationMinutes: number | null }[] };
type SearchResponse = { offers: Offer[]; warnings: string[]; errors: string[]; searchedAt: string };
type SearchState = { status: "idle" | "loading" | "success" | "error"; data: SearchResponse | null; error: string | null };

function formatDate(value: string) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : value;
}
function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tirane" });
}
function formatDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Kohëzgjatja e panjohur";
  return `${Math.floor(value / 60)} orë ${value % 60} min`;
}
export default function KyteSearchPage() {
  const form = useForm<SearchForm>({
    resolver: zodResolver(schema),
    defaultValues: { origin: "", destination: "", departureDate: "", returnDate: "", adults: 1, childAges: [], infantAges: [], nonStop: false },
  });
  const [state, setState] = useState<SearchState>({ status: "idle", data: null, error: null });
  const [bookingOffer, setBookingOffer] = useState<Offer | null>(null);
  const [bookingHistoryKey, setBookingHistoryKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { window.clearInterval(timer); request.current?.abort(); };
  }, []);

  const children = form.watch("childAges");
  const infants = form.watch("infantAges");
  const adults = Number(form.watch("adults")) || 0;
  const departureDate = form.watch("departureDate");
  const total = adults + children.length + infants.length;
  const addAge = (key: "childAges" | "infantAges", age: number) => {
    if (total >= 9) return;
    form.setValue(key, [...form.getValues(key), age], { shouldValidate: true });
  };
  const updateAge = (key: "childAges" | "infantAges", index: number, age: number) => {
    form.setValue(key, form.getValues(key).map((value, i) => i === index ? age : value), { shouldValidate: true });
  };
  const removeAge = (key: "childAges" | "infantAges", index: number) => {
    form.setValue(key, form.getValues(key).filter((_, i) => i !== index), { shouldValidate: true });
  };

  const search = async (values: SearchForm) => {
    request.current?.abort();
    setBookingOffer(null);
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading", data: null, error: null });
    try {
      const response = await fetch(`${API_BASE}/kyte/search`, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: values.origin, destination: values.destination, departureDate: values.departureDate,
          ...(values.returnDate ? { returnDate: values.returnDate } : {}),
          adults: values.adults, childAges: values.childAges, infantAges: values.infantAges, nonStop: values.nonStop,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof payload?.error === "string" ? payload.error
          : Array.isArray(payload?.errors) ? payload.errors.join(" ")
          : typeof payload?.message === "string" ? payload.message : "";
        throw new Error(detail || `Kërkimi dështoi (HTTP ${response.status}). Provoni përsëri.`);
      }
      if (!payload || !Array.isArray(payload.offers) || !Array.isArray(payload.warnings) || !Array.isArray(payload.errors)) throw new Error("Përgjigjja e kërkimit nuk është në formatin e pritur.");
      setNow(Date.now());
      setState({ status: "success", data: payload as SearchResponse, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Kërkimi dështoi. Provoni përsëri." });
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <div className="kyte-page">
      <div className="kyte-inner">
        <header className="kyte-hero">
          <div className="kyte-hero-top">
            <span className="kyte-eyebrow kyte-hero-label"><Radar size={16} aria-hidden="true" /> KYTE / SEARCH LAB</span>
            <span className="kyte-internal"><LockKeyhole size={12} className="inline mr-1" aria-hidden="true" /> Vetëm administratorët</span>
          </div>
          <h1 className="kyte-title">Kërkim fluturimesh Kyte</h1>
          <p className="kyte-description">Kërkoni oferta dhe krijoni vetëm rezervime provë pa pagesë në Kyte Sandbox. Këto nuk janë bileta reale dhe nuk vlejnë për udhëtim.</p>
        </header>

        {bookingOffer ? <KyteBookingFlow
          key={bookingOffer.bookingToken || bookingOffer.id}
          offer={bookingOffer}
          onClose={() => setBookingOffer(null)}
          onCreated={() => setBookingHistoryKey(key => key + 1)}
        /> : <div className="kyte-main">
          <section className="kyte-card kyte-form-card" aria-labelledby="kyte-form-title">
            <div className="kyte-section-heading">
              <span className="kyte-heading-icon"><Search size={18} aria-hidden="true" /></span>
              <div><h2 id="kyte-form-title">Parametrat e kërkimit</h2><p>Shkruani kodet IATA të aeroporteve.</p></div>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(search)} noValidate>
                <div className="kyte-field-stack">
                  <div className="kyte-grid-two">
                    {(["origin", "destination"] as const).map((key) => (
                      <label className="kyte-field" key={key}>
                        <span className="kyte-label">{key === "origin" ? "Nga" : "Për në"}</span>
                        <input
                          {...form.register(key)}
                          onChange={(event) => {
                            const value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
                            event.target.value = value;
                            form.setValue(key, value, { shouldValidate: form.formState.isSubmitted });
                          }}
                          className="kyte-control" placeholder={key === "origin" ? "TIA" : "LHR"}
                          maxLength={3} autoComplete="off" spellCheck={false} required
                          aria-invalid={!!form.formState.errors[key]} aria-describedby={form.formState.errors[key] ? `kyte-${key}-error` : undefined}
                          data-testid={`input-kyte-${key}`}
                        />
                        {form.formState.errors[key] && <p className="kyte-error-text" id={`kyte-${key}-error`}>{form.formState.errors[key]?.message}</p>}
                      </label>
                    ))}
                  </div>
                  <div className="kyte-grid-two">
                    <label className="kyte-field">
                      <span className="kyte-label">Data e nisjes</span>
                      <input type="date" min={today()} className="kyte-control" {...form.register("departureDate")} required aria-invalid={!!form.formState.errors.departureDate} data-testid="input-kyte-departure-date" />
                      {form.formState.errors.departureDate && <p className="kyte-error-text">{form.formState.errors.departureDate.message}</p>}
                    </label>
                    <label className="kyte-field">
                      <span className="kyte-label">Data e kthimit <span className="font-normal text-slate-400">(opsionale)</span></span>
                      <input type="date" min={departureDate || today()} className="kyte-control" {...form.register("returnDate")} aria-invalid={!!form.formState.errors.returnDate} data-testid="input-kyte-return-date" />
                      {form.formState.errors.returnDate && <p className="kyte-error-text">{form.formState.errors.returnDate.message}</p>}
                    </label>
                  </div>
                </div>
                <div className="kyte-divider" />
                <div className="kyte-field">
                  <label htmlFor="kyte-adults" className="kyte-label">Të rritur</label>
                  <input id="kyte-adults" type="number" min={1} max={9} step={1} className="kyte-control" {...form.register("adults")} aria-invalid={!!form.formState.errors.adults} data-testid="input-kyte-adults" />
                  {form.formState.errors.adults && <p className="kyte-error-text">{form.formState.errors.adults.message}</p>}
                </div>
                <div className="mt-5">
                  <div className="kyte-age-title"><span>Fëmijë <span className="font-normal text-slate-400">(2–17 vjeç)</span></span><button type="button" className="kyte-mini" onClick={() => addAge("childAges", 2)} disabled={total >= 9} data-testid="button-kyte-add-child"><Plus size={13} aria-hidden="true" /> Shto</button></div>
                  <div className="kyte-age-list">
                    {children.map((age, index) => <div className="kyte-age-row" key={`child-${index}`}>
                      <span>Fëmija {index + 1}</span>
                      <label className="sr-only" htmlFor={`kyte-child-${index}`}>Mosha e fëmijës {index + 1}</label>
                      <select id={`kyte-child-${index}`} className="kyte-control" value={age} onChange={e => updateAge("childAges", index, Number(e.target.value))} data-testid={`select-kyte-child-age-${index}`}>{Array.from({ length: 16 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} vjeç</option>)}</select>
                      <button type="button" className="kyte-mini" onClick={() => removeAge("childAges", index)} aria-label={`Hiq fëmijën ${index + 1}`} data-testid={`button-kyte-remove-child-${index}`}><Trash2 size={14} aria-hidden="true" /></button>
                    </div>)}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="kyte-age-title"><span>Foshnja <span className="font-normal text-slate-400">(0–1 vjeç)</span></span><button type="button" className="kyte-mini" onClick={() => addAge("infantAges", 0)} disabled={total >= 9 || infants.length >= adults} data-testid="button-kyte-add-infant"><Plus size={13} aria-hidden="true" /> Shto</button></div>
                  <div className="kyte-age-list">
                    {infants.map((age, index) => <div className="kyte-age-row" key={`infant-${index}`}>
                      <span>Foshnja {index + 1}</span>
                      <label className="sr-only" htmlFor={`kyte-infant-${index}`}>Mosha e foshnjës {index + 1}</label>
                      <select id={`kyte-infant-${index}`} className="kyte-control" value={age} onChange={e => updateAge("infantAges", index, Number(e.target.value))} data-testid={`select-kyte-infant-age-${index}`}><option value={0}>0 vjeç</option><option value={1}>1 vjeç</option></select>
                      <button type="button" className="kyte-mini" onClick={() => removeAge("infantAges", index)} aria-label={`Hiq foshnjën ${index + 1}`} data-testid={`button-kyte-remove-infant-${index}`}><Trash2 size={14} aria-hidden="true" /></button>
                    </div>)}
                  </div>
                  {form.formState.errors.infantAges && <p className="kyte-error-text">{form.formState.errors.infantAges.message}</p>}
                  <p className="kyte-count-note" data-testid="text-kyte-passenger-count">{total} nga 9 pasagjerë maksimumi</p>
                </div>
                <div className="kyte-divider" />
                <label className="kyte-check-line"><input type="checkbox" className="kyte-check" {...form.register("nonStop")} data-testid="checkbox-kyte-nonstop" /> Vetëm fluturime direkte</label>
                <button className="kyte-submit" type="submit" disabled={state.status === "loading"} data-testid="button-kyte-search"><Search size={16} aria-hidden="true" />{state.status === "loading" ? "Duke kërkuar…" : "Kërko oferta"}<ArrowRight size={15} aria-hidden="true" /></button>
              </form>
            </Form>
          </section>

          <section className="kyte-result-shell" aria-label="Rezultatet e kërkimit" aria-live="polite">
            <div className="kyte-result-header">
               <div><span className="kyte-eyebrow text-[#6383a2]">REZULTATET / SANDBOX</span><h2>Ofertat e gjetura</h2></div>
              {state.data && <span className="kyte-result-meta" data-testid="text-kyte-searched-at">Kërkuar më {formatTimestamp(state.data.searchedAt)}</span>}
            </div>
            {state.status === "error" && <div className="kyte-alert kyte-alert-error" role="alert" data-testid="status-kyte-error"><AlertCircle size={17} aria-hidden="true" /><div><strong>Kërkimi nuk u përfundua.</strong><p>{state.error}</p><button type="button" className="kyte-mini mt-2" onClick={form.handleSubmit(search)} data-testid="button-kyte-retry">Provo përsëri</button></div></div>}
             {state.data?.errors?.length ? <div className={`kyte-alert ${state.data.offers.length ? "kyte-alert-warning" : "kyte-alert-error"}`} role="status" data-testid="status-kyte-api-errors"><AlertCircle size={17} aria-hidden="true" /><div>{state.data.offers.length > 0 && <strong>Disa linja nuk kthyen rezultate për këtë kërkim.</strong>}{state.data.errors.map((error, index) => <p key={index}>{error}</p>)}</div></div> : null}
            {state.data?.warnings?.length ? <div className="kyte-alert kyte-alert-warning" role="status" data-testid="status-kyte-warnings"><TriangleAlert size={17} aria-hidden="true" /><div>{state.data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div></div> : null}
            {state.status === "loading" && <div role="status" aria-label="Duke kërkuar oferta" data-testid="status-kyte-loading"><div className="kyte-skeleton" /><div className="kyte-skeleton" /></div>}
             {state.status === "idle" && <div className="kyte-card kyte-empty" data-testid="status-kyte-idle"><span className="kyte-empty-icon"><Radar size={26} aria-hidden="true" /></span><h3>Gati për kërkimin e parë</h3><p>Vendosni itinerarin dhe pasagjerët në të majtë. Ofertat e kthyer nga Kyte do të shfaqen këtu; mund të krijoni rezervime provë pa pagesë.</p></div>}
            {state.status === "success" && state.data?.offers.length === 0 && <div className="kyte-card kyte-empty" data-testid="status-kyte-empty"><span className="kyte-empty-icon"><Search size={26} aria-hidden="true" /></span><h3>Nuk u gjetën oferta</h3><p>Nuk ka rezultate për këtë kërkim. Provoni një datë tjetër, ndryshoni itinerarin ose hiqni filtrin e fluturimeve direkte.</p></div>}
            {state.status === "success" && state.data && state.data.offers.length > 0 && <div className="kyte-offers" data-testid="list-kyte-offers">
              {state.data.offers.map((offer, offerIndex) => {
                const expiry = offer.expiresAt ? new Date(offer.expiresAt).getTime() : null;
                const expired = expiry !== null && (Number.isNaN(expiry) || expiry <= now);
                return <article className="kyte-card kyte-offer" key={`${offer.id}-${offerIndex}`} data-testid={`card-kyte-offer-${offerIndex}`}>
                  <div className="kyte-offer-top"><div><div className="kyte-airline">{offer.airline || "Linja ajrore"}</div><div className="kyte-price" data-testid={`text-kyte-price-${offerIndex}`}>{formatKytePrice(offer)}</div></div><span className={`kyte-quote-status ${expired ? "expired" : expiry === null ? "unknown" : ""}`} data-testid={`status-kyte-quote-${offerIndex}`}><Clock3 size={11} aria-hidden="true" />{expired ? "Oferta ka skaduar" : expiry === null ? "Afati i panjohur" : `Vlen deri më ${formatTimestamp(offer.expiresAt!)}`}</span></div>
                  <div className="kyte-journeys">{offer.journeys.map((journey, journeyIndex) => <div className="kyte-journey" key={journeyIndex}>
                    <div className="kyte-journey-head"><strong>{journeyIndex === 0 ? "Nisja" : journeyIndex === 1 ? "Kthimi" : `Itinerari ${journeyIndex + 1}`}</strong><span>{formatDuration(journey.totalDurationMinutes)} · {journey.segments.length === 1 ? "Direkt" : `${Math.max(0, journey.segments.length - 1)} ndalesa`}</span></div>
                    {journey.segments.map((segment, segmentIndex) => <div className="kyte-segment" key={segmentIndex}>
                      <div className="kyte-station"><div className="kyte-time">{segment.departure.time}</div><div className="kyte-airport">{segment.departure.airport}</div><div className="kyte-date">{formatDate(segment.departure.date)}</div></div>
                      <div className="kyte-flight-line"><span>{segment.carrier} {segment.flightNumber}</span><i aria-hidden="true" /></div>
                      <div className="kyte-station"><div className="kyte-time">{segment.arrival.time}</div><div className="kyte-airport">{segment.arrival.airport}</div><div className="kyte-date">{formatDate(segment.arrival.date)}</div></div>
                    </div>)}
                  </div>)}</div>
                   <div className="kyte-offer-foot">ID e ofertës: {offer.id} · Sandbox; disponueshmëria dhe çmimi mund të ndryshojnë.</div>
                   <button
                     type="button"
                     className="kyte-submit mt-4"
                     disabled={!offer.bookingToken || !offer.passengerSlots?.length || expired || expiry === null}
                     onClick={() => setBookingOffer(offer)}
                     data-testid={`button-kyte-book-${offerIndex}`}
                   >Rezervo vetëm për provë <ArrowRight size={15} aria-hidden="true" /></button>
                   {!offer.bookingToken && <p className="mt-2 text-xs text-amber-800">Kjo ofertë nuk mund të rezervohet në Sandbox. Provoni një kërkim tjetër.</p>}
                </article>;
              })}
            </div>}
          </section>
        </div>}
        <KyteBookingHistory refreshKey={bookingHistoryKey} />
      </div>
    </div>
  );
}