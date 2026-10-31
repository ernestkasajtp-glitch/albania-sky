import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { X, AlarmClock } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fmtAmPm } from "@/lib/utils";
import { useFmsNotifications } from "@/hooks/useFmsNotifications";

// Rresht i kuq lart në çdo faqe: fluturimet që do të kalojnë në "end selling"
// (mbyllje automatike e shitjes) brenda 1 ore. Mbyllet me X, por rishfaqet
// kur përdoruesi kalon në një faqe tjetër.
export function ClosingSoonBanner() {
  const [location] = useLocation();
  const { user } = useAdminAuth();
  const { closing: flights } = useFmsNotifications(user);
  const [dismissed, setDismissed] = useState(false);

  // Rishfaq banner-in sa herë ndryshon faqja
  useEffect(() => { setDismissed(false); }, [location]);

  if (!user || dismissed || flights.length === 0) return null;

  const closeTimeOf = (f: (typeof flights)[number]) => fmtAmPm((f.closeAt || "").slice(11, 16));

  return (
    <div className="bg-red-600 text-white shrink-0">
      <div className="flex items-start md:items-center gap-2 px-3 md:px-6 py-2">
        <AlarmClock className="h-4 w-4 shrink-0 mt-0.5 md:mt-0 animate-pulse" />
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-[13px]">
          <span className="font-bold whitespace-nowrap">
            {flights.length === 1
              ? "1 fluturim mbyll shitjen së shpejti:"
              : `${flights.length} fluturime mbyllin shitjen së shpejti:`}
          </span>
          {flights.map(f => (
            <Link key={f.id} href={`/flights/${f.id}`}>
              <span className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-2.5 py-0.5 cursor-pointer whitespace-nowrap">
                <span className="font-semibold">{f.fromCity} → {f.toCity}</span>
                {f.flightNumber ? <span className="opacity-80">{f.flightNumber}</span> : null}
                <span className="opacity-80">niset {fmtAmPm(f.departureTime)}</span>
                <span className="font-bold bg-white text-red-700 rounded-full px-1.5 py-px text-[10px] md:text-[11px]">
                  edhe {f.minutesLeft} min ({closeTimeOf(f)})
                </span>
              </span>
            </Link>
          ))}
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
