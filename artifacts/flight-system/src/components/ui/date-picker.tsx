import * as React from "react";
import { format, parse, isValid, startOfDay, isSameDay, isSameMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight, X, ChevronUp, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  className?: string;
  highlightDate?: string;
  restrictToMin?: boolean;
}

const MONTHS_SQ = [
  "Janar","Shkurt","Mars","Prill","Maj","Qershor",
  "Korrik","Gusht","Shtator","Tetor","Nëntor","Dhjetor",
];
const DAYS_SQ = ["Hë","Ma","Më","En","Pr","Sh","Dl"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday=0
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const prevDays = getDaysInMonth(year, month - 1);

  const cells: { date: Date; outside: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevDays - i), outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), outside: true });
  }
  return cells;
}

export function DatePicker({
  value, onChange, min, placeholder = "Zgjidh datën…", className, highlightDate, restrictToMin = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const computeDefaultMonth = () => {
    if (restrictToMin && min) {
      const lower = parse(min, "yyyy-MM-dd", new Date());
      const chosen = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
      if (isValid(lower)) return chosen && isValid(chosen) && chosen >= lower ? chosen : lower;
    }
    if (value)         { const d = parse(value,         "yyyy-MM-dd", new Date()); if (isValid(d)) return d; }
    if (highlightDate) { const d = parse(highlightDate, "yyyy-MM-dd", new Date()); if (isValid(d)) return d; }
    return new Date();
  };

  const [month, setMonth] = React.useState<Date>(computeDefaultMonth);

  const selected    = value         ? parse(value,         "yyyy-MM-dd", new Date()) : undefined;
  const minDate     = min           ? parse(min,           "yyyy-MM-dd", new Date()) : undefined;
  const highlightDay = highlightDate ? parse(highlightDate, "yyyy-MM-dd", new Date()) : undefined;
  const today       = new Date();
  const minMonth = minDate && isValid(minDate)
    ? new Date(minDate.getFullYear(), minDate.getMonth(), 1) : undefined;
  const monthBlocked = (date: Date) => !!(restrictToMin && minMonth && date < minMonth);

  React.useEffect(() => {
    if (!restrictToMin || !min) return;
    const lower = parse(min, "yyyy-MM-dd", new Date());
    if (!isValid(lower)) return;
    const lowerMonth = new Date(lower.getFullYear(), lower.getMonth(), 1);
    setMonth(current => current < lowerMonth ? lower : current);
  }, [min, restrictToMin]);

  React.useEffect(() => {
    if (restrictToMin) return;
    if (value) { const d = parse(value, "yyyy-MM-dd", new Date()); if (isValid(d)) setMonth(d); }
  }, [value, restrictToMin]);

  React.useEffect(() => {
    if (restrictToMin) return;
    if (!value && highlightDate) {
      const d = parse(highlightDate, "yyyy-MM-dd", new Date());
      if (isValid(d)) setMonth(d);
    }
  }, [highlightDate, value, restrictToMin]);

  function handleSelect(date: Date) {
    if (minDate && startOfDay(date) < startOfDay(minDate)) return;
    onChange(format(date, "yyyy-MM-dd"));
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  const displayValue = selected && isValid(selected) ? format(selected, "dd / MM / yyyy") : null;

  const year  = month.getFullYear();
  const mon   = month.getMonth();
  const cells = buildCalendarDays(year, mon);
  const rows  = Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <Popover open={open} onOpenChange={next => {
      if (next && restrictToMin) setMonth(computeDefaultMonth());
      setOpen(next);
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-10 w-full items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 text-sm shadow-sm",
            "transition-all duration-150",
            "hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/60",
            "focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:ring-offset-1",
            open && "border-blue-500 ring-2 ring-blue-400/30 shadow-md shadow-blue-100",
            className
          )}
        >
          <CalendarIcon className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            open || displayValue ? "text-blue-600" : "text-muted-foreground/60"
          )} />
          <span className={cn(
            "flex-1 text-left font-medium whitespace-nowrap",
            displayValue ? "text-foreground" : "text-muted-foreground/70 font-normal"
          )}>
            {displayValue ?? placeholder}
          </span>
          {displayValue && (
            <span
              role="button" tabIndex={0}
              onClick={handleClear}
              onKeyDown={e => e.key === "Enter" && handleClear(e as any)}
              className="rounded-full p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] p-0 overflow-hidden border-0 shadow-none bg-transparent"
        align="start"
        sideOffset={10}
      >
        {/* Outer shell with premium shadow */}
        <div className="rounded-2xl overflow-hidden shadow-[0_24px_60px_-8px_rgba(30,27,75,0.35),0_8px_24px_-4px_rgba(99,102,241,0.18)] ring-1 ring-white/20">

          {/* ── Header ────────────────────────────────────────────────── */}
          <div
            className="relative px-5 pt-5 pb-4 select-none"
            style={{
              background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4338ca 65%, #6366f1 100%)",
            }}
          >
            {/* Subtle noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.04]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
            />

            {/* Month + nav row */}
            <div className="relative flex items-center justify-between">
              {/* Prev month */}
              <button
                type="button"
                disabled={monthBlocked(new Date(year, mon - 1, 1))}
                onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 hover:text-white transition-all duration-150 hover:bg-white/10 active:scale-90 active:bg-white/20 backdrop-blur-sm"
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>

              {/* Month name + year */}
              <div className="text-center">
                <p className="text-[22px] font-bold text-white tracking-[0.02em] leading-tight drop-shadow-sm">
                  {MONTHS_SQ[mon]}
                </p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <button
                    type="button"
                    disabled={monthBlocked(new Date(year - 1, mon, 1))}
                    onClick={() => setMonth(m => new Date(m.getFullYear() - 1, m.getMonth(), 1))}
                    className="text-indigo-300 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="text-[13px] font-semibold text-indigo-200 tracking-widest">
                    {year}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMonth(m => new Date(m.getFullYear() + 1, m.getMonth(), 1))}
                    className="text-indigo-300 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Next month */}
              <button
                type="button"
                onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 hover:text-white transition-all duration-150 hover:bg-white/10 active:scale-90 active:bg-white/20 backdrop-blur-sm"
              >
                <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Day-name headers */}
            <div className="grid grid-cols-7 mt-4 mb-0.5">
              {DAYS_SQ.map((d, i) => (
                <div key={d} className={cn(
                  "text-center text-[10px] font-bold tracking-[0.12em] uppercase py-1",
                  i >= 5 ? "text-rose-300/70" : "text-indigo-200/70"
                )}>
                  {d}
                </div>
              ))}
            </div>
          </div>

          {/* ── Calendar Body ────────────────────────────────────────── */}
          <div className="bg-white px-3 pt-2 pb-1">
            <div className="grid grid-cols-7 gap-y-0.5">
              {rows.flat().map(({ date, outside }, idx) => {
                const isSelected   = selected && isValid(selected) && isSameDay(date, selected);
                const isToday      = isSameDay(date, today);
                const isHighlight  = highlightDay && isValid(highlightDay) && isSameDay(date, highlightDay);
                const isDisabled   = minDate ? startOfDay(date) < startOfDay(minDate) : false;
                const isWeekend    = idx % 7 >= 5;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && handleSelect(date)}
                    className={cn(
                      "relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-150",
                      // Base states
                      !isSelected && !isDisabled && !outside && "hover:bg-indigo-50 hover:text-indigo-700 hover:scale-105",
                      !isSelected && !isDisabled && !outside && isWeekend && "text-rose-400 hover:bg-rose-50 hover:text-rose-600",
                      !isSelected && !isDisabled && !outside && !isWeekend && "text-slate-700",
                      // Outside days
                      outside && "text-slate-200 hover:bg-slate-50 hover:text-slate-300",
                      // Disabled
                      isDisabled && "text-slate-200 cursor-not-allowed hover:bg-transparent hover:scale-100",
                      // Today ring
                      isToday && !isSelected && "ring-2 ring-indigo-400 ring-offset-1 text-indigo-700",
                      // Highlight (flight date)
                      isHighlight && !isSelected && "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-1",
                      // Selected
                      isSelected && "text-white scale-105 shadow-lg shadow-indigo-400/40",
                    )}
                    style={isSelected ? {
                      background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)",
                    } : undefined}
                  >
                    {date.getDate()}
                    {isToday && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100/80">
            <button
              type="button"
              disabled={!!(restrictToMin && minDate && startOfDay(today) < startOfDay(minDate))}
              onClick={() => {
                if (minDate && startOfDay(today) < startOfDay(minDate)) return;
                onChange(format(today, "yyyy-MM-dd"));
                setOpen(false);
              }}
              className={cn(
                "text-xs font-bold tracking-wide px-3 py-1.5 rounded-lg transition-all duration-150",
                "text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 active:scale-95"
              )}
            >
              Sot
            </button>
            {displayValue && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Pastro
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
