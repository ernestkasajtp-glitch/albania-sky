import { Search, Filter, Plus, Globe, MessageSquare, ChevronDown, MoreHorizontal, Plane, ArrowUpRight, ArrowDownRight, TrendingUp, Calendar, Sparkles, Bell, Users, CreditCard, CircleDollarSign, AlertCircle } from "lucide-react";

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:      { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-400",   label: "Draft" },
  pending:    { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500",   label: "Pritje" },
  confirmed:  { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500",    label: "Konfirmuar" },
  ticketed:   { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500", label: "Biletuar" },
  cancelled:  { bg: "bg-rose-50",     text: "text-rose-700",    dot: "bg-rose-500",    label: "Anuluar" },
};

const ROWS = [
  { id: 1, ref: "FLT048217", pnr: "K7XR2P", client: "Arben Hoxha", agent: "NESTI TRAVEL", agentInitials: "NT", agentColor: "from-blue-500 to-indigo-500", from: "TIA", to: "FCO", route: "Tiranë → Romë", date: "18 Qer 2026", dow: "E enjte", pax: 3, inf: 1, bag: 2, total: 1840, paid: 1100, due: 740, comm: 420, status: "pending", source: "CP", pending: 0, today: false, createdDay: "19", createdMon: "Maj", createdYear: "2026", createdTime: "14:22", createdBadge: "Sot" },
  { id: 2, ref: "FLT048216", pnr: "WZ8K2L", client: "Marina Kola", agent: "—", agentInitials: "MK", agentColor: "from-slate-400 to-slate-500", from: "TIA", to: "MXP", route: "Tiranë → Milano", date: "21 Qer 2026", dow: "E diel", pax: 2, inf: 0, bag: 0, total: 620, paid: 620, due: 0, comm: 0, status: "ticketed", source: "", pending: 0, today: true, createdDay: "19", createdMon: "Maj", createdYear: "2026", createdTime: "11:08", createdBadge: "Sot" },
  { id: 3, ref: "FLT048215", pnr: null, client: "Edmond Lika", agent: "FLY TRAVEL", agentInitials: "FT", agentColor: "from-emerald-500 to-teal-500", from: "TIA", to: "IST", route: "Tiranë → Stamboll", date: "30 Qer 2026", dow: "E martë", pax: 4, inf: 0, bag: 4, total: 1280, paid: 0, due: 1280, comm: 280, status: "draft", source: "", pending: 2, today: true, createdDay: "18", createdMon: "Maj", createdYear: "2026", createdTime: "17:45", createdBadge: "Dje" },
  { id: 4, ref: "FLT048214", pnr: "RY9PQM", client: "Lorenc Hyseni", agent: "ALBA TOURS", agentInitials: "AT", agentColor: "from-rose-500 to-pink-500", from: "TIA", to: "BCN", route: "Tiranë → Barcelonë", date: "05 Kor 2026", dow: "E hënë", pax: 2, inf: 0, bag: 1, total: 740, paid: 740, due: 0, comm: 180, status: "confirmed", source: "CP", pending: 0, today: false, createdDay: "18", createdMon: "Maj", createdYear: "2026", createdTime: "09:12", createdBadge: "Dje" },
  { id: 5, ref: "FLT048213", pnr: "AB23X9", client: "Suela Bibaj", agent: "NESTI TRAVEL", agentInitials: "NT", agentColor: "from-blue-500 to-indigo-500", from: "TIA", to: "MUC", route: "Tiranë → Mynih", date: "12 Kor 2026", dow: "E hënë", pax: 1, inf: 0, bag: 0, total: 310, paid: 150, due: 160, comm: 60, status: "confirmed", source: "", pending: 0, today: false, createdDay: "16", createdMon: "Maj", createdYear: "2026", createdTime: "16:30", createdBadge: "" },
  { id: 6, ref: "FLT048212", pnr: "QQ5MNP", client: "Drilon Berisha", agent: "PEGASUS T.", agentInitials: "PT", agentColor: "from-amber-500 to-orange-500", from: "TIA", to: "SAW", route: "Tiranë → Stamboll SAW", date: "—", dow: "", pax: 6, inf: 1, bag: 5, total: 1980, paid: 0, due: 1980, comm: 540, status: "cancelled", source: "", pending: 0, today: false, createdDay: "14", createdMon: "Maj", createdYear: "2026", createdTime: "10:55", createdBadge: "" },
  { id: 7, ref: "FLT048211", pnr: "LX7K2D", client: "Eralda Çela", agent: "FLY TRAVEL", agentInitials: "FT", agentColor: "from-emerald-500 to-teal-500", from: "TIA", to: "ZRH", route: "Tiranë → Zyrih", date: "20 Kor 2026", dow: "E martë", pax: 3, inf: 0, bag: 3, total: 1110, paid: 1110, due: 0, comm: 240, status: "ticketed", source: "", pending: 0, today: false, createdDay: "12", createdMon: "Maj", createdYear: "2026", createdTime: "13:40", createdBadge: "" },
];

function fmt(n: number) { return n.toLocaleString("de-DE"); }

function StatCard({ label, value, delta, deltaDir, icon: Icon, accent }: { label: string; value: string; delta: string; deltaDir: "up" | "down" | "flat"; icon: any; accent: string }) {
  const deltaCls = deltaDir === "up" ? "text-emerald-600 bg-emerald-50" : deltaDir === "down" ? "text-rose-600 bg-rose-50" : "text-slate-500 bg-slate-100";
  const DeltaIcon = deltaDir === "up" ? ArrowUpRight : deltaDir === "down" ? ArrowDownRight : TrendingUp;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 hover:shadow-md hover:border-slate-300 transition-all group relative overflow-hidden">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${accent} opacity-[0.08] group-hover:opacity-[0.14] transition-opacity`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${deltaCls}`}>
          <DeltaIcon className="w-3 h-3" /> {delta}
        </span>
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

export default function PremiumBookingsList() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* Top bar */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-20">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-sm">
              <Plane className="w-4 h-4 text-white -rotate-45" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Kings Management</div>
              <div className="text-[11px] text-slate-500 leading-tight">Rezervimet</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <div className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-lg hover:bg-slate-100 cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-semibold flex items-center justify-center">AH</div>
              <div className="leading-tight">
                <div className="text-xs font-semibold">Arben H.</div>
                <div className="text-[10px] text-slate-500">Admin</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1400px] mx-auto">
        {/* Page header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Operacionet</span>
              <span className="text-slate-300">/</span>
              <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Rezervimet</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Rezervimet
              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-100">1,284</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Menaxho të gjitha rezervimet, pagesat dhe biletat e fluturimit.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5 transition-all shadow-sm">
              <Calendar className="w-4 h-4" /> Sot
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5 transition-all shadow-sm">
              <Sparkles className="w-4 h-4 text-violet-500" /> AI Asistent
            </button>
            <button className="h-9 px-3.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:from-blue-500 hover:to-indigo-500 flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20">
              <Plus className="w-4 h-4" /> Rezervim i Ri
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Rezervime sot"    value="24"      delta="+12%" deltaDir="up"   icon={Users}            accent="bg-gradient-to-br from-blue-500 to-indigo-600" />
          <StatCard label="Shitje sot"       value="€8,420"  delta="+4%"  deltaDir="up"   icon={CreditCard}       accent="bg-gradient-to-br from-emerald-500 to-teal-600" />
          <StatCard label="Profit"           value="€2,180"  delta="+8%"  deltaDir="up"   icon={TrendingUp}       accent="bg-gradient-to-br from-violet-500 to-purple-600" />
          <StatCard label="Pa paguar"        value="€4,160"  delta="-3%"  deltaDir="down" icon={AlertCircle}      accent="bg-gradient-to-br from-rose-500 to-pink-600" />
        </div>

        {/* Filters bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 mb-4 flex items-center gap-2 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Kërko klient, REF, PNR, agjenci..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200/60 text-sm placeholder:text-slate-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <button className="h-9 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Statusi
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button className="h-9 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors">
            <Calendar className="w-3.5 h-3.5" /> Data
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button className="h-9 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors">
            Agjencia
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button className="h-9 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors">
            <Filter className="w-3.5 h-3.5" /> Më shumë
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">7 nga 1,284 rezervime</span>
          </div>
        </div>

        {/* Active filter chips */}
        <div className="flex items-center gap-1.5 mb-4 px-1">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Filtra:</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100">
            Statusi: Konfirmuar
            <button className="text-blue-400 hover:text-blue-600">×</button>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-md border border-violet-100">
            18 Qer — 31 Kor
            <button className="text-violet-400 hover:text-violet-600">×</button>
          </span>
        </div>

        {/* Premium table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Data Rez.</th>
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">REF / PNR</th>
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Klienti</th>
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Agjencia</th>
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Fluturimi</th>
                <th className="text-center px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">PAX</th>
                <th className="text-right px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Financa</th>
                <th className="text-left px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-slate-500">Statusi</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const s = STATUS_STYLES[r.status];
                const paidPct = r.total > 0 ? Math.min(100, (r.paid / r.total) * 100) : 0;
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 group transition-colors">
                    {/* Data Rez. */}
                    <td className="px-4 py-1.5">
                      <div className="flex flex-col leading-tight">
                        <span className="text-[13px] font-semibold text-slate-900">{r.createdDay} {r.createdMon} {r.createdYear}</span>
                        {r.createdBadge && (
                          <span className={`text-[10px] font-semibold ${r.createdBadge === "Sot" ? "text-emerald-600" : "text-slate-400"}`}>• {r.createdBadge}</span>
                        )}
                      </div>
                    </td>
                    {/* REF / PNR */}
                    <td className="px-4 py-1.5">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <button className="font-mono text-[13px] font-bold text-blue-700 hover:underline tracking-tight">{r.ref}</button>
                            {r.source === "CP" && (
                              <span className="inline-flex items-center justify-center w-4 h-4 bg-sky-500 rounded text-white" title="CitizenPlane">
                                <Globe className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {r.pending > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1 h-4 bg-orange-500 text-white text-[10px] font-bold rounded animate-pulse">
                                <MessageSquare className="w-2.5 h-2.5" /> {r.pending}
                              </span>
                            )}
                          </div>
                          {r.pnr ? (
                            <span className="font-mono text-[10px] text-slate-500 tracking-wider">{r.pnr}</span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-600">NOT ISSUED</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Client */}
                    <td className="px-4 py-1.5">
                      <div className="font-medium text-slate-900">{r.client}</div>
                    </td>
                    {/* Agency */}
                    <td className="px-4 py-1.5">
                      {r.agent === "—" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${r.agentColor} text-white text-[10px] font-bold flex items-center justify-center shadow-sm`}>
                            {r.agentInitials}
                          </div>
                          <span className="text-sm font-medium text-slate-700">{r.agent}</span>
                        </div>
                      )}
                    </td>
                    {/* Flight */}
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 text-[13px]">{r.from}</span>
                          <div className="relative w-8 h-px bg-slate-300">
                            <Plane className="w-3 h-3 text-slate-400 absolute -top-1.5 left-1/2 -translate-x-1/2 -rotate-45" />
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-[13px]">{r.to}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        {r.date}
                        {r.dow && <span className="text-slate-300">•</span>}
                        {r.dow && <span>{r.dow}</span>}
                      </div>
                    </td>
                    {/* PAX */}
                    <td className="px-4 py-1.5 text-center">
                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg">
                        <Users className="w-3 h-3 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">{r.pax}</span>
                        {r.inf > 0 && <span className="text-[10px] font-bold text-fuchsia-600 ml-0.5">+{r.inf} INF</span>}
                        {r.bag > 0 && <span className="text-[10px] font-bold text-amber-600 ml-0.5">+{r.bag} BAG</span>}
                      </div>
                    </td>
                    {/* Money — kompakte në 2 rreshta të hollë */}
                    <td className="px-4 py-1.5">
                      <div className="flex flex-col items-end gap-0 tabular-nums leading-tight">
                        {/* Rreshti 1: Total i madh + Kom badge */}
                        <div className="flex items-center gap-1.5">
                          {r.comm > 0 && (
                            <span className="text-[10px] font-bold text-violet-600" title="Komision">−€{fmt(r.comm)}</span>
                          )}
                          <span className="font-bold text-slate-900 text-[14px]">€{fmt(r.total)}</span>
                        </div>
                        {/* Rreshti 2: neto · paguar / detyrim */}
                        <div className="text-[10px] flex items-center gap-1">
                          <span className="text-slate-500">neto <span className="font-semibold text-slate-700">€{fmt(r.total - r.comm)}</span></span>
                          <span className="text-slate-300">·</span>
                          <span className="text-emerald-600 font-semibold">€{fmt(r.paid)}</span>
                          {r.due > 0 ? (
                            <>
                              <span className="text-slate-300">/</span>
                              <span className="text-rose-600 font-bold">€{fmt(r.due)}</span>
                            </>
                          ) : (
                            <span className="text-emerald-600 font-bold">✓</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </td>
                    {/* Action */}
                    <td className="px-2 py-1.5">
                      <button className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer / pagination */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50/40 border-t border-slate-200/80">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Faqe <span className="font-semibold text-slate-700">1</span> nga <span className="font-semibold text-slate-700">26</span></span>
              <span className="text-slate-300">•</span>
              <span><span className="font-semibold text-slate-700">50</span> rezervime për faqe</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="h-8 px-3 rounded-lg text-xs font-medium text-slate-500 hover:bg-white border border-transparent hover:border-slate-200">← Më parë</button>
              {[1,2,3,4,5].map((n) => (
                <button key={n} className={`h-8 w-8 rounded-lg text-xs font-semibold ${n === 1 ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"}`}>{n}</button>
              ))}
              <span className="text-slate-400 px-1">…</span>
              <button className="h-8 w-8 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200">26</button>
              <button className="h-8 px-3 rounded-lg text-xs font-medium text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 flex items-center gap-1">Më pas →</button>
            </div>
          </div>
        </div>

        {/* Money summary footer card */}
        <div className="mt-4 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-4 flex items-center justify-between text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-blue-500/20 to-transparent" />
          <div className="flex items-center gap-6 relative">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-blue-200 font-semibold">Total i Faqes</div>
              <div className="text-2xl font-bold tabular-nums tracking-tight">€{fmt(ROWS.reduce((s,r)=>s+r.total,0))}</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-200 font-semibold">Paguar</div>
              <div className="text-2xl font-bold tabular-nums tracking-tight">€{fmt(ROWS.reduce((s,r)=>s+r.paid,0))}</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-rose-200 font-semibold">Detyrim</div>
              <div className="text-2xl font-bold tabular-nums tracking-tight">€{fmt(ROWS.reduce((s,r)=>s+r.due,0))}</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-violet-200 font-semibold">Komisioni</div>
              <div className="text-2xl font-bold tabular-nums tracking-tight">€{fmt(ROWS.reduce((s,r)=>s+r.comm,0))}</div>
            </div>
          </div>
          <button className="h-9 px-4 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-blue-50 transition-colors shadow-md relative">
            Eksporto Raportin →
          </button>
        </div>
      </main>
    </div>
  );
}
