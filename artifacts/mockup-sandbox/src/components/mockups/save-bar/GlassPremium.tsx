import { Check } from "lucide-react";

// Opsioni 2 — GLASS PREMIUM: xham i mjegullt (frosted glass) + smerald
export function GlassPremium() {
  return (
    <div className="min-h-screen bg-[linear-gradient(120deg,#f1f5f9,#e2e8f0)] flex items-start justify-end p-6">
      <div className="inline-flex items-center gap-2.5 rounded-2xl pl-3 pr-2 py-2 bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5">
        <span className="relative inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold bg-amber-500 text-white">
          1
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-ping" />
        </span>
        <span className="text-xs font-semibold text-slate-700">ndryshim i paruajtur</span>
        <button className="inline-flex items-center gap-1.5 rounded-xl h-8 px-4 text-xs font-bold bg-emerald-600 text-white shadow-[0_4px_14px_rgba(5,150,105,0.4)] hover:bg-emerald-500 hover:shadow-[0_6px_20px_rgba(5,150,105,0.5)] transition-all">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />Ruaj
        </button>
        <button className="rounded-xl h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-900/5 transition">
          Anulo
        </button>
      </div>
    </div>
  );
}
