import "./_group.css";
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "./_demo";
import { api } from "./_demo";
import { fmtAmPm, fmtM } from "./_demo";
import { useAuth } from "./_demo";
import { useTranslation } from "./_demo";
import {
  ArrowLeft, Plane, MapPin, Calendar, Clock, Users,
  CreditCard, Banknote, RefreshCw, CheckCircle2, XCircle,
  Ticket, FileText, AlertCircle, Luggage, Shield, Armchair,
  ChevronRight, Loader2, Download,
} from "lucide-react";

function fmtDate(iso: string, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string, locale: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) +
    "  " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtMoney(n: number) {
  return fmtM(n);
}
function fmtFlightNum(s: string) {
  return s ? s.replace(/([A-Za-z]{1,3})(\d)/, "$1 $2") : s;
}

const STATUS_MAP: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  draft:     { label: "Draft",      text: "text-amber-700",   bg: "bg-amber-50",   dot: "bg-amber-400" }, // "Draft" → mbahet term standard
  pending:   { label: "Në Pritje",  text: "text-orange-700",  bg: "bg-orange-50",  dot: "bg-orange-400" },
  confirmed: { label: "Konfirmuar", text: "text-blue-700",    bg: "bg-blue-50",    dot: "bg-blue-500" },
  ticketed:  { label: "Ticketed",   text: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  cancelled: { label: "Anuluar",    text: "text-red-700",     bg: "bg-red-50",     dot: "bg-red-500" },
};

const PAX_TYPE: Record<string, string> = {
  adult: "I Rritur", child: "Fëmijë", infant: "Foshnjë",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Kesh", bank: "Bankë", card: "Kartë", manual: "Manual",
};

export default function BookingDetail() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? "en-GB" : "sq-AL";
  const [, params] = useRoute("/my-bookings/:ref");
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pokLoading, setPokLoading] = useState(false);
  const [pokError, setPokError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const ref = params?.ref ?? "";

  useEffect(() => {
    if (!authLoading && !user) { setLocation("/login"); return; }
    if (user && ref) {
      api.getBookingDetail(ref)
        .then(setBooking)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, ref]);

  async function handlePokPay() {
    setPokError("");
    setPokLoading(true);
    try {
      const data = await api.initPokPayment(ref);
      if (data?.confirmUrl) {
        window.location.href = data.confirmUrl;
      } else {
        setPokError(t("Nuk u mor URL-ja e pagesës. Provoni përsëri."));
      }
    } catch (err: any) {
      setPokError(err.message || t("Gabim gjatë inicimit të pagesës."));
    } finally {
      setPokLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const blob = await api.downloadBookingPdf(ref);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent — non-blocking
    } finally {
      setPdfLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f5f9" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#0b1f3a] border-t-transparent animate-spin" />
          <div className="text-sm text-gray-500">{t("Duke ngarkuar rezervimin…")}</div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f5f9" }}>
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-2">{t("Rezervimi nuk u gjet")}</h2>
          <p className="text-gray-400 text-sm mb-5">{error || t("Ky rezervim nuk ekziston ose nuk keni akses.")}</p>
          <button onClick={() => setLocation("/my-bookings")}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg,#0b1f3a,#1a3a6b)" }}>
            <ArrowLeft className="h-4 w-4" /> {t("Kthehu te Rezervimet")}
          </button>
        </div>
      </div>
    );
  }

  const st = STATUS_MAP[booking.status] ?? { label: booking.status, text: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400" };
  const fl = booking.flight;
  const passengers: any[] = booking.passengers ?? [];
  const payments: any[] = booking.payments ?? [];
  const activePax = passengers.filter((p: any) => !p.cancelled);
  const cancelledPax = passengers.filter((p: any) => p.cancelled);
  const totalPaid = payments.filter((p: any) => !p.isRefund).reduce((s: number, p: any) => s + p.amount, 0);
  const totalRefunded = payments.filter((p: any) => p.isRefund).reduce((s: number, p: any) => s + p.amount, 0);
  const pctPaid = booking.totalAmount > 0 ? Math.min(100, (booking.paidAmount / booking.totalAmount) * 100) : 0;

  return (
    <div className="min-h-screen" style={{ background: "#f1f5f9" }}>
      {/* ── Top header bar ── */}
      <div style={{ background: "linear-gradient(135deg,#0b1f3a 0%,#1a3a6b 100%)" }} className="px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button onClick={() => setLocation("/my-bookings")}
              className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> {t("Rezervimet e Mia")}
            </button>
            <button onClick={handleDownloadPdf} disabled={pdfLoading}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/15 transition-colors">
              {pdfLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              {t("Shkarko PDF")}
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <span className="font-mono font-black text-white text-2xl tracking-wider">{booking.bookingRef}</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {t(st.label)}
                </span>
              </div>
              <div className="text-white/50 text-xs">{t("Krijuar:")} {fmtDateTime(booking.createdAt, dateLocale)}</div>
              {booking.pnr && (
                <div className="mt-1 inline-flex items-center gap-1.5 bg-amber-400/15 border border-amber-400/30 rounded-lg px-3 py-1">
                  <span className="text-amber-300 text-[10px] font-bold uppercase tracking-wider">PNR</span>
                  <span className="text-amber-200 font-mono font-bold text-sm">{booking.pnr}</span>
                </div>
              )}
            </div>
            {fl && (
              <div className="flex items-center gap-2 text-white">
                <div className="text-right">
                  <div className="font-bold text-lg">{fl.fromAirport || fl.fromCity}</div>
                  <div className="text-white/40 text-[10px]">{fl.fromCity}</div>
                </div>
                <div className="flex flex-col items-center gap-1 px-2">
                  <div className="text-white/30 text-[10px]">{fl.airline}</div>
                  <div className="flex items-center gap-1">
                    <div className="w-10 h-px bg-white/20" />
                    <Plane className="h-4 w-4 text-white/50" />
                    <div className="w-10 h-px bg-white/20" />
                  </div>
                  <div className="text-white/30 text-[10px]">{fmtFlightNum(fl.flightNumber)}</div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-lg">{fl.toAirport || fl.toCity}</div>
                  <div className="text-white/40 text-[10px]">{fl.toCity}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* Flight info card */}
        {fl && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
              <Plane className="h-4 w-4 text-[#0b1f3a]/40" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("Informacion Fluturimi")}</span>
              {fl.isConfirmed && (
                <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-bold text-emerald-700">
                  <span className="inline-flex items-center justify-center bg-black rounded w-3.5 h-3.5 text-[9px]">⭐</span>
                  {t("Fluturim i Konfirmuar")}
                </span>
              )}
            </div>
            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Linja / Nr.")}</div>
                <div className="text-sm font-bold text-gray-800">{fl.airline} {fmtFlightNum(fl.flightNumber)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Nisja")}</div>
                <div className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {fl.departureDate}
                </div>
                {fl.departureTime && (
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-gray-300" /> {fmtAmPm(fl.departureTime)}
                  </div>
                )}
              </div>
              {fl.arrivalDate && (
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Mbërritja")}</div>
                  <div className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    {fl.arrivalDate}
                  </div>
                  {fl.arrivalTime && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 text-gray-300" /> {fmtAmPm(fl.arrivalTime)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Rruga")}</div>
                <div className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {fl.fromCity} → {fl.toCity}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Statusi i Biletës")}</div>
                <div className="mt-0.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${st.bg} ${st.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {t(st.label)}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("Klienti")}</div>
                <div className="text-sm font-semibold text-gray-800">{booking.customerName}</div>
                {booking.customerEmail && <div className="text-[10px] text-gray-400">{booking.customerEmail}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Passengers card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
            <Users className="h-4 w-4 text-[#0b1f3a]/40" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("Pasagjerët")}</span>
            <span className="ml-1 text-[10px] text-gray-400">({t("{{count}} aktiv", { count: activePax.length })}{cancelledPax.length > 0 ? `, ${t("{{count}} anuluar", { count: cancelledPax.length })}` : ""})</span>
          </div>
          {passengers.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">{t("Asnjë pasagjer")}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Active passengers */}
              {activePax.map((p: any, i: number) => (
                <div key={p.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0b1f3a]/5 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#0b1f3a]/50 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-800">{p.firstName} {p.lastName}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded font-medium">{t(PAX_TYPE[p.type] ?? p.type)}</span>
                        {p.pnr && <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">PNR: {p.pnr}</span>}
                        {p.seatNumber && <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><Armchair className="h-2.5 w-2.5" />{p.seatNumber}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {p.baggageOption === "checked" && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            <Luggage className="h-2.5 w-2.5" /> {t("Bagazh kontroll.")}
                          </span>
                        )}
                        {p.hasSeatSelection && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                            <Armchair className="h-2.5 w-2.5" /> {t("Zgjedhje vendi")}
                          </span>
                        )}
                        {p.hasPriorityBoarding && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">
                            <ChevronRight className="h-2.5 w-2.5" /> {t("Prioritet")}
                          </span>
                        )}
                        {p.hasInsurance && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                            <Shield className="h-2.5 w-2.5" /> {t("Sigurim")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-gray-800">
                      €{fmtMoney(p.ticketPrice != null ? p.ticketPrice : (fl ? (p.type === "infant" ? fl.infantPrice : p.type === "child" ? fl.childPrice : fl.adultPrice) : 0))}
                    </div>
                    {p.extraCost > 0 && (
                      <div className="text-[10px] text-blue-600 font-medium">+€{fmtMoney(p.extraCost)} {t("ekstra")}</div>
                    )}
                  </div>
                </div>
              ))}
              {/* Cancelled passengers */}
              {cancelledPax.map((p: any) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4 opacity-40">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-gray-600 line-through">{p.firstName} {p.lastName}</div>
                      <div className="text-[10px] text-gray-400">{t(PAX_TYPE[p.type] ?? p.type)} · {t("Anuluar")}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial summary + Payments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Financial summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-[#0b1f3a]/40" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("Gjendja Financiare")}</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                  <span>{t("I paguar")}</span>
                  <span>{Math.round(pctPaid)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pctPaid}%`,
                      background: booking.dueAmount <= 0 ? "#10b981" : "linear-gradient(90deg,#10b981,#f59e0b)"
                    }} />
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-500">{t("Shuma Totale")}</span>
                  <span className="text-sm font-bold text-gray-900">€{fmtMoney(booking.totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-500">{t("Paguar")}</span>
                  <span className="text-sm font-bold text-emerald-600">€{fmtMoney(booking.paidAmount)}</span>
                </div>
                {totalRefunded > 0 && (
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t("Kthyer (Rimbursim)")}</span>
                    <span className="text-sm font-bold text-orange-500">−€{fmtMoney(totalRefunded)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs font-bold text-gray-700">{t("Mbetet")}</span>
                  <span className={`text-base font-black ${booking.dueAmount <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {booking.dueAmount <= 0 ? (
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {t("Likuiduar")}</span>
                    ) : `€${fmtMoney(booking.dueAmount)}`}
                  </span>
                </div>
              </div>

              {/* POK Pay button — shown only when there is an outstanding balance */}
              {booking.dueAmount > 0 && booking.status !== "cancelled" && (
                <div className="pt-3 border-t border-gray-100">
                  {pokError && (
                    <div className="mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {pokError}
                    </div>
                  )}
                  <button
                    onClick={handlePokPay}
                    disabled={pokLoading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,#4f1d7a,#7c3aed)" }}
                  >
                    {pokLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {t("Duke hapur pagesën…")}</>
                    ) : (
                      <><CreditCard className="h-4 w-4" /> {t("Paguaj me Kartë")}</>
                    )}
                  </button>
                  <p className="text-[10px] text-gray-400 text-center mt-1.5">
                    {t("Siguri e garantuar nga POK Pay · SSL")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Payments history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[#0b1f3a]/40" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("Historia e Pagesave")}</span>
            </div>
            {payments.length === 0 ? (
              <div className="py-10 text-center">
                <Banknote className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">{t("Asnjë pagesë e regjistruar")}</p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-2">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.isRefund
                        ? <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0"><RefreshCw className="h-3.5 w-3.5 text-orange-400" /></div>
                        : <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><Banknote className="h-3.5 w-3.5 text-emerald-500" /></div>
                      }
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-700">{fmtDate(p.createdAt, dateLocale)}</div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {t(METHOD_LABEL[p.method] ?? p.method)}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className={`text-sm font-bold shrink-0 ${p.isRefund ? "text-orange-500" : "text-emerald-600"}`}>
                      {p.isRefund ? "−" : "+"}€{fmtMoney(p.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("Gjithsej Paguar")}</span>
                  <span className="text-sm font-black text-emerald-600">€{fmtMoney(booking.paidAmount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-sm text-amber-800">
            <div className="font-semibold mb-1 text-xs uppercase tracking-wider text-amber-600">{t("Shënime")}</div>
            <div className="whitespace-pre-wrap">{booking.notes}</div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
