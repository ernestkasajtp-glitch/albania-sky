import { useState, useEffect, useRef } from "react";
import { useTranslation, fmtM } from "./_local";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { monthsLong, weekHeadersMon } from "./_dates";

export interface AirportOption { code: string; city: string; name: string; label: string; }
// date string → min price (€)
export type FlightPriceMap = Map<string, number>;

export const ALB_MONTHS = ["Janar","Shkurt","Mars","Prill","Maj","Qershor","Korrik","Gusht","Shtator","Tetor","Nëntor","Dhjetor"];

// ─── Airport Combobox ─────────────────────────────────────────────────────────
export function AirportCombobox({ value, onChange, placeholder, airports }: {
  value: string; onChange: (v: string) => void; placeholder: string; airports: AirportOption[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // True while the user is actively typing — prevents the airports-change
  // effect from overwriting what they typed (e.g. restoring "TIA – Tirana"
  // when the user has backspaced down to "TIA").
  const typingRef = useRef(false);

  useEffect(() => {
    if (typingRef.current) return;
    if (!value) { setQuery(""); return; }
    const found = airports.find(a => a.code === value);
    setQuery(found ? `${found.code} – ${found.city}` : value);
  }, [value, airports]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = airports.filter(a => {
    const q = query.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const select = (a: AirportOption) => {
    typingRef.current = false;
    onChange(a.code);
    setQuery(`${a.code} – ${a.city}`);
    setOpen(false);
  };

  const handleClear = () => {
    typingRef.current = false;
    onChange("");
    setQuery("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    typingRef.current = true;
    setQuery(e.target.value);
    setOpen(true);
    // Only propagate empty to parent (so parent can reset validTo/validFrom);
    // partial text is kept local so airports-change effects don't fight the user.
    if (!e.target.value) { typingRef.current = false; onChange(""); }
  };

  const handleBlur = () => {
    // Delay so a dropdown onMouseDown (which prevents blur) fires first.
    setTimeout(() => {
      typingRef.current = false;
      setOpen(false);
      if (!value) { setQuery(""); return; }
      const found = airports.find(a => a.code === value);
      setQuery(found ? `${found.code} – ${found.city}` : "");
      if (!found) onChange("");
    }, 200);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
        <input value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
        />
        {query
          ? <button
              type="button"
              aria-label={t("Pastro")}
              title={t("Pastro")}
              // Use onMouseDown + preventDefault so the input never blurs on clear.
              // Otherwise the delayed onBlur handler captures the stale (old) value
              // and restores the airport label — making it look like it "reappears".
              data-activity-press data-activity-label="Pastro aeroportin"
              onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
              className="mr-2 flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-gray-200 text-gray-700 ring-1 ring-gray-300 shadow-sm transition-colors hover:bg-red-500 hover:text-white hover:ring-red-500"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
          : <ChevronDown className="h-3.5 w-3.5 text-gray-300 mr-2 shrink-0" />}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {filtered.map(a => (
            <button key={a.code} type="button" data-activity-press data-activity-label={`Zgjodhi aeroportin ${a.code} — ${a.city}`} onMouseDown={e => { e.preventDefault(); select(a); }}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
              <span className="font-bold text-blue-700 text-sm mr-2">{a.code}</span>
              <span className="text-gray-800 text-sm">{a.city}</span>
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">{a.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Flight Calendar with prices ──────────────────────────────────────────────
export function FlightCalendar({ value, onChange, flightPrices }: {
  value: string;
  onChange: (date: string) => void;
  flightPrices: FlightPriceMap;
}) {
  const { t } = useTranslation();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const initYear = value ? parseInt(value.slice(0, 4)) : today.getFullYear();
  const initMonth = value ? parseInt(value.slice(5, 7)) - 1 : today.getMonth();
  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1);

  const displayLabel = value
    ? (() => { const d = new Date(value + "T00:00:00"); return `${d.getDate()} ${monthsLong()[d.getMonth()]} ${d.getFullYear()}`; })()
    : null;

  const fmtPrice = (p: number) => `€${fmtM(p)}`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left">
        <span className={displayLabel ? "text-gray-900" : "text-gray-400"}>{displayLabel || t("Zgjidh datën")}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span role="button" aria-label="Pastro datën" onClick={e => { e.stopPropagation(); onChange(""); }}
              className="flex items-center justify-center h-6 w-6 shrink-0 rounded-full bg-gray-200 text-gray-700 ring-1 ring-gray-300 shadow-sm transition-colors hover:bg-red-500 hover:text-white hover:ring-red-500 cursor-pointer">
              <X className="h-4 w-4" strokeWidth={3} />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4" style={{ width: 316 }}>
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" aria-label="Muaji i mëparshëm" onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-900 text-sm">{monthsLong()[month]} {year}</span>
            <button type="button" aria-label="Muaji tjetër" onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>

          {/* Legend */}
          {flightPrices.size > 0 && (
            <div className="flex items-center gap-2 mb-3 bg-gradient-to-r from-red-50 to-rose-50 border border-red-100 rounded-xl px-3 py-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-white text-[10px]">·</span>
              </div>
              <div className="text-[11px]">
                <span className="font-semibold text-red-700">{t("{{count}} data me fluturime", { count: flightPrices.size })}</span>
                <span className="text-red-400 ml-1">· {t("çmimi nga/person")}</span>
              </div>
            </div>
          )}

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {weekHeadersMon().map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const price = flightPrices.get(ds);
              const hasFlight = price !== undefined;
              const isSelected = value === ds;
              const isPast = ds < todayStr;

              if (hasFlight && !isPast) {
                return (
                  <button key={day} type="button" aria-label={`Zgjidh datën ${ds}`} onClick={() => { onChange(ds); setOpen(false); }}
                    className={[
                      "flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer",
                      isSelected
                        ? "bg-blue-600 ring-2 ring-blue-300 shadow-lg shadow-blue-200"
                        : "bg-gradient-to-b from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-md shadow-rose-100 hover:shadow-rose-200 hover:scale-105",
                    ].join(" ")}
                    style={{ height: 48 }}
                  >
                    <span className="text-white text-sm font-bold leading-none">{day}</span>
                    <span className={`text-[9px] font-semibold leading-none mt-1 ${isSelected ? "text-blue-200" : "text-red-100"}`}>
                      {fmtPrice(price!)}
                    </span>
                  </button>
                );
              }

              return (
                <button key={day} type="button" disabled={isPast}
                  onClick={() => !isPast && (onChange(ds), setOpen(false))}
                  className={[
                    "flex items-center justify-center rounded-xl text-sm font-medium transition-all",
                    isPast ? "text-gray-200 cursor-not-allowed" :
                    isSelected ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-200" :
                    "text-gray-500 hover:bg-gray-100 cursor-pointer",
                  ].join(" ")}
                  style={{ height: 48 }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex justify-between items-center">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600">{t("Pastro")}</button>
            <button type="button" onClick={() => { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">{t("Sot")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
