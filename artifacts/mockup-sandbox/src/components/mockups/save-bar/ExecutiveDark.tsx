import { Check, RotateCcw } from "lucide-react";

// Opsioni 3 — EXECUTIVE DARK: navy e thellë, buton smerald me shkëlqim
export function ExecutiveDark() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-end p-6">
      <div className="inline-flex items-center gap-3 rounded-lg pl-3.5 pr-2 py-2 bg-[#0f1b33] border border-slate-600/40 shadow-[0_10px_35px_rgba(2,6,23,0.45)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
          <span className="text-xs font-semibold text-slate-200">1 ndryshim i paruajtur</span>
        </span>
        <span className="h-5 w-px bg-slate-600/50" />
        <button className="inline-flex items-center gap-1.5 rounded-md h-8 px-4 text-xs font-bold bg-emerald-500 text-[#06281c] shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:bg-emerald-400 transition">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />RUAJ
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-md h-8 px-3 text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition">
          <RotateCcw className="h-3 w-3" />Anulo
        </button>
      </div>
    </div>
  );
}
