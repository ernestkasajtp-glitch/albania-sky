import { useMemo, useState } from "react";
import { groupRuleFlights, setRuleFlightSelected, type RuleFlight } from "@/lib/google-rule-selection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GoogleRuleFlightPicker({ flights, selected, onChange, showFooter = true }: {
  flights: RuleFlight[]; selected: number[]; onChange: (ids: number[]) => void; showFooter?: boolean;
}) {
  const [search, setSearch] = useState(["", ""]);
  const groups = useMemo(() => groupRuleFlights(flights), [flights]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const lists = [
    groups.filter(g => !g.ids.some(id => selectedIds.has(id))),
    groups.filter(g => g.ids.some(id => selectedIds.has(id))),
  ];
  return <div className="flex h-full min-h-0 flex-col">
    <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 gap-3">
      {lists.map((list, index) => {
        const label = index === 0 ? "Fluturimet e disponueshme" : "Fluturimet e zgjedhura";
        const query = search[index].trim().toLowerCase();
        const visible = list.filter(g => `${g.fromCity} ${g.toCity} ${g.fromCity}-${g.toCity} ${g.airline} ${g.flightNumber}`.toLowerCase().includes(query));
        return <section key={label} className="min-w-0 min-h-0 flex flex-col">
          <h4 className="text-xs font-semibold mb-2 shrink-0">{label} ({list.length})</h4>
          <Input aria-label={`Kërko te ${label.toLowerCase()}`} placeholder="Kërko: kompania, numri, rruga…"
            value={search[index]} onChange={e => setSearch(s => s.map((v, i) => i === index ? e.target.value : v))}
            className="h-9 mb-2 shrink-0" />
          <div className="border rounded-lg bg-white h-80 md:h-0 md:flex-1 md:min-h-80 xl:min-h-0 overflow-auto divide-y">
            {visible.map(g => <button type="button" key={g.key}
              aria-label={`${index === 0 ? "Shto" : "Hiq"} ${g.fromCity} → ${g.toCity} ${g.flightNumber}`}
              onClick={() => onChange(setRuleFlightSelected(selected, g.ids, index === 0))}
              title={`${g.fromCity} → ${g.toCity} · ${g.airline} ${g.flightNumber}`}
              className="w-full min-w-max text-left px-2 py-1.5 flex gap-2 items-center text-xs leading-5 whitespace-nowrap hover:bg-sky-50 focus-visible:bg-sky-50">
              <span aria-hidden="true" className={index === 0 ? "text-blue-600" : "text-red-600"}>{index === 0 ? "+" : "−"}</span>
              <strong>{g.fromCity} → {g.toCity}</strong><span className="text-gray-500">· {g.airline} {g.flightNumber}</span>
            </button>)}
            {!visible.length && <p className="p-3 text-xs text-gray-500">{query ? "Asnjë përputhje." : index === 0 ? "Nuk ka fluturime të tjera." : "Nuk ka fluturime të zgjedhura."}</p>}
          </div>
        </section>;
      })}
    </div>
    {showFooter && <GoogleRuleFlightPickerFooter selected={selected} onChange={onChange} />}
  </div>;
}

export function GoogleRuleFlightPickerFooter({ selected, onChange }: {
  selected: number[]; onChange: (ids: number[]) => void;
}) {
  return <div>
    <div className="flex justify-end">
      <Button type="button" variant="ghost" size="sm" disabled={!selected.length} onClick={() => onChange([])}>Hiq të gjitha</Button>
    </div>
    <p className="text-xs text-gray-500">Kliko për ta kaluar fluturimin në listën tjetër. Ndryshimet zbatohen vetëm pasi të ruash rregullin.</p>
  </div>;
}
