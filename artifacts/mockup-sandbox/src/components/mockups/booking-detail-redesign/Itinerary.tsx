import './_group.css';
import { mockBooking as booking, fmtM } from "./_mockData";
import { 
  Plane, 
  Clock, 
  Calendar, 
  User, 
  CreditCard, 
  Edit2, 
  CheckCircle2, 
  AlertCircle, 
  Phone,
  Mail,
  Building,
  Plus,
  Shield,
  Luggage,
  Ticket,
  History,
  Users,
  XCircle,
  PlaneTakeoff,
  PlaneLanding
} from 'lucide-react';

export function Itinerary() {
  return (
    <div className="booking-detail-scope min-h-screen bg-[#F8F9FA] text-slate-800 font-sans">
      {/* Hero Section */}
      <div className="relative w-full overflow-hidden bg-[#112444]">
        
        {/* Top Nav/Actions */}
        <div className="relative p-6 flex flex-wrap gap-4 justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white font-medium tracking-wide text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              {booking.status}
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white/90 text-sm font-mono">
              PNR: {booking.pnr || "—"}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-white/10">
              <History className="w-4 h-4" /> Historiku
            </button>
            <button className="bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-white/10">
              <Users className="w-4 h-4" /> Cakto Grupin
            </button>
            <button className="bg-rose-500/80 hover:bg-rose-500 transition-colors backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-rose-500/50">
              <XCircle className="w-4 h-4" /> Anulo
            </button>
            <button className="bg-emerald-500/80 hover:bg-emerald-500 transition-colors backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-emerald-500/50">
              <CheckCircle2 className="w-4 h-4" /> Konfirmo
            </button>
            <button className="bg-white hover:bg-slate-100 transition-colors text-slate-900 px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg shadow-black/20">
              <Ticket className="w-4 h-4" /> Lësho Biletat
            </button>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative px-8 pt-2 pb-6 z-10 flex flex-wrap gap-5 justify-between items-end">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 tracking-tight" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
              {booking.ref}
            </h1>
            <div className="flex items-center gap-4 text-slate-300 text-sm">
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Krijoi: {booking.created_at}</span>
              <span className="flex items-center gap-1.5"><Building className="w-4 h-4" /> {booking.agent}</span>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 flex flex-col gap-2 min-w-[300px]">
            <div className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">Klienti Kryesor</div>
            <div className="flex items-center gap-3">
              <img src="/__mockup/images/bd-avatar-arben.png" alt="Client" className="w-10 h-10 rounded-full border border-white/30 object-cover" />
              <div>
                <div className="text-white font-medium text-lg leading-tight">{booking.client.name}</div>
                <div className="text-white/70 text-sm flex gap-3">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {booking.client.phone}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {booking.client.email}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Journey lives in the theme-colored header, not a second body card. */}
        <div className="relative z-10 mx-8 mb-7 rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-5 text-white">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <Plane className="h-4 w-4 text-[#e7c67c]" />
              {booking.flight.airline} · {booking.flight.flight_no}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Calendar className="h-3.5 w-3.5" /> {booking.flight.date}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-300"><PlaneTakeoff className="h-3.5 w-3.5" /> Nisja</div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-4xl font-bold tracking-tight">{booking.flight.fromAirport}</span>
                <span className="text-2xl font-semibold tabular-nums">{booking.flight.time}</span>
              </div>
              <div className="mt-1 text-sm text-slate-300">{booking.flight.fromCity}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-3 text-xs text-slate-300">Koha e fluturimit</div>
              <div className="relative flex w-full items-center justify-center">
                <div className="absolute inset-x-0 border-t border-dashed border-white/25" />
                <span className="relative rounded-full border border-[#e7c67c]/30 bg-[#182f50] px-4 py-1.5 text-sm font-semibold text-[#f0d79e]">{booking.flight.duration}</span>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-300">Direkt</div>
            </div>
            <div className="text-right">
              <div className="mb-1 flex items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-300">Mbërritja <PlaneLanding className="h-3.5 w-3.5" /></div>
              <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums">{booking.flight.arrivalTime}</span>
                <span className="text-4xl font-bold tracking-tight">{booking.flight.toAirport}</span>
              </div>
              <div className="mt-1 text-sm text-slate-300">{booking.flight.toCity}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto p-4 md:p-8 flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Journey & Passengers */}
        <div className="min-w-0 flex-1 flex flex-col gap-6">
          {/* ItineraryExcelPanel was not included in the Replit export */}
          
          {/* Passengers */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
                Pasagjerët ({booking.passengers.length})
              </h2>
              <button className="text-indigo-600 hover:text-indigo-700 font-medium text-sm flex items-center gap-1">
                <Plus className="w-4 h-4" /> Shto Pasagjer
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {booking.passengers.map((pax: any, idx: number) => (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm flex items-center gap-4 hover:border-indigo-200 transition-colors group">
                  <div className="relative">
                    {pax.name.includes("Arben") ? (
                      <img src="/__mockup/images/bd-avatar-arben.png" alt="Arben" className="w-12 h-12 rounded-full object-cover shadow-sm border border-slate-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-lg font-medium border border-slate-200">
                        {pax.name.charAt(0)}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-slate-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border-2 border-white">
                      {pax.type.substring(0,3)}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-lg">{pax.name}</h3>
                      <div className="text-slate-400 font-mono text-sm">{pax.passport}</div>
                      <div className="text-slate-400 text-sm ml-2 flex items-center gap-1"><Calendar className="h-3 w-3" /> {pax.dob}</div>
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                      {pax.extras.map((ex: any, i: number) => {
                        let Icon = Luggage;
                        let colorClass = "bg-orange-50 text-orange-700 border-orange-100";
                        if (ex.includes("Ulëse")) { Icon = User; colorClass = "bg-blue-50 text-blue-700 border-blue-100"; }
                        if (ex.includes("Prioritet")) { Icon = Clock; colorClass = "bg-purple-50 text-purple-700 border-purple-100"; }
                        if (ex.includes("Sigurim")) { Icon = Shield; colorClass = "bg-emerald-50 text-emerald-700 border-emerald-100"; }
                        
                        return (
                          <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${colorClass}`}>
                            <Icon className="w-3 h-3" />
                            {ex}
                          </div>
                        )
                      })}
                      <button className="flex items-center justify-center w-7 h-7 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 border-l border-slate-100 pl-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 font-medium">Cmimi:</span>
                      <div className="bg-slate-50 px-2 py-1 rounded border border-slate-200 font-mono font-medium text-slate-900 w-24 text-right hover:bg-white hover:border-indigo-300 cursor-text transition-colors">
                        {fmtM(pax.price)}
                      </div>
                    </div>
                    {pax.seat && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 font-medium">Ulësja:</span>
                        <div className="bg-indigo-50 text-indigo-700 font-bold px-2 py-1 rounded w-12 text-center text-sm border border-indigo-100">
                          {pax.seat}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shtojca & Extras section */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm mt-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Shtojca të Përgjithshme</h3>
              <div className="font-mono font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">Total: €110.00</div>
            </div>
            
            <div className="grid grid-cols-4 gap-3 mb-6">
              <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-colors gap-2 text-slate-600 hover:text-indigo-700">
                <Luggage className="w-6 h-6" />
                <span className="text-sm font-medium">Bagazh</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-colors gap-2 text-slate-600 hover:text-indigo-700">
                <User className="w-6 h-6" />
                <span className="text-sm font-medium">Ulëse</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-colors gap-2 text-slate-600 hover:text-indigo-700">
                <Clock className="w-6 h-6" />
                <span className="text-sm font-medium">Prioritet</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-colors gap-2 text-slate-600 hover:text-indigo-700">
                <Shield className="w-6 h-6" />
                <span className="text-sm font-medium">Sigurim</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Luggage className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Bagazh 20kg</div>
                    <div className="text-slate-500 text-xs">Për Arben Hoxha</div>
                  </div>
                </div>
                <div className="font-mono font-medium">€35.00</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                    <Luggage className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Bagazh 20kg</div>
                    <div className="text-slate-500 text-xs">Për Teuta Hoxha</div>
                  </div>
                </div>
                <div className="font-mono font-medium">€35.00</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Ulëse 4A, 4B</div>
                    <div className="text-slate-500 text-xs">Për Arben & Teuta</div>
                  </div>
                </div>
                <div className="font-mono font-medium">€22.00</div>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Sigurim Bazë</div>
                    <div className="text-slate-500 text-xs">Për 4 persona</div>
                  </div>
                </div>
                <div className="font-mono font-medium">€18.00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Financials (Sticky) */}
        <div className="w-full lg:w-[340px] shrink-0">
          <div className="sticky top-8 flex flex-col gap-6">
            
            {/* Financial Summary */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
              <h3 className="font-bold text-slate-900 text-lg mb-6 flex items-center gap-2" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
                <CreditCard className="w-5 h-5 text-slate-400" /> Financat
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <div className="text-sm font-medium text-slate-500 mb-1">Çmimi i Shitjes</div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                    <input 
                      type="text" 
                      defaultValue="1840.00" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-4 font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
                
                <div>
                  <div className="text-sm font-medium text-slate-500 mb-1">Çmimi Neto</div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                    <input 
                      type="text" 
                      defaultValue="1420.00" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-4 font-mono text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-slate-500">Komisioni</span>
                  <span className="font-mono font-bold text-emerald-600">€420.00</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Marzhi</span>
                  <span className="text-slate-500 font-medium">22.8%</span>
                </div>
              </div>

            </div>

            {/* Payment Status Tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm col-span-2">
                <div className="text-slate-500 text-sm font-medium mb-1">Shuma Totale</div>
                <div className="text-2xl font-bold font-mono text-slate-900">€1840.00</div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 shadow-sm">
                <div className="text-emerald-700 text-sm font-medium mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Paguar
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700">€1100.00</div>
              </div>
              <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100 shadow-sm">
                <div className="text-rose-700 text-sm font-medium mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Mbetet
                </div>
                <div className="text-xl font-bold font-mono text-rose-700">€740.00</div>
              </div>
            </div>

            {/* Payment History */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-slate-900 text-sm">Historia e Pagesave</h4>
                <button className="text-indigo-600 hover:text-indigo-700 text-xs font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Shto
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <div>
                    <div className="font-medium text-slate-900">Transfertë Bankare</div>
                    <div className="text-slate-500 text-xs">10 Qer 2026</div>
                  </div>
                  <div className="font-mono font-medium text-emerald-600">+€800.00</div>
                </div>
                <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-100">
                  <div>
                    <div className="font-medium text-slate-900">Cash (Zyra Tiranë)</div>
                    <div className="text-slate-500 text-xs">12 Qer 2026</div>
                  </div>
                  <div className="font-mono font-medium text-emerald-600">+€300.00</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
