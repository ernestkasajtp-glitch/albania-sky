import { Check, X } from "lucide-react";

// Opsioni 1 — LUX GOLD: e zezë mat + ar, stil "private banking"
export function LuxGold() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-end p-6">
      <div className="inline-flex items-center gap-3 rounded-xl pl-3 pr-2 py-1.5 bg-gradient-to-b from-zinc-900 to-black border border-amber-400/60 shadow-[0_8px_30px_rgba(0,0,0,0.35),0_0_0_1px_rgba(251,191,36,0.15)]">
        <span className="inline-flex items-center justify-center h-6 min-w-6 px-1 rounded-full text-[11px] font-bold bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-inner">1</span>
        <span className="text-xs font-medium tracking-wide text-amber-100/90 uppercase">Ndryshim i paruajtur</span>
        <span className="h-5 w-px bg-amber-400/30" />
        <button className="inline-flex items-center gap-1.5 rounded-lg h-8 px-4 text-xs font-bold uppercase tracking-wider bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-black shadow-[0_2px_8px_rgba(251,191,36,0.45)] hover:brightness-110 transition">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />Ruaj
        </button>
        <button className="inline-flex items-center gap-1 rounded-lg h-8 px-3 text-xs font-semibold text-zinc-300 border border-zinc-700 hover:border-zinc-500 hover:text-white transition">
          <X className="h-3 w-3" />Anulo
        </button>
      </div>
    </div>
  );
}
