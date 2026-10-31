import React, { useState } from 'react';
import { mockBooking as booking } from "./_mockData";
import { 
  CheckCircle2, 
  Circle,
  Copy,
  PlaneTakeoff,
  Clock,
  User,
  Phone,
  Mail,
  Building,
  CreditCard,
  Edit2,
  Plus,
  AlertTriangle,
  History,
  Users,
  XCircle,
  Ticket,
  ArrowRight
} from 'lucide-react';
import './_group.css';

export function Console() {
  const [activeTab, setActiveTab] = useState('pax');

  const steps = [
    { label: 'Draft', status: 'done' },
    { label: 'Pending', status: 'done' },
    { label: 'Confirmed', status: 'current' },
    { label: 'Ticketed', status: 'upcoming' },
  ];

  return (
    <div className="booking-detail-scope min-h-screen bg-white text-slate-700 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col">
      {/* Top Status Rail */}
      <header className="h-14 border-b border-slate-200 bg-[#eef3fa] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-500 text-sm">REF</span>
            <span className="font-mono text-slate-900 text-lg tracking-tight font-medium">{booking.reference || 'FLT048217'}</span>
          </div>
          <div className="h-4 w-px bg-slate-300" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-500 text-sm">PNR</span>
            <span className="font-mono text-amber-700 text-lg tracking-tight font-medium bg-amber-100 px-2 rounded">{booking.pnr || 'K7XR2P'}</span>
          </div>
          <div className="h-4 w-px bg-slate-300" />
          <div className="flex items-center">
            {steps.map((step, idx) => (
              <React.Fragment key={step.label}>
                <div className={`flex items-center gap-1.5 ${step.status === 'current' ? 'text-blue-700' : step.status === 'done' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {step.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : step.status === 'current' ? <Circle className="w-4 h-4 fill-current opacity-30" /> : <Circle className="w-4 h-4" />}
                  <span className="text-xs uppercase tracking-wider font-medium">{step.label}</span>
                </div>
                {idx < steps.length - 1 && <div className="w-8 h-px bg-slate-300 mx-2" />}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button className="h-8 px-3 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <History className="w-4 h-4" />
              <span>Historiku</span>
            </button>
            <button className="h-8 px-3 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <Users className="w-4 h-4" />
              <span>Cakto Grupin</span>
            </button>
            <button className="h-8 px-3 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-medium flex items-center gap-2 transition-colors">
              <XCircle className="w-4 h-4" />
              <span>Anulo</span>
            </button>
            <button className="h-8 px-4 rounded bg-[#2563eb] hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Konfirmo</span>
            </button>
            <button className="h-8 px-4 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
              <Ticket className="w-4 h-4" />
              <span>Lësho Biletat</span>
              <kbd className="ml-1 font-mono text-[10px] bg-emerald-600/40 px-1 rounded text-white">⌘E</kbd>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Column 1: Metadata */}
        <div className="w-80 border-r border-slate-200 bg-[#f8fafc] p-4 overflow-y-auto flex flex-col gap-6">
          
          <section>
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3 flex items-center justify-between">
              Klienti
              <button className="text-slate-400 hover:text-blue-700"><Edit2 className="w-3 h-3" /></button>
            </h3>
            <div className="bg-white border border-slate-200 rounded p-3 text-sm space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-slate-900">
                <User className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{booking.customer?.name || 'Arben Hoxha'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Building className="w-4 h-4 text-slate-400" />
                <span>{booking.agent?.name || 'NESTI TRAVEL TIRANË'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="font-mono">{booking.customer?.phone || '+355 69 123 4567'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{booking.customer?.email || 'arben@nestitravel.al'}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Fluturimi</h3>
            <div className="bg-white border border-slate-200 rounded p-3 text-sm shadow-sm">
              <div className="flex items-center gap-2 text-slate-900 mb-2">
                <PlaneTakeoff className="w-4 h-4 text-[#2563eb]" />
                <span className="font-medium">Wizz Air W6 4023</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <span>TIA</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span>FCO</span>
              </div>
              <div className="text-slate-500 mt-1">Tiranë → Romë Fiumicino</div>
              <div className="flex items-center gap-3 mt-3 text-slate-600 font-mono text-xs bg-[#eef3fa] p-2 rounded">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 18 Qer 2026</span>
                <span>·</span>
                <span>14:25</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Financat</h3>
            <div className="bg-white border border-slate-200 rounded text-sm divide-y divide-slate-100 shadow-sm">
              <div className="p-3 flex justify-between items-center group">
                <span className="text-slate-500">Çmimi i Shitjes</span>
                <span className="font-mono text-slate-900 font-medium group-hover:bg-slate-50 px-1 rounded cursor-pointer transition-colors border border-transparent group-hover:border-slate-200">€1840.00</span>
              </div>
              <div className="p-3 flex justify-between items-center group">
                <span className="text-slate-500">Çmimi Neto</span>
                <span className="font-mono text-slate-700 group-hover:bg-slate-50 px-1 rounded cursor-pointer transition-colors border border-transparent group-hover:border-slate-200">€1420.00</span>
              </div>
              <div className="p-3 flex justify-between items-center bg-[#eef3fa]/50">
                <span className="text-slate-500">Komisioni</span>
                <div className="text-right">
                  <div className="font-mono text-emerald-600 font-medium">€420.00</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">22.8% marzh</div>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Column 2: Data Tables */}
        <div className="flex-1 bg-white flex flex-col min-w-0">
          
          {/* Combined Content: Pax + Export visible together */}
          <div className="flex-1 overflow-auto p-4">
            {true && (
              <div className="space-y-6">
                
                {/* Pax Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      Lista e Pasagjerëve
                    </h2>
                    <button className="text-xs text-[#1d4ed8] hover:text-blue-900 flex items-center gap-1 font-medium bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-100">
                      <Plus className="w-3 h-3" /> Shto Pasagjer
                    </button>
                  </div>
                  
                  <div className="border border-slate-200 rounded bg-white overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-[#eef3fa] text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium w-8 text-center">#</th>
                          <th className="px-3 py-2 font-medium">Emri</th>
                          <th className="px-3 py-2 font-medium">Lloji</th>
                          <th className="px-3 py-2 font-medium">Datëlindja</th>
                          <th className="px-3 py-2 font-medium">Pasaporta</th>
                          <th className="px-3 py-2 font-medium text-right">Çmimi</th>
                          <th className="px-3 py-2 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { id: 1, name: 'Arben Hoxha', type: 'ADT', dob: '12/04/1980', doc: 'BB1234567', price: 460 },
                          { id: 2, name: 'Teuta Hoxha', type: 'ADT', dob: '23/08/1982', doc: 'BB7654321', price: 460 },
                          { id: 3, name: 'Drilon Hoxha', type: 'CHD', dob: '05/11/2015', doc: 'BB9988776', price: 320 },
                          { id: 4, name: 'Era Hoxha', type: 'INF', dob: '10/01/2024', doc: 'BB1122334', price: 60 },
                        ].map((pax) => (
                          <tr key={pax.id} className="hover:bg-[#f8fafc] group">
                            <td className="px-3 py-2 font-mono text-slate-400 text-center text-xs">{pax.id}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium">
                              <div className="flex items-center gap-2">
                                {pax.name}
                                {pax.id === 1 && <span className="w-2 h-2 rounded-full bg-[#2563eb]" title="Primary" />}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${pax.type === 'ADT' ? 'bg-slate-100 text-slate-700' : pax.type === 'CHD' ? 'bg-indigo-100 text-indigo-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>{pax.type}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500 text-xs">{pax.dob}</td>
                            <td className="px-3 py-2 font-mono text-slate-500 text-xs">{pax.doc}</td>
                            <td className="px-3 py-2 text-right">
                              <input 
                                type="text" 
                                defaultValue={`€${pax.price.toFixed(2)}`}
                                className="bg-transparent border border-transparent hover:border-slate-200 focus:border-[#2563eb] focus:ring-1 focus:ring-blue-200 rounded px-2 py-1 w-20 text-right font-mono text-slate-800 text-xs outline-none transition-all"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button className="text-slate-400 hover:text-[#1d4ed8] opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Shtojca (Extras) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      Shtojca (Extras)
                    </h2>
                    <div className="text-sm font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">Total: €110.00</div>
                  </div>
                  
                  <div className="bg-white border border-slate-200 rounded p-3 flex items-start gap-4 shadow-sm">
                    <div className="flex flex-wrap gap-2 flex-1">
                      <div className="bg-[#eef3fa] px-3 py-1.5 rounded flex items-center gap-2 text-sm border border-slate-200">
                        <span className="text-slate-700">Bagazh 20kg (Arben)</span>
                        <span className="font-mono text-slate-900">€35.00</span>
                      </div>
                      <div className="bg-[#eef3fa] px-3 py-1.5 rounded flex items-center gap-2 text-sm border border-slate-200">
                        <span className="text-slate-700">Bagazh 20kg (Teuta)</span>
                        <span className="font-mono text-slate-900">€35.00</span>
                      </div>
                      <div className="bg-[#eef3fa] px-3 py-1.5 rounded flex items-center gap-2 text-sm border border-slate-200">
                        <span className="text-slate-700">Ulëse Rreshti 1</span>
                        <span className="font-mono text-slate-900">€22.00</span>
                      </div>
                      <div className="bg-[#eef3fa] px-3 py-1.5 rounded flex items-center gap-2 text-sm border border-slate-200">
                        <span className="text-slate-700">Sigurim Shëndeti</span>
                        <span className="font-mono text-slate-900">€18.00</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 border-l border-slate-200 pl-4">
                      <button className="text-xs text-slate-600 hover:text-[#1d4ed8] flex items-center gap-1.5">
                        <Plus className="w-3 h-3" /> Bagazh
                      </button>
                      <button className="text-xs text-slate-600 hover:text-[#1d4ed8] flex items-center gap-1.5">
                        <Plus className="w-3 h-3" /> Ulëse
                      </button>
                      <button className="text-xs text-slate-600 hover:text-[#1d4ed8] flex items-center gap-1.5">
                        <Plus className="w-3 h-3" /> Prioritet
                      </button>
                    </div>
                  </div>
                </div>

                {/* Export Table — mirror EXACT live system layout (1:1 with BookingDetailContent) */}
                {(() => {
                  const statusExcel = 'CONFIRMED';
                  const paxRows = [
                    { name: 'Arben HOXHA', col2: '20 KG', status: statusExcel, priceDisplay: '460 €', op: 'NESTI TRAVEL', note: 'K7XR2P', date: '18.6.2026', time: '14:25', route: 'TIA-FCO' },
                    { name: 'Teuta HOXHA', col2: '20 KG', status: statusExcel, priceDisplay: '460 €', op: 'NESTI TRAVEL', note: 'K7XR2P', date: '18.6.2026', time: '14:25', route: 'TIA-FCO' },
                    { name: 'Drilon HOXHA (05/11/2015)', col2: '', status: statusExcel, priceDisplay: '320 €', op: 'NESTI TRAVEL', note: 'K7XR2P', date: '18.6.2026', time: '14:25', route: 'TIA-FCO' },
                    { name: 'Era HOXHA (10/01/2024)', col2: 'INF', status: statusExcel, priceDisplay: '60 €', op: 'NESTI TRAVEL', note: '', date: '18.6.2026', time: '14:25', route: 'TIA-FCO' },
                  ];
                  const numPax = String(paxRows.filter(r => r.col2 !== 'INF').length);
                  const HEADERS = ['PASSANGER', 'EXTRA', 'CONFIRMED', '-1 SHITUR', 'OPERATORI', 'SHENIME', 'NISJA 2', 'ORA', 'DEST', 'STATUS 2'];
                  const COL_WIDTHS = [200, 60, 88, 80, 130, 60, 90, 55, 72, 88];
                  const tsv = paxRows.map(r => [r.name, r.col2, r.status, r.priceDisplay.replace(' €',''), r.op, numPax, r.date, r.time, r.route, r.status].join('\t')).join('\n');
                  const copyExcel = () => navigator.clipboard?.writeText(tsv);
                  const copyWhatsApp = () => {
                    const txt = `✈️ ${paxRows[0].route} • ${paxRows[0].date} ${paxRows[0].time}\n${paxRows[0].op} • PNR: ${paxRows[0].note}\n\n` +
                      paxRows.map((r, i) => `${i+1}. ${r.name} — ${r.priceDisplay}${r.col2 === 'INF' ? ' — INF' : ''}`).join('\n');
                    navigator.clipboard?.writeText(txt);
                  };
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden shadow-sm">
                      {/* Header bar */}
                      <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-700 text-white">
                        <div className="flex items-center gap-1.5">
                          <div className="grid grid-cols-3 gap-[3px] opacity-70">
                            {[...Array(9)].map((_, i) => <div key={i} className="w-1 h-1 bg-white rounded-[1px]" />)}
                          </div>
                          <span className="text-xs font-semibold tracking-wide">Kopjo për Excel</span>
                          <span className="text-[11px] text-emerald-300">· {paxRows.length} pasagjerë</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border bg-emerald-800/40 text-emerald-300 border-emerald-700 cursor-not-allowed">
                            RUAJ
                          </button>
                          <button onClick={copyWhatsApp} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border bg-green-600 text-white border-green-500 hover:bg-green-500 transition-colors">
                            <Copy className="h-3 w-3" /> Kopjo për WhatsApp
                          </button>
                          <button onClick={copyExcel} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 transition-colors">
                            <Copy className="h-3 w-3" /> Kopjo
                          </button>
                        </div>
                      </div>

                      {/* Excel-like table visual */}
                      <div className="overflow-x-auto px-4 py-3">
                        <table className="border-collapse text-xs font-mono w-full" style={{ minWidth: '700px' }}>
                          <thead>
                            <tr className="bg-emerald-600 text-white">
                              {HEADERS.map((h, i) => (
                                <th key={i} className="px-2 py-1.5 text-left font-bold border border-emerald-500 whitespace-nowrap tracking-wide text-[11px]"
                                  style={{ minWidth: `${COL_WIDTHS[i]}px` }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paxRows.map((r, ri) => {
                              const cells = [r.name, r.col2, r.status, r.priceDisplay, r.op, r.note, r.date, r.time, r.route, r.status];
                              return (
                                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-emerald-50/50'}>
                                  {cells.map((c, ci) => {
                                    if (ci === 5) {
                                      return (
                                        <td key={ci} className="px-1 py-0.5 border border-gray-200 whitespace-nowrap text-[12px] bg-yellow-50">
                                          <input
                                            type="text"
                                            defaultValue={c}
                                            placeholder="PNR…"
                                            className="w-full px-1.5 py-1 bg-transparent font-mono text-[12px] text-center font-semibold text-gray-800 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded"
                                          />
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={ci} className={`px-2 py-1.5 border border-gray-200 whitespace-nowrap text-[12px] ${
                                        ci === 2 || ci === 9
                                          ? c === 'CONFIRMED' ? 'text-green-700 font-bold' : c === 'WAITING' ? 'text-orange-600 font-bold' : 'text-red-600 font-bold'
                                          : ci === 1 && c
                                          ? 'text-blue-700 font-semibold'
                                          : 'text-gray-800'
                                      }`}>
                                        {c || <span className="text-gray-300">—</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}
          </div>

        </div>

        {/* Column 3: Live Rail (Tasks & Money) */}
        <div className="w-72 bg-[#f8fafc] border-l border-slate-200 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-2 mb-4">
              Përmbledhje & Detyra
            </h3>

            {/* Money Mini-Dash */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white border border-slate-200 rounded p-2.5 shadow-sm">
                <div className="text-[10px] text-slate-500 uppercase font-medium mb-1">Paguar</div>
                <div className="font-mono text-emerald-600 text-lg">€1100</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-2.5">
                <div className="text-[10px] text-red-500 uppercase font-medium mb-1">Mbetet</div>
                <div className="font-mono text-red-600 text-lg">€740</div>
              </div>
            </div>
            
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '60%' }}></div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>60%</span>
              <span>Total: €1840</span>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-3">Statusi i Biletës</h4>
            
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="mt-0.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                <div>
                  <div className="text-sm text-slate-800">Neto e vendosur</div>
                  <div className="text-xs text-slate-500 mt-0.5">Çmimi kosto është ruajtur</div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="mt-0.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                <div>
                  <div className="text-sm text-slate-800">Pagesa pjesore</div>
                  <div className="text-xs text-slate-500 mt-0.5">€1100 nga €1840</div>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 p-2 rounded -mx-2">
                <div className="mt-0.5"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
                <div>
                  <div className="text-sm text-amber-700 font-medium">PNR mungon për 1 pax</div>
                  <div className="text-xs text-amber-600 mt-0.5">Plotësoni PNR për pasagjerin foshnjë (INF)</div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-4">
               <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-3">Historiku i Pagesave</h4>
               <div className="space-y-2">
                 <div className="flex justify-between items-center text-xs">
                   <div className="flex items-center gap-1.5 text-slate-700">
                     <CreditCard className="w-3 h-3 text-slate-400" /> Transfertë
                   </div>
                   <div className="font-mono text-slate-600">€600</div>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <div className="flex items-center gap-1.5 text-slate-700">
                     <div className="w-3 h-3 rounded-sm bg-emerald-100 flex items-center justify-center text-[8px] text-emerald-700 font-bold">C</div> Cash
                   </div>
                   <div className="font-mono text-slate-600">€500</div>
                 </div>
               </div>
            </div>
            
          </div>
          
          {/* Subtle Accent Illustration */}
          <div className="mt-auto p-4 opacity-40 pointer-events-none">
            <img src="/__mockup/images/bd-iso-flight.png" alt="" className="w-full object-cover rounded" />
          </div>
        </div>

      </div>
    </div>
  );
}
