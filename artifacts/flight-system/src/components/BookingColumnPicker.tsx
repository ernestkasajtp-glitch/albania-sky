import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BOOKING_COLUMNS } from "@/lib/bookingColumns";
import type { useBookingColumns } from "@/hooks/useBookingColumns";

export function BookingColumnPicker({ state, canCommission }: {
  state: ReturnType<typeof useBookingColumns>;
  canCommission: boolean;
}) {
  return (
    <div className="hidden md:block">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Columns3 className="h-4 w-4" /> Kolonat
            {state.error && <span className="font-bold text-destructive" aria-label="Pamja default nuk u ngarkua">!</span>}
            {state.dirty && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Ndryshime të paruajtura" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-h-[80vh] overflow-y-auto space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Kolonat e tabelës</h3>
            <p className="text-xs text-muted-foreground">Vetëm për llogarinë tënde. Raportet nuk ndryshojnë.</p>
            <p className="text-xs text-muted-foreground mt-1">Tërhiq kufirin e kolonës për gjerësi; dyklik për përshtatje. “Ruaj default” ruan edhe gjerësitë.</p>
          </div>
          {state.loading && <p role="status" className="text-sm">Duke ngarkuar pamjen…</p>}
          {state.error && <div role="alert" className="text-sm text-destructive">
            Pamja default nuk u ngarkua. Shfaqet pamja e fundit e disponueshme.
            <Button type="button" variant="outline" size="sm" onClick={state.retry}>Provo përsëri</Button>
          </div>}
          <div className="grid grid-cols-2 gap-2">
            {BOOKING_COLUMNS.filter(column => column.k !== "commission" || canCommission).map(column => (
              <label key={column.k} className="flex items-center gap-2 rounded p-1 text-sm cursor-pointer">
                <input type="checkbox" checked={state.shown.has(column.k)}
                  disabled={state.disabled || (state.shown.has(column.k) && state.shown.size === 1)}
                  onChange={() => state.toggle(column.k)} className="h-4 w-4 accent-blue-600" />
                {column.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Mbaj të paktën një kolonë. {state.dirty ? "Zgjedhja nuk është ruajtur si default." : "Default ruhet në llogarinë tënde."}</p>
          <div className="flex flex-col gap-2 border-t pt-3">
            <Button type="button" disabled={state.disabled} onClick={state.save}>
              {state.saving ? "Duke ruajtur…" : "Ruaj default"}
            </Button>
            <Button type="button" variant="outline" disabled={state.disabled} onClick={state.reset}>
              Rikthe dhe ruaj pamjen fillestare
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}