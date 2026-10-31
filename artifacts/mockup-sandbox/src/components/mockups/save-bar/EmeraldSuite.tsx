import { Check, X } from "lucide-react";

// Opsioni 5 — EMERALD SUITE: pill smerald monokrom, elegant dhe i sigurt
export function EmeraldSuite() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-end p-6">
      <div className="inline-flex items-center gap-2.5 rounded-full pl-2 pr-2 py-1.5 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 shadow-[0_8px_28px_rgba(4,120,87,0.35)] border border-emerald-400/40">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-extrabold bg-white text-emerald-700 shadow">1</span>
        <span className="text-xs font-semibold text-emerald-50 pr-1">ndryshim i paruajtur</span>
        <button className="inline-flex items-center gap-1.5 rounded-full h-8 px-4 text-xs font-bold bg-white text-emerald-700 shadow hover:shadow-md hover:-translate-y-px transition-all">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />Ruaj
        </button>
        <button className="inline-flex items-center justify-center rounded-full h-8 w-8 text-emerald-100 bg-white/10 border border-white/20 hover:bg-white/20 transition" title="Anulo">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
