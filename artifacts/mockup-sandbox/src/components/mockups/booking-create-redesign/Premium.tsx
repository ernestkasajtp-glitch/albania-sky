import { Plane, Search, Calendar, ArrowRight, Users, User, Baby, Plus, Trash2, Briefcase, ShieldCheck, Armchair, Zap, ChevronDown, Building2, FileText, Sparkles, Check, Globe, ChevronRight, BadgePercent, Receipt } from "lucide-react";

const FLIGHT_RESULTS = [
  { id: 1, airline: "Wizz Air", code: "W6", flightNum: "W6 1453", from: "TIA", fromCity: "Tiranë", to: "FCO", toCity: "Romë Fiumicino", dep: "06:45", arr: "08:25", dur: "1h 40m", date: "18 Qer 2026", price: 89, available: 23, selected: true, color: "from-fuchsia-500 to-pink-500" },
  { id: 2, airline: "ITA Airways", code: "AZ", flightNum: "AZ 583", from: "TIA", fromCity: "Tiranë", to: "FCO", toCity: "Romë Fiumicino", dep: "11:20", arr: "13:05", dur: "1h 45m", date: "18 Qer 2026", price: 145, available: 8, selected: false, color: "from-sky-500 to-blue-500" },
  { id: 3, airline: "Ryanair", code: "FR", flightNum: "FR 8821", from: "TIA", fromCity: "Tiranë", to: "CIA", toCity: "Romë Ciampino", dep: "19:30", arr: "21:10", dur: "1h 40m", date: "18 Qer 2026", price: 72, available: 41, selected: false, color: "from-blue-700 to-indigo-700" },
];

const PAX = [
  { id: 1, type: "adult", first: "Arben", last: "Hoxha", dob: "12.03.1985", nat: "AL", passport: "BA1234567", baggage: "23kg", seat: true, priority: true, insurance: false, expanded: true, origPrice: 134, finalPrice: 145 },
  { id: 2, type: "adult", first: "Eleona", last: "Hoxha", dob: "07.09.1988", nat: "AL", passport: "BA8765432", baggage: "23kg", seat: true, priority: false, insurance: true, expanded: false, origPrice: 137, finalPrice: 145 },
  { id: 3, type: "infant", first: "Ari", last: "Hoxha", dob: "21.11.2024", nat: "AL", passport: "BA1122334", baggage: "Pa bag.", seat: false, priority: false, insurance: false, expanded: false, origPrice: 18, finalPrice: 18 },
];

function StepBubble({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200" : active ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-100" : "bg-white text-slate-400 border border-slate-200"}`}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`text-[10px] uppercase font-bold tracking-wider ${active ? "text-blue-700" : done ? "text-emerald-700" : "text-slate-400"}`}>Hapi {n}</span>
        <span className={`text-sm font-semibold ${active || done ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
      </div>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <div className={`flex-1 h-px ${done ? "bg-emerald-400" : "bg-slate-200"}`} />;
}

function FieldLabel({ children }: { children: any }) {
  return <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 block">{children}</label>;
}

function Input({ value, placeholder, icon: Icon }: { value?: string; placeholder?: string; icon?: any }) {
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />}
      <div className={`h-10 ${Icon ? "pl-10" : "pl-3"} pr-3 rounded-lg border border-slate-200 bg-white text-sm flex items-center hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all`}>
        {value ? <span className="text-slate-900 font-medium">{value}</span> : <span className="text-slate-400">{placeholder}</span>}
      </div>
    </div>
  );
}

function Toggle({ on, icon: Icon, label, price }: { on: boolean; icon: any; label: string; price?: string }) {
  return (
    <button className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border-2 transition-all ${on ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className={`text-[12px] font-semibold ${on ? "text-emerald-900" : "text-slate-700"}`}>{label}</span>
          {price && <span className="text-[10px] text-slate-500">{price}</span>}
        </div>
      </div>
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${on ? "bg-emerald-500" : "border border-slate-300"}`}>
        {on && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
    </button>
  );
}

export default function Premium() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-200">
              <Plane className="w-4 h-4 text-white -rotate-45" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Kings Management</span>
              <span className="text-sm font-bold text-slate-900">Rezervim i Ri</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Operacionet</span>
            <ChevronRight className="w-3 h-3" />
            <span>Rezervimet</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-semibold text-slate-900">I Ri</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Anulo</button>
            <button className="h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Ruaj Draft
            </button>
          </div>
        </div>
        {/* Stepper */}
        <div className="px-8 py-3 border-t border-slate-100 bg-gradient-to-r from-slate-50/50 via-white to-slate-50/50">
          <div className="flex items-center gap-3 max-w-5xl mx-auto">
            <StepBubble n={1} label="Fluturimi" done={true} active={false} />
            <StepLine done={true} />
            <StepBubble n={2} label="Pasagjerët" done={false} active={true} />
            <StepLine done={false} />
            <StepBubble n={3} label="Çmimi & Konfirmim" done={false} active={false} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6 grid grid-cols-12 gap-6">
        {/* Main column */}
        <div className="col-span-8 flex flex-col gap-5">
          {/* Section: Flight selected */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check className="w-4 h-4" /></div>
                <h3 className="text-sm font-bold text-slate-900">Fluturimi i Zgjedhur</h3>
              </div>
              <button className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1">Ndrysho fluturimin <ChevronDown className="w-3 h-3" /></button>
            </header>

            {/* Search bar (collapsed look) */}
            <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 grid grid-cols-12 gap-2">
              <div className="col-span-3"><Input icon={Plane} value="TIA — Tiranë" /></div>
              <div className="col-span-3"><Input icon={Plane} value="FCO — Romë Fiumicino" /></div>
              <div className="col-span-3"><Input icon={Calendar} value="18 Qer 2026" /></div>
              <div className="col-span-2"><Input icon={Users} value="2 të rritur, 1 fëmijë" /></div>
              <button className="col-span-1 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center hover:shadow-md hover:shadow-blue-200 transition-all">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* Flight results */}
            <div className="p-4 flex flex-col gap-2">
              {FLIGHT_RESULTS.map(f => (
                <div key={f.id} className={`relative rounded-xl border-2 transition-all cursor-pointer ${f.selected ? "border-blue-500 bg-gradient-to-r from-blue-50/60 to-indigo-50/30 shadow-sm shadow-blue-100" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                  {f.selected && (
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-300">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className="px-4 py-3 flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center shadow-sm`}>
                      <span className="text-white font-bold text-sm">{f.code}</span>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="text-sm font-bold text-slate-900">{f.airline}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{f.flightNum}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-1 justify-center">
                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-900 leading-tight">{f.dep}</div>
                        <div className="text-[11px] text-slate-500">{f.from}</div>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 px-2">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">{f.dur}</div>
                        <div className="relative w-24 h-px bg-gradient-to-r from-slate-200 via-slate-400 to-slate-200">
                          <Plane className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 text-blue-500 rotate-90" />
                        </div>
                        <div className="text-[10px] text-slate-400">Direkt</div>
                      </div>
                      <div className="text-left">
                        <div className="text-lg font-bold text-slate-900 leading-tight">{f.arr}</div>
                        <div className="text-[11px] text-slate-500">{f.to}</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-baseline gap-1 tabular-nums">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">€</span>
                        <span className="text-xl font-bold text-slate-900">{f.price}</span>
                      </div>
                      <span className={`text-[10px] font-semibold ${f.available < 10 ? "text-amber-600" : "text-emerald-600"}`}>{f.available} vende</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section: Customer */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <header className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><Building2 className="w-4 h-4" /></div>
              <h3 className="text-sm font-bold text-slate-900">Klienti & Agjencia</h3>
            </header>
            <div className="p-5 grid grid-cols-12 gap-4">
              <div className="col-span-5">
                <FieldLabel>Emri i klientit *</FieldLabel>
                <Input value="Arben Hoxha" icon={User} />
              </div>
              <div className="col-span-4">
                <FieldLabel>Email</FieldLabel>
                <Input value="arben.hoxha@email.com" />
              </div>
              <div className="col-span-3">
                <FieldLabel>Telefon</FieldLabel>
                <Input value="+355 68 234 5678" />
              </div>
              <div className="col-span-6">
                <FieldLabel>Agjencia (opsionale)</FieldLabel>
                <div className="h-10 px-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between hover:border-slate-300">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">NT</div>
                    <span className="text-sm font-medium text-slate-900">NESTI TRAVEL</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-semibold">Komision 12%</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
              </div>
              <div className="col-span-6">
                <FieldLabel>Shënime të brendshme</FieldLabel>
                <Input placeholder="Kërkesa speciale, alergji, etj..." />
              </div>
            </div>
          </section>

          {/* Section: Passengers */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><Users className="w-4 h-4" /></div>
                <h3 className="text-sm font-bold text-slate-900">Pasagjerët</h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">3</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="h-8 px-2.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> I rritur
                </button>
                <button className="h-8 px-2.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Fëmijë
                </button>
                <button className="h-8 px-2.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Foshnje
                </button>
              </div>
            </header>
            <div className="p-4 flex flex-col gap-3">
              {PAX.map((p, idx) => (
                <div key={p.id} className={`rounded-xl border ${p.expanded ? "border-blue-300 bg-blue-50/30 shadow-sm" : "border-slate-200 bg-white"} overflow-hidden`}>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${p.type === "infant" ? "bg-pink-100 text-pink-700" : p.type === "child" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                        {p.type === "infant" ? <Baby className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col leading-tight">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{p.first} {p.last}</span>
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${p.type === "infant" ? "bg-pink-100 text-pink-700" : p.type === "child" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>{p.type === "adult" ? "I rritur" : p.type === "child" ? "Fëmijë" : "Foshnje"}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">Datëlindja: <span className="font-mono">{p.dob}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {p.seat && <span title="Ulëse" className="w-6 h-6 rounded bg-blue-50 text-blue-700 flex items-center justify-center"><Armchair className="w-3 h-3" /></span>}
                        {p.priority && <span title="Priority" className="w-6 h-6 rounded bg-amber-50 text-amber-700 flex items-center justify-center"><Zap className="w-3 h-3" /></span>}
                        {p.insurance && <span title="Sigurim" className="w-6 h-6 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center"><ShieldCheck className="w-3 h-3" /></span>}
                        <span title="Bagazh" className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center"><Briefcase className="w-3 h-3" /></span>
                      </div>
                      {/* Per-passenger price edit */}
                      <div className="flex items-center gap-2 pl-3 ml-1 border-l border-slate-200">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Origjinal</span>
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums line-through decoration-slate-300">€{p.origPrice}.00</span>
                        </div>
                        <ArrowRight className="w-3 h-3 text-slate-300" />
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-600">Final €</span>
                          <input
                            type="text"
                            defaultValue={`${p.finalPrice}.00`}
                            className={`w-20 h-7 px-2 text-right rounded-md border-2 ${p.finalPrice !== p.origPrice ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"} text-sm font-bold text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500`}
                          />
                        </div>
                      </div>
                      <button className="text-slate-400 hover:text-rose-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      <button className={`text-slate-400 hover:text-slate-700 transition-transform ${p.expanded ? "rotate-180" : ""}`}><ChevronDown className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {p.expanded && (
                    <div className="px-4 pb-4 border-t border-blue-200/50 pt-3 grid grid-cols-12 gap-3 bg-white">
                      <div className="col-span-4">
                        <FieldLabel>Emri *</FieldLabel>
                        <Input value={p.first} />
                      </div>
                      <div className="col-span-4">
                        <FieldLabel>Mbiemri *</FieldLabel>
                        <Input value={p.last} />
                      </div>
                      <div className="col-span-4">
                        <FieldLabel>Datëlindja</FieldLabel>
                        <Input value={p.dob} icon={Calendar} />
                      </div>
                      <div className="col-span-12 mt-1">
                        <FieldLabel>Ekstra</FieldLabel>
                        <div className="grid grid-cols-4 gap-2">
                          <Toggle on={true} icon={Briefcase} label="Bagazh 23kg" price="+€25" />
                          <Toggle on={p.seat} icon={Armchair} label="Ulëse" price="+€8" />
                          <Toggle on={p.priority} icon={Zap} label="Priority" price="+€12" />
                          <Toggle on={p.insurance} icon={ShieldCheck} label="Sigurim" price="+€15" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Sidebar summary */}
        <div className="col-span-4">
          <div className="sticky top-32 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <header className="px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    <h3 className="text-sm font-bold">Përmbledhje Rezervimi</h3>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-slate-900">Draft</span>
                </div>
              </header>
              <div className="p-5">
                {/* Flight summary */}
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/30 border border-blue-100 p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Fluturimi</span>
                    <span className="text-[10px] font-semibold text-slate-500">18 Qer 2026</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-900 leading-none">TIA</div>
                      <div className="text-[10px] text-slate-500">06:45</div>
                    </div>
                    <div className="flex-1 px-2 flex flex-col items-center">
                      <Plane className="w-3 h-3 text-blue-500 rotate-90" />
                      <div className="w-full h-px bg-slate-300 my-0.5" />
                      <span className="text-[10px] text-slate-400">1h 40m</span>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-900 leading-none">FCO</div>
                      <div className="text-[10px] text-slate-500">08:25</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700">Wizz Air W6 1453</span>
                    <span className="font-mono text-slate-500">€89 × 3</span>
                  </div>
                </div>

                {/* Per-passenger breakdown */}
                <div className="space-y-1 text-sm tabular-nums">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Çmimi për pasagjer</div>
                  {PAX.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${p.type === "infant" ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-700"}`}>
                          {p.type === "infant" ? <Baby className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="text-[12px] font-semibold text-slate-800">{p.first} {p.last}</span>
                          {p.finalPrice !== p.origPrice && (
                            <span className="text-[10px] text-slate-400 line-through decoration-slate-300">€{p.origPrice}.00</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[14px] font-bold tabular-nums ${p.finalPrice !== p.origPrice ? "text-emerald-700" : "text-slate-700"}`}>€{p.finalPrice}.00</span>
                    </div>
                  ))}
                </div>

                {/* Diff badge */}
                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-[11px]">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-900">Fitim shtesë</span>
                  <span className="ml-auto font-bold text-emerald-700">+€19.00</span>
                </div>

                {/* Total */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Total Klienti</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-400 font-semibold">€</span>
                      <span className="text-3xl font-bold text-slate-900 tabular-nums">308</span>
                      <span className="text-sm text-slate-500 font-semibold">.00</span>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Pagesa menaxhohet pas konfirmimit
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-200 flex flex-col gap-2">
                <button className="h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all flex items-center justify-center gap-2">
                  Konfirmo Rezervimin <ArrowRight className="w-4 h-4" />
                </button>
                <button className="h-9 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Ruaj si Draft</button>
              </div>
            </div>

            {/* Tip card */}
            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200/60 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-violet-900 mb-0.5">Sugjerim AI</div>
                  <div className="text-[11px] text-violet-700 leading-relaxed">Klienti ka 4 rezervime të tjera me Wizz Air këtë vit. Ofroni 5% zbritje për besnikëri?</div>
                  <button className="mt-2 text-[11px] font-bold text-violet-700 hover:text-violet-900 flex items-center gap-1">Apliko zbritjen <ArrowRight className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
