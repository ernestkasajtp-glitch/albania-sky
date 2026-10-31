import { useId } from "react";
import { Button } from "@/components/ui/button";
import { agencyColorStyle } from "@/lib/agencyDisplayColor";
import { AGENCY_COLOR_PRESETS } from "@/lib/agencyColorPalette";

export function AgentColorPicker({ value, onChange }: {
  value: string | null | undefined;
  onChange: (color: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2 rounded-md border p-3">
      <label htmlFor={id} className="text-sm font-medium">Ngjyra në rezervime</label>
      <div className="flex flex-wrap items-center gap-3">
        <input id={id} type="color" value={value || "#1d4ed8"}
          onChange={event => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded border bg-background p-1"
          data-testid="agent-display-color" />
        <span className="text-xs text-muted-foreground">{value || "Pa ngjyrë të caktuar"}</span>
        <Button type="button" variant="outline" size="sm" disabled={!value}
          onClick={() => onChange(null)}>Hiq ngjyrën</Button>
      </div>
      <p className="text-xs text-muted-foreground">64 ngjyra të gatshme</p>
      <div className="grid grid-cols-8 gap-2" role="group" aria-label="64 ngjyra të gatshme">
        {AGENCY_COLOR_PRESETS.map(({ color, label }) => (
          <button key={color} type="button" aria-label={label}
            aria-pressed={value?.toLowerCase() === color} title={`${label} · ${color}`}
            className={`relative aspect-square w-full max-w-8 justify-self-center rounded-md border-2 border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${value?.toLowerCase() === color ? "ring-2 ring-slate-900" : "ring-1 ring-slate-300"}`}
            style={{ backgroundColor: color }} onClick={() => onChange(color)}>
            {value?.toLowerCase() === color && (
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">✓</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="rounded border bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        style={agencyColorStyle(value)}>Agjencia · KTF1234</div>
      <p className="text-xs text-muted-foreground">
        Ngjyros emrin e agjencisë dhe referencën në listën e rezervimeve.
        Zgjidh një ngjyrë të lexueshme mbi sfond të bardhë. Dokumentet nuk ndryshojnë.
      </p>
    </div>
  );
}