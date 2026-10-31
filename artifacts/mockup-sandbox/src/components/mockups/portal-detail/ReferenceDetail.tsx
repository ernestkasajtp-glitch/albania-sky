import "./_group.css";
import "./_detail.css";
import { useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, ChevronRight, Clock, CreditCard, Download, FileText, Luggage, Plane, Users } from "lucide-react";
import { demoBooking } from "./_demo";

const money = (amount: number) => `€${Math.round(amount).toLocaleString("de-DE")}`;
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function ReferenceDetail() {
  const booking = demoBooking;
  const flight = booking.flight;
  const [notice, setNotice] = useState("");
  const demoAction = (action: string) => setNotice(`Propozim vizual — ${action}. Asnjë veprim real nuk kryhet.`);
  const assetBase = `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/`;

  return (
    <div className="as-detail">
      <div className="as-container">
        <header className="as-top">
          <img className="as-logo" src={`${assetBase}images/travel-pro/albania-sky-logo.png`} alt="Albania Sky" />
          <span className="as-demo">Propozim vizual</span>
        </header>
        <nav className="as-breadcrumb" aria-label="Vendndodhja">
          <button onClick={() => demoAction("kthimi te lista është vetëm demonstrim")}>Rezervimet e mia</button>
          <ChevronRight />
          <strong>Rezervimi #{booking.bookingRef}</strong>
        </nav>

        <div className="as-grid">
          <main className="as-main">
            <article className="as-panel">
              <header className="as-heading"><FileText /><h1>Detajet e rezervimit</h1></header>
              <div className="as-info">
                <section>
                  <h3>Informacioni i rezervimit</h3>
                  <dl>
                    <div className="as-field"><dt>Referenca</dt><dd className="as-code">{booking.bookingRef}</dd></div>
                    <div className="as-field"><dt>Data e rezervimit</dt><dd>{date(booking.createdAt)}, 10:30</dd></div>
                    <div className="as-field"><dt>Statusi</dt><dd>Konfirmuar</dd></div>
                    <div className="as-field as-pnr"><dt>Kodi PNR</dt><dd className="as-code">{booking.pnr}</dd></div>
                  </dl>
                </section>
                <section>
                  <h3>Klienti i agjencisë</h3>
                  <dl>
                    <div className="as-field"><dt>Emri</dt><dd>{booking.customerName}</dd></div>
                    <div className="as-field"><dt>Email</dt><dd>{booking.customerEmail}</dd></div>
                    <div className="as-field"><dt>Pasagjerë</dt><dd>{booking.passengers.length} të rritur</dd></div>
                  </dl>
                </section>
              </div>
            </article>

            <article className="as-panel">
              <header className="as-heading"><Plane /><h2>Detajet e fluturimit</h2></header>
              <div className="as-content">
                <div className="as-airline">
                  <span className="as-airline-mark"><Plane /></span>
                  <div><strong>{flight.airline}</strong><p className="as-sub">Fluturimi {flight.flightNumber}</p></div>
                </div>
                <div className="as-timeline">
                  <div>
                    <div className="as-airport">{flight.fromCity}</div>
                    <div className="as-sub">Tiranë</div>
                    <div className="as-time">{flight.departureTime}</div>
                    <div className="as-sub">{date(flight.departureDate)}</div>
                  </div>
                  <div className="as-route"><span>{flight.flightNumber}</span><div className="as-route-line"><Plane /></div><span>TIA → MXP</span></div>
                  <div className="as-destination">
                    <div className="as-airport">{flight.toCity}</div>
                    <div className="as-sub">Milano · Malpensa</div>
                    <div className="as-time">{flight.arrivalTime}</div>
                    <div className="as-sub">{date(flight.arrivalDate)}</div>
                  </div>
                </div>
                <div className="as-flight-meta">
                  <div><p className="as-meta-label">DATA E NISJES</p><strong>{date(flight.departureDate)}</strong></div>
                  <div><p className="as-meta-label">STATUSI I REZERVIMIT</p><strong>Konfirmuar</strong></div>
                </div>
                <div className="as-pax-count"><Users />{booking.passengers.length} pasagjerë të rritur</div>
              </div>
            </article>

            <article className="as-panel">
              <header className="as-heading"><Users /><h2>Pasagjerët dhe shërbimet shtesë</h2></header>
              <div className="as-pax-list">
                {booking.passengers.map((passenger, index) => (
                  <section className="as-passenger" key={passenger.id}>
                    <div className="as-pax-top">
                      <div><p className="as-pax-type">I rritur {index + 1}</p><strong>{passenger.firstName} {passenger.lastName}</strong></div>
                      <div className="as-sub">PNR <strong>{passenger.pnr}</strong></div>
                    </div>
                    <div className="as-pax-bottom">
                      <span className="as-bag"><Luggage />Bagazh i kontrolluar · {flight.checkedBaggageKg} kg</span>
                      <div className="as-pax-money">{money(passenger.ticketPrice)} biletë + {money(passenger.extraCost)} ekstra<br /><strong>{money(passenger.ticketPrice + passenger.extraCost)}</strong></div>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </main>

          <aside className="as-panel" aria-label="Përmbledhja e pagesës">
            <header className="as-heading"><CreditCard /><h2>Përmbledhja e pagesës</h2></header>
            <div className="as-payment-body">
              <div className="as-status as-confirmed"><span><CheckCircle2 />Rezervimi</span><strong>Konfirmuar</strong></div>
              <div className="as-status as-partial"><span><Clock />Pagesa</span><strong>E pjesshme</strong></div>
              <dl className="as-totals">
                <div className="as-field"><dt>Biletat · 2 × {money(flight.adultPrice)}</dt><dd>{money(booking.passengers.reduce((sum, p) => sum + p.ticketPrice, 0))}</dd></div>
                <div className="as-field"><dt>Ekstra · 2 × €20</dt><dd>{money(booking.passengers.reduce((sum, p) => sum + p.extraCost, 0))}</dd></div>
                <div className="as-field"><dt>Shuma totale</dt><dd>{money(booking.totalAmount)}</dd></div>
                <div className="as-field"><dt>Paguar</dt><dd>{money(booking.paidAmount)}</dd></div>
              </dl>
              <div className="as-due"><span>Mbetet për pagesë</span><strong>{money(booking.dueAmount)}</strong></div>
              <p className="as-gateway"><span>Mënyra e pagesës</span><strong>Kartë · POK Pay</strong></p>
              <button className="as-action as-action-primary" onClick={() => demoAction("pagesa me POK Pay është vetëm demonstrim")}><CreditCard />Paguaj me kartë · {money(booking.dueAmount)}</button>
              <button className="as-action" onClick={() => demoAction("shkarkimi PDF është vetëm demonstrim")}><Download />Shkarko PDF</button>
              <button className="as-action" onClick={() => demoAction("kthimi te lista është vetëm demonstrim")}><ArrowLeft />Kthehu te rezervimet</button>
              {notice && <div className="as-notice" role="status">{notice}</div>}
              <section className="as-payment-history">
                <h3>Historia e pagesave</h3>
                {booking.payments.map(payment => (
                  <div className="as-history-row" key={payment.id}>
                    <div><div className="as-history-method"><Banknote />{payment.method}</div><p className="as-history-date">{date(payment.createdAt)} · 10:30</p></div>
                    <strong>{money(payment.amount)}</strong>
                  </div>
                ))}
              </section>
            </div>
          </aside>
        </div>
        <footer className="as-footer"><span>Albania Sky · Detajet e rezervimit</span><span>Të gjitha shumat janë në EUR.</span></footer>
      </div>
    </div>
  );
}
