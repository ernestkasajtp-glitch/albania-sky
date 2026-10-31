import { Plane, Users, Luggage as LuggageIcon, Info, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fmtAmPm } from "@/lib/utils";

const NAVY = "#0b1f3a";

const STATUS_STYLE: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  draft:     { label: "Draft",      text: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-400" },
  pending:   { label: "Në Pritje",  text: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   dot: "bg-orange-400" },
  confirmed: { label: "Konfirmuar", text: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500" },
  ticketed:  { label: "Ticketed",   text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  cancelled: { label: "Anuluar",    text: "text-red-700",     bg: "bg-red-50 border-red-200",         dot: "bg-red-500" },
};

const PAX_TYPE: Record<string, string> = { adult: "I Rritur", child: "Fëmijë", infant: "Foshnjë" };

export function BookingVoucher({ booking }: { booking: any }) {
  const { t, i18n } = useTranslation();
  const fl = booking.flight;
  const passengers: any[] = (booking.passengers ?? []).filter((p: any) => !p.cancelled);
  const st = STATUS_STYLE[booking.status] ?? { label: booking.status, text: "text-gray-600", bg: "bg-gray-50 border-gray-200", dot: "bg-gray-400" };
  const locale = i18n.language === "en" ? "en-GB" : "sq-AL";

  const dateLine = (() => {
    if (!fl?.departureDate) return "—";
    const d = new Date(fl.departureDate);
    const datePart = isNaN(d.getTime())
      ? fl.departureDate
      : d.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short" });
    const times = [fl.departureTime, fl.arrivalTime].filter(Boolean).map((x: any) => fmtAmPm(x)).join(" – ");
    return times ? `${datePart}, ${times}` : datePart;
  })();

  const checkedCount = passengers.filter((p: any) => p.baggageOption === "checked").length;

  // Per-passenger airline PNRs (own pnr or resolved group pnr). When passengers
  // carry separate PNRs, the top reference shows them joined: "PNR1 / PNR2".
  const paxPnrs = Array.from(
    new Set(passengers.map((p: any) => p.pnr || p.groupPnr).filter(Boolean)),
  ) as string[];
  const topPnr = paxPnrs.length > 0 ? paxPnrs.join(" / ") : (booking.pnr || "—");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${NAVY}, #1a3a6b)` }} />

      <div className="px-6 sm:px-9 py-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("Konfirmim Rezervimi")}</h1>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                {t(st.label)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${NAVY}, #1a3a6b)` }}>
              <Plane className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="font-extrabold text-[#0b1f3a] text-sm">Albania Sky</div>
              <div className="text-[10px] text-gray-400">albaniasky.com</div>
            </div>
          </div>
        </div>

        {/* Not a boarding pass note */}
        <div className="mt-5 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]" style={{ background: "#eef2ff", color: "#3730a3" }}>
          <Info className="h-4 w-4 shrink-0" />
          {t("Ky dokument nuk është karta juaj e hipjes (boarding pass).")}
        </div>

        {/* Online check-in note */}
        <div className="mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]" style={{ background: "#ecfdf5", color: "#065f46" }}>
          <Info className="h-4 w-4 shrink-0" />
          {t("Check-in online hapet 24 orë para fluturimit.")}
        </div>

        {/* Reference + flight card */}
        <div className="mt-6 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 px-5 py-4 bg-gray-50/70">
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider">{t("Referenca e Rezervimit")}</div>
              <div className="text-lg font-bold font-mono text-gray-900 tracking-wide">{booking.bookingRef}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider">
                {t("PNR i Linjës")} <span className="normal-case tracking-normal text-gray-300">· {t("për check-in")}</span>
              </div>
              <div className="text-lg font-bold font-mono text-gray-900 tracking-wide">{topPnr}</div>
            </div>
          </div>
          <div className="border-t border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-y-4 px-5 py-4">
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{t("Fluturimi")}</div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Plane className="h-3.5 w-3.5 text-gray-400" /> {fl?.airline} {fl?.flightNumber}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{t("Rruga")}</div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                {fl?.fromCity} <ArrowRight className="h-3.5 w-3.5 text-gray-400" /> {fl?.toCity}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{t("Data")}</div>
              <div className="text-sm font-semibold text-gray-800">{dateLine}</div>
            </div>
          </div>
        </div>

        {/* Who's traveling */}
        <div className="mt-7">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-gray-500" />
            <h2 className="text-[15px] font-semibold text-gray-800">{t("Kush udhëton?")}</h2>
          </div>
          <div className="space-y-2">
            {passengers.length === 0 ? (
              <div className="text-sm text-gray-400 px-4 py-3 border border-gray-200 rounded-xl">{t("Asnjë pasagjer")}</div>
            ) : (
              passengers.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 border border-gray-200 rounded-xl">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{p.firstName} {p.lastName}</div>
                    {(p.pnr || p.groupPnr || booking.pnr || p.passportNumber || p.seatNumber) && (
                      <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-3 flex-wrap">
                        {(p.pnr || p.groupPnr || booking.pnr) && <span>PNR: <span className="font-mono text-gray-600">{p.pnr || p.groupPnr || booking.pnr}</span></span>}
                        {p.passportNumber && <span>{t("Pasaporta")}: <span className="font-mono">{p.passportNumber}</span></span>}
                        {p.seatNumber && <span>{t("Vendi")}: {p.seatNumber}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{t(PAX_TYPE[p.type] ?? p.type)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Luggage */}
        <div className="mt-7">
          <div className="flex items-center gap-2 mb-3">
            <LuggageIcon className="h-4 w-4 text-gray-500" />
            <h2 className="text-[15px] font-semibold text-gray-800">{t("Bagazhi")}</h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border border-gray-200 rounded-xl">
              <div className="text-sm text-gray-800">{t("Bagazh kabine")}</div>
              <div className="text-xs text-gray-400 shrink-0">{fl?.cabinBaggageKg ? `${fl.cabinBaggageKg} Kg` : t("Përfshirë")}</div>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border border-gray-200 rounded-xl">
              <div className="text-sm text-gray-800">{checkedCount} × {t("Bagazh i Regjistruar")}</div>
              <div className="text-xs text-gray-400 shrink-0">{fl?.checkedBaggageKg ? `${fl.checkedBaggageKg} Kg` : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
