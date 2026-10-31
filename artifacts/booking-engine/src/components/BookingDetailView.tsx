import { useTranslation } from "react-i18next";
import { ArrowLeft, Armchair, Banknote, CheckCircle2, ChevronRight, Clock, CreditCard, Download, FileText, Loader2, Luggage, Plane, RefreshCw, Shield, Users, XCircle } from "lucide-react";
import { fmtAmPm, fmtM } from "@/lib/utils";
import "./booking-detail.css";
import BookingInvoiceDownload from "./BookingInvoiceDownload";

const STATUS_MAP: Record<string, { label: string; text: string; bg: string }> = {
  draft: { label: "Draft", text: "text-amber-700", bg: "bg-amber-50" },
  pending: { label: "Në Pritje", text: "text-orange-700", bg: "bg-orange-50" },
  confirmed: { label: "Konfirmuar", text: "text-blue-700", bg: "bg-blue-50" },
  ticketed: { label: "Ticketed", text: "text-emerald-700", bg: "bg-emerald-50" },
  cancelled: { label: "Anuluar", text: "text-red-700", bg: "bg-red-50" },
};
const PAX_TYPE: Record<string, string> = { adult: "I Rritur", child: "Fëmijë", infant: "Foshnjë" };
const METHOD_LABEL: Record<string, string> = { cash: "Kesh", bank: "Bankë", card: "Kartë", manual: "Manual" };

interface Props {
  booking: any;
  pokLoading: boolean;
  pokError: string;
  pdfLoading: boolean;
  onPay: () => void;
  onDownload: () => void;
  onBack: () => void;
}

/** Presentation only. All amounts and actions come from the existing booking controller. */
export default function BookingDetailView({ booking, pokLoading, pokError, pdfLoading, onPay, onDownload, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "sq-AL";
  const date = (value: string) => value ? new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const dateTime = (value: string) => value ? `${date(value)}  ${new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : "—";
  const money = (amount: number) => `€${fmtM(amount)}`;
  const flightNum = (value: string) => value ? value.replace(/([A-Za-z]{1,3})(\d)/, "$1 $2") : value;
  const fl = booking.flight;
  const passengers: any[] = booking.passengers ?? [];
  const activePax = passengers.filter(p => !p.cancelled);
  const cancelledPax = passengers.filter(p => p.cancelled);
  const payments: any[] = booking.payments ?? [];
  const totalRefunded = payments.filter(p => p.isRefund).reduce((sum, p) => sum + p.amount, 0);
  const pctPaid = booking.totalAmount > 0 ? Math.min(100, (booking.paidAmount / booking.totalAmount) * 100) : 0;
  const status = STATUS_MAP[booking.status] ?? { label: booking.status, text: "text-gray-600", bg: "bg-gray-50" };
  const statusBadge = <span className={`${status.bg} ${status.text} rounded px-2 py-1 text-xs font-semibold`}>{t(status.label)}</span>;

  return <div className="as-detail">
    <div className="as-container">
      <nav className="as-breadcrumb" aria-label={t("Rezervimet e Mia")}>
        <button onClick={onBack}>{t("Rezervimet e Mia")}</button><ChevronRight />
        <strong>{booking.bookingRef}</strong>
      </nav>
      <div className="as-grid">
        <div className="as-main">
          <section className="as-panel">
            <header className="as-heading"><FileText /><h1>{t("Detajet e rezervimit")}</h1></header>
            <div className="as-info">
              <section>
                <h3>{t("Informacioni i rezervimit")}</h3>
                <dl>
                  <div className="as-field"><dt>{t("Referenca")}</dt><dd className="as-code">{booking.bookingRef}</dd></div>
                  <div className="as-field"><dt>{t("Krijuar:")}</dt><dd>{dateTime(booking.createdAt)}</dd></div>
                  <div className="as-field"><dt>{t("Statusi i Biletës")}</dt><dd>{statusBadge}</dd></div>
                  {booking.pnr && <div className="as-field as-pnr"><dt>PNR</dt><dd className="as-code">{booking.pnr}</dd></div>}
                </dl>
              </section>
              <section>
                <h3>{t("Klienti")}</h3>
                <dl>
                  <div className="as-field"><dt>{t("Emri")}</dt><dd>{booking.customerName}</dd></div>
                  {booking.customerEmail && <div className="as-field"><dt>Email</dt><dd>{booking.customerEmail}</dd></div>}
                  <div className="as-field"><dt>{t("Pasagjerët")}</dt><dd>{t("{{count}} aktiv", { count: activePax.length })}{cancelledPax.length > 0 && `, ${t("{{count}} anuluar", { count: cancelledPax.length })}`}</dd></div>
                </dl>
              </section>
            </div>
          </section>

          {fl && <section className="as-panel">
            <header className="as-heading"><Plane /><h2>{t("Informacion Fluturimi")}</h2>
              {fl.isConfirmed && <span className="ml-auto text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 />{t("Fluturim i Konfirmuar")}</span>}
            </header>
            <div className="as-content">
              <div className="as-airline"><span className="as-airline-mark"><Plane /></span><div><strong>{fl.airline}</strong><p className="as-sub">{flightNum(fl.flightNumber)}</p></div></div>
              <div className="as-timeline">
                <div>
                  <div className="as-airport">{fl.fromAirport || fl.fromCity}</div><div className="as-sub">{fl.fromCity}</div>
                  {fl.departureTime && <div className="as-time">{fmtAmPm(fl.departureTime)}</div>}<div className="as-sub">{fl.departureDate}</div>
                </div>
                <div className="as-route"><span>{flightNum(fl.flightNumber)}</span><div className="as-route-line"><Plane /></div><span>{fl.fromCity} → {fl.toCity}</span></div>
                <div className="as-destination">
                  <div className="as-airport">{fl.toAirport || fl.toCity}</div><div className="as-sub">{fl.toCity}</div>
                  {fl.arrivalTime && <div className="as-time">{fmtAmPm(fl.arrivalTime)}</div>}{fl.arrivalDate && <div className="as-sub">{fl.arrivalDate}</div>}
                </div>
              </div>
              <div className="as-pax-count"><Users />{t("{{count}} aktiv", { count: activePax.length })}</div>
            </div>
          </section>}

          <section className="as-panel">
            <header className="as-heading"><Users /><h2>{t("Pasagjerët")}</h2></header>
            <div className="as-pax-list">
              {passengers.length === 0 && <p className="as-sub">{t("Asnjë pasagjer")}</p>}
              {activePax.map((p, index) => <article className="as-passenger" key={p.id}>
                <div className="as-pax-top">
                  <div><p className="as-pax-type">{t(PAX_TYPE[p.type] ?? p.type)} · {index + 1}</p><strong>{p.firstName} {p.lastName}</strong></div>
                  {p.pnr && <div className="as-sub">PNR <strong>{p.pnr}</strong></div>}
                </div>
                <div className="as-pax-bottom">
                  <div className="as-extras">
                    {p.baggageOption === "checked" && <span className="as-bag"><Luggage />{t("Bagazh kontroll.")}{fl?.checkedBaggageKg ? ` · ${fl.checkedBaggageKg} kg` : ""}</span>}
                    {p.seatNumber && <span className="as-bag"><Armchair />{p.seatNumber}</span>}
                    {p.hasSeatSelection && <span className="as-bag"><Armchair />{t("Zgjedhje vendi")}</span>}
                    {p.hasPriorityBoarding && <span className="as-bag"><ChevronRight />{t("Prioritet")}</span>}
                    {p.hasInsurance && <span className="as-bag"><Shield />{t("Sigurim")}</span>}
                  </div>
                  <div className="as-pax-money"><strong>{money(p.ticketPrice != null ? p.ticketPrice : (fl ? (p.type === "infant" ? fl.infantPrice : p.type === "child" ? fl.childPrice : fl.adultPrice) : 0))}</strong>
                    {p.extraCost > 0 && <div>+{money(p.extraCost)} {t("ekstra")}</div>}
                  </div>
                </div>
              </article>)}
              {cancelledPax.map(p => <article className="as-passenger opacity-50" key={p.id}><div className="flex gap-3 items-center"><XCircle className="text-red-500" /><div><strong className="line-through">{p.firstName} {p.lastName}</strong><p className="as-sub">{t(PAX_TYPE[p.type] ?? p.type)} · {t("Anuluar")}</p></div></div></article>)}
            </div>
          </section>
          {booking.notes && <section className="as-panel as-content"><h3>{t("Shënime")}</h3><div className="whitespace-pre-wrap text-sm">{booking.notes}</div></section>}
        </div>

        <aside className="as-panel" aria-label={t("Gjendja Financiare")}>
          <header className="as-heading"><CreditCard /><h2>{t("Gjendja Financiare")}</h2></header>
          <div className="as-payment-body">
            <div className={`as-status ${status.bg} ${status.text}`}><span><FileText />{t("Statusi i Biletës")}</span><strong>{t(status.label)}</strong></div>
            <div className={`as-status ${booking.dueAmount <= 0 ? "as-confirmed" : "as-partial"}`}><span><Clock />{t("Paguar")}</span><strong>{Math.round(pctPaid)}%</strong></div>
            <dl className="as-totals">
              <div className="as-field"><dt>{t("Shuma Totale")}</dt><dd>{money(booking.totalAmount)}</dd></div>
              <div className="as-field"><dt>{t("Paguar")}</dt><dd className="text-emerald-600">{money(booking.paidAmount)}</dd></div>
              {totalRefunded > 0 && <div className="as-field"><dt>{t("Kthyer (Rimbursim)")}</dt><dd className="text-orange-500">−{money(totalRefunded)}</dd></div>}
            </dl>
            <div className="as-due"><span>{t("Mbetet")}</span><strong className={booking.dueAmount <= 0 ? "as-paid" : undefined}>{booking.dueAmount <= 0 ? "PAID" : money(booking.dueAmount)}</strong></div>
            {booking.dueAmount > 0 && booking.status !== "cancelled" && <>
              {pokError && <div className="as-notice" role="alert">{pokError}</div>}
              <button className="as-action as-action-primary" onClick={onPay} disabled={pokLoading}>
                {pokLoading ? <Loader2 className="animate-spin" /> : <CreditCard />}{pokLoading ? t("Duke hapur pagesën…") : t("Paguaj me Kartë")}
              </button>
              <p className="as-sub text-center my-2">{t("Siguri e garantuar nga POK Pay · SSL")}</p>
            </>}
            <button className="as-action" onClick={onDownload} disabled={pdfLoading}>{pdfLoading ? <Loader2 className="animate-spin" /> : <Download />}DOWNLOAD TICKET</button>
            <BookingInvoiceDownload key={booking.bookingRef} bookingRef={booking.bookingRef} />
            <button className="as-action" onClick={onBack}><ArrowLeft />{t("Kthehu te Rezervimet")}</button>
            <section className="as-payment-history">
              <h3>{t("Historia e Pagesave")}</h3>
              {payments.length === 0 && <p className="as-sub">{t("Asnjë pagesë e regjistruar")}</p>}
              {payments.map(p => <div className="as-history-row" key={p.id}>
                <div><div className="as-history-method">{p.isRefund ? <RefreshCw /> : <Banknote />}{t(METHOD_LABEL[p.method] ?? p.method)}</div><p className="as-history-date">{date(p.createdAt)}</p>
                  {(p.reference || p.notes) && <p className="as-sub">{[p.reference, p.notes].filter(Boolean).join(" · ")}</p>}
                </div><strong className={p.isRefund ? "text-orange-500" : "text-emerald-600"}>{p.isRefund ? "−" : "+"}{money(p.amount)}</strong>
              </div>)}
              {payments.length > 0 && <div className="as-field"><span>{t("Gjithsej Paguar")}</span><strong className="text-emerald-600">{money(booking.paidAmount)}</strong></div>}
            </section>
          </div>
        </aside>
      </div>
    </div>
  </div>;
}
