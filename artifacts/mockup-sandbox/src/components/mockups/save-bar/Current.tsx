import { Check } from "lucide-react";

// Baseline — kopja besnike e shiritit aktual "Ruaj" (amber + emerald)
export function Current() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-end p-6">
      <div className="inline-flex items-center gap-2 border-2 rounded-md shadow-[0_4px_14px_rgba(0,0,0,0.15)] pl-2 pr-2 py-1 bg-gradient-to-r from-amber-400 to-amber-500 border-amber-600">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-sm text-[11px] font-bold ring-1 bg-white text-amber-700 ring-white/60">1</span>
        <span className="text-xs font-semibold pr-1 text-white">të paruajtur</span>
        <button className="inline-flex items-center font-bold shadow rounded-md h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
          <Check className="h-3.5 w-3.5 mr-1" />Ruaj
        </button>
        <button className="bg-white/95 hover:bg-white text-amber-900 border border-white/70 font-semibold rounded-md h-7 px-2.5 text-xs">
          Anulo
        </button>
      </div>
    </div>
  );
}
