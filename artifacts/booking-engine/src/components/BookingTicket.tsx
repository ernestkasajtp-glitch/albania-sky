import { Plane, ArrowRight, User, Calendar, CreditCard, Phone, Mail, Download } from "lucide-react";
import { fmtM, fmtAmPm } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface BookingTicketProps {
  booking: any;
  flight: any;
  passengers: any[];
  totals: { ticket: number; tax: number; extras: number; total: number };
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export function BookingTicket({ booking, flight, passengers, totals, customerName, customerEmail, customerPhone }: BookingTicketProps) {
  const { t, i18n } = useTranslation();
  const handlePrint = () => {
    window.print();
  };

  const typeLabel = (t: string) => t === "adult" ? "I Rritur" : t === "child" ? "Fëmijë" : "Foshnjë";

  return (
    <>
      {/* Print button - hidden during print */}
      <div className="no-print flex justify-center mb-6">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md"
        >
          <Download className="h-4 w-4" />
          {t("Shkarko / Printo PDF")}
        </button>
      </div>

      {/* Ticket - shown on screen and in print */}
      <div id="booking-ticket" className="ticket-container max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg print:shadow-none print:border print:rounded-none print:max-w-full">

        {/* Header */}
        <div className="bg-blue-600 text-white px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plane className="h-6 w-6" />
              <span className="text-xl font-bold tracking-wide">Albania Sky</span>
            </div>
            <div className="text-right">
              <div className="text-blue-200 text-xs uppercase tracking-wider mb-1">{t("Referenca e Rezervimit")}</div>
              <div className="text-2xl font-mono font-bold">{booking.bookingRef}</div>
            </div>
          </div>
        </div>

        {/* Flight details strip */}
        <div className="bg-blue-50 border-b border-blue-100 px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{flight.fromCity}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtAmPm(flight.departureTime)}</div>
            </div>
            <div className="flex-1 flex flex-col items-center px-6">
              <div className="flex items-center gap-2 w-full">
                <div className="h-px flex-1 border-t-2 border-dashed border-blue-300" />
                <Plane className="h-5 w-5 text-blue-500 rotate-90" />
                <div className="h-px flex-1 border-t-2 border-dashed border-blue-300" />
              </div>
              <div className="text-xs text-gray-500 mt-2">{flight.airline} · {flight.flightNumber}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{flight.toCity}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtAmPm(flight.arrivalTime)}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mt-4 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{flight.departureDate}</span>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <div className="text-gray-600">
              {t("Statusi:")} <span className={`font-semibold ${booking.status === "confirmed" ? "text-green-600" : "text-yellow-600"}`}>
                {booking.status === "confirmed" ? t("Konfirmuar") : booking.status === "pending" ? t("Në Pritje") : booking.status === "ticketed" ? t("Biletuar") : booking.status === "cancelled" ? t("Anuluar") : booking.status}
              </span>
            </div>
          </div>
        </div>

        {/* Dashes separator */}
        <div className="relative px-8 py-0">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-10 bg-gray-100 rounded-r-full border-r border-t border-b border-gray-200" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-10 bg-gray-100 rounded-l-full border-l border-t border-b border-gray-200" />
          <div className="border-t-2 border-dashed border-gray-200 my-0 mx-6" />
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Contact info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("Kontakti")}</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <User className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="font-medium">{customerName}</span>
              </div>
              {customerEmail && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{customerEmail}</span>
                </div>
              )}
              {customerPhone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{customerPhone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Passengers */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t("Pasagjerët")} ({passengers.length})
            </h3>
            <div className="space-y-2">
              {passengers.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">{p.firstName} {p.lastName}</span>
                    <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {t(typeLabel(p.type))}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-gray-500 text-xs">
                    {p.passportNumber && <span>{t("Pasaporta:")} <span className="font-mono text-gray-700">{p.passportNumber}</span></span>}
                    {p.nationality && <span>{p.nationality}</span>}
                    {p.dateOfBirth && <span>{t("Datëlindja:")} {p.dateOfBirth}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("Çmimi")}</h3>
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("Bileta")} × {passengers.length}</span>
                <span>€{fmtM(totals.ticket)}</span>
              </div>
              {totals.tax > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Taksa & Tarifa")}</span>
                  <span>€{fmtM(totals.tax)}</span>
                </div>
              )}
              {totals.extras > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Shërbime Shtesë")}</span>
                  <span>€{fmtM(totals.extras)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
                <span>{t("Gjithsej")}</span>
                <span className="text-blue-700">€{fmtM(totals.total)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 px-8 py-4 flex items-center justify-between text-xs text-gray-400">
          <div>
            <CreditCard className="h-3.5 w-3.5 inline mr-1" />
            {t("Lëshuar:")} {(() => {
              const now = new Date();
              return now.toLocaleDateString(i18n.language === "en" ? "en-GB" : "sq-AL", { day: "2-digit", month: "long", year: "numeric" }) +
                ", " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            })()}
          </div>
          <div className="font-mono">{booking.bookingRef}</div>
        </div>

      </div>
    </>
  );
}
