import { Check } from "lucide-react";

// Opsioni 4 — MINIMAL PRO: e bardhë kirurgjikale, vijë ari lart, tipografi e qetë
export function MinimalPro() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-end p-6">
      <div className="relative inline-flex items-center gap-3 rounded-lg bg-white pl-4 pr-2.5 py-2 shadow-[0_6px_24px_rgba(15,23,42,0.10),0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-slate-900 tabular-nums">1</span>
          <span className="text-xs text-slate-500">ndryshim i paruajtur</span>
        </span>
        <button className="inline-flex items-center gap-1.5 rounded-md h-8 px-4 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition">
          <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />Ruaj ndryshimet
        </button>
        <button className="rounded-md h-8 px-3 text-xs font-medium text-slate-400 hover:text-red-600 transition">
          Anulo
        </button>
      </div>
    </div>
  );
}
