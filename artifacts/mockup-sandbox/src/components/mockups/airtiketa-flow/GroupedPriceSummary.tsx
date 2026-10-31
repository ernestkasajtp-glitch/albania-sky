import { CreditCard, Plane } from "lucide-react";
import { calculate, city, demoFlights, emptyPassenger, type Flight, type Passenger } from "./_data";
import { money } from "./_shared";
import "./SidebarPassengers.css";
import "./GroupedPriceSummary.css";

// Isolated illustration: no stored flow state, booking, payment or API calls.
const flight: Flight = {
  ...demoFlights[0],
  adultPrice: 150, agentAdultPrice: 150,
  childPrice: 150, agentChildPrice: 150,
  infantPrice: 35, agentInfantPrice: 35,
  checkedBaggagePrice: 60, tax: 0,
};
const passengers: Passenger[] = [
  { ...emptyPassenger("adult"), baggageOption: "checked" },
  emptyPassenger("adult"),
  emptyPassenger("adult"),
  emptyPassenger("child"),
  emptyPassenger("infant"),
];
const groups = [
  { type: "adult", label: "Adult", price: flight.agentAdultPrice },
  { type: "child", label: "Child", price: flight.agentChildPrice },
  { type: "infant", label: "Infant", price: flight.agentInfantPrice },
] as const;
const amounts = calculate(flight, passengers);

export function GroupedPriceSummary() {
  return (
    <main className="as-flow as-source-parity as-sidebar-passengers as-grouped-preview" lang="en">
      <div className="as-grouped-column">
        <p className="as-grouped-notice">Prototype / sample data</p>
        <section className="as-panel as-sidebar-flight" aria-label={`${flight.airline} ${flight.flightNumber}`}>
          <div className="as-sidebar-flight-heading"><Plane aria-hidden="true" /><h2>Flights</h2></div>
          <div className="as-sidebar-airline"><strong>{flight.airline}</strong><span>{flight.flightNumber}</span></div>
          <p className="as-sidebar-date"><time dateTime={flight.departureDate}>
            {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${flight.departureDate}T12:00:00Z`))}
          </time></p>
          <div className="as-sidebar-itinerary">
            <div className="as-sidebar-airport"><strong>{flight.fromCity}</strong><small>{city(flight.fromCity)}</small><time>{flight.departureTime}</time></div>
            <div className="as-sidebar-route-line" aria-hidden="true"><Plane /></div>
            <div className="as-sidebar-airport"><strong>{flight.toCity}</strong><small>{city(flight.toCity)}</small><time>{flight.arrivalTime}</time></div>
          </div>
          <div className="as-sidebar-fare"><span>per person</span><strong>{money(flight.agentAdultPrice)}</strong></div>
        </section>
        <aside className="as-panel as-summary" aria-label="Price Summary">
          <h2>Price Summary</h2>
          <div className="as-divider" />
          {groups.map(group => {
            const count = passengers.filter(passenger => passenger.type === group.type).length;
            return <div className="as-summary-row" key={group.type}>
              <span>{count} x {group.label}</span>
              <strong>{money(count * group.price)}</strong>
            </div>;
          })}
          <div className="as-summary-row">
            <span>Additional services<small>Checked baggage</small></span>
            <strong>{money(amounts.extras)}</strong>
          </div>
          <div className="as-divider" />
          <div className="as-total"><strong>Total</strong><strong>{money(amounts.total)}</strong></div>
          <div className="as-source-actions">
            <button type="button" className="as-btn" disabled>Confirm Booking</button>
            <button type="button" className="as-btn secondary" disabled><CreditCard aria-hidden="true" />Pay and Book</button>
          </div>
        </aside>
      </div>
    </main>
  );
}
