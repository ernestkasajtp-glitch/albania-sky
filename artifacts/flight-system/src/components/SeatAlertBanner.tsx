import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { X, Armchair } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fmtAmPm } from "@/lib/utils";
import { useFmsNotifications } from "@/hooks/useFmsNotifications";

// Shirit i kuq lart në çdo faqe: fluturimet ku kontrolli i Google gjeti më pak
// vende se pragu (low_seats), me numrin e kontrolleve radhazi të ruajtur në DB.
// Mbyllet me X, por rishfaqet kur përdoruesi kalon në një faqe tjetër.
export function SeatAlertBanner() {
  const [location] = useLocation();
  const { user } = useAdminAuth();
  const { seatAlerts: flights } = useFmsNotifications(user);
  const [dismissed, setDismissed] = useState(false);

  // Rishfaq banner-in sa herë ndryshon faqja
  useEffect(() => { setDismissed(false); }, [location]);

  if (!user || dismissed || flights.length === 0) return null;

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y?.slice(2)}`;
  };
  // The count is a stored numeric field, not text parsed from the detail.
  const missOf = (f: (typeof flights)[number]) => {
    const count = Number.isFinite(Number(f.seatMissCount)) ? Math.max(0, Number(f.seatMissCount)) : 0;
    return `${count}/3`;
  };

  return (
    <div className="bg-red-600 text-white shrink-0">
      <div className="flex items-start md:items-center gap-2 px-3 md:px-6 py-2">
        <Armchair className="h-4 w-4 shrink-0 mt-0.5 md:mt-0 animate-pulse" />
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-[13px]">
          <span className="font-bold whitespace-nowrap">
            {flights.length === 1
              ? "1 fluturim me pak vende në Google:"
              : `${flights.length} fluturime me pak vende në Google:`}
          </span>
          {flights.map(f => {
            const miss = missOf(f);
            return (
              <Link key={f.id} href={`/flights/${f.id}`}>
                <span className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-2.5 py-0.5 cursor-pointer whitespace-nowrap">
                  <span className="font-semibold">{f.fromCity} → {f.toCity}</span>
                  {f.flightNumber ? <span className="opacity-80">{f.flightNumber}</span> : null}
                  <span className="opacity-80">{fmtDate(f.departureDate)} {fmtAmPm(f.departureTime)}</span>
                  {miss && (
                    <span className="font-bold bg-white text-red-700 rounded-full px-1.5 py-px text-[10px] md:text-[11px]">
                      {miss}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => setDismissed(true)}
          title="Mbyll njoftimin"
          className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
