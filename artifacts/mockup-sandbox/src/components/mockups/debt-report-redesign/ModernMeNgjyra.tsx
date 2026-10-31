import React from "react";
import { Plane, Building2, Mail, Phone, Info, Receipt, Wallet, AlertCircle, WalletCards } from "lucide-react";

const bookings = [
  { id: "FLT458201", pnr: "K8H2ML", client: "Arben Krasniqi", route: "Tiranë → Londër", date: "22/07/2026", created: "10/07/2026", status: "Konfirmuar", total: 520, paid: 200, debt: 320 },
  { id: "FLT458177", pnr: "—", client: "Elira Hoxha", route: "Tiranë → Milano", date: "25/07/2026", created: "11/07/2026", status: "TICKETED", total: 340, paid: 140, debt: 200 },
  { id: "FLT458205", pnr: "M9J3NK", client: "Besnik Shala", route: "Prishtinë → Dyseldorf", date: "28/07/2026", created: "12/07/2026", status: "Konfirmuar", total: 450, paid: 0, debt: 450 },
  { id: "FLT458212", pnr: "P2L4WQ", client: "Mirela Dema", route: "Tiranë → Vjenë", date: "30/07/2026", created: "12/07/2026", status: "Pritje", total: 280, paid: 0, debt: 280 },
  { id: "FLT458218", pnr: "R5T8YZ", client: "Fatos Berisha", route: "Tiranë → Stamboll", date: "02/08/2026", created: "12/07/2026", status: "TICKETED", total: 610, paid: 300, debt: 310 },
  { id: "FLT458225", pnr: "V8N1XC", client: "Anila Leka", route: "Tiranë → Londër", date: "05/08/2026", created: "13/07/2026", status: "Konfirmuar", total: 520, paid: 120, debt: 400 },
  { id: "FLT458230", pnr: "—", client: "Gentian Prifti", route: "Prishtinë → Dyseldorf", date: "06/08/2026", created: "13/07/2026", status: "Pritje", total: 450, paid: 200, debt: 250 },
  { id: "FLT458235", pnr: "B4M7KL", client: "Drita Kola", route: "Tiranë → Milano", date: "10/08/2026", created: "13/07/2026", status: "TICKETED", total: 340, paid: 0, debt: 340 }
];

const totals = {
  total: 3510,
  paid: 960,
  debt: 2550
};

export function ModernMeNgjyra() {
  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans print:p-0 print:bg-white flex justify-center">
      <div className="w-full max-w-[1180px] bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none flex flex-col">
        
        {/* Header Band */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#12243d] text-white p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Kings Travel</h1>
              <h2 className="text-blue-200 text-lg font-medium tracking-wide uppercase">Raport Detyrimet</h2>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-200 font-medium">Gjeneruar: 13/07/2026 14:30</div>
              <div className="text-xs text-blue-300 mt-1 opacity-80">8 rezervime</div>
            </div>
          </div>
          
          {/* Agency Contact Card Chip */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-3 items-center text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-300" />
              <span className="font-semibold">Fly Travel Tirana</span>
              <span className="text-blue-200 ml-1">(Fly Travel shpk)</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-300" />
              <span className="text-blue-100">info@flytravel.al</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-300" />
              <span className="text-blue-100">+355 69 123 4567</span>
            </div>
          </div>
        </div>

        <div className="p-8 flex-1 flex flex-col">
          {/* Summary Chips */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-full px-5 py-2 flex items-center gap-3 shadow-sm">
                <div className="bg-slate-200 p-1.5 rounded-full"><Receipt className="w-4 h-4 text-slate-600" /></div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Shuma</div>
                  <div className="font-bold text-slate-800">€{totals.total.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="bg-slate-50 border border-slate-200 rounded-full px-5 py-2 flex items-center gap-3 shadow-sm">
                <div className="bg-blue-100 p-1.5 rounded-full"><Wallet className="w-4 h-4 text-blue-600" /></div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Paguar</div>
                  <div className="font-bold text-slate-800">€{totals.paid.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-full px-5 py-2 flex items-center gap-3 shadow-sm">
                <div className="bg-red-100 p-1.5 rounded-full"><AlertCircle className="w-4 h-4 text-red-600" /></div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Total Detyrim</div>
                  <div className="font-bold text-red-700 text-lg leading-tight">€{totals.debt.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-300 border-dashed rounded-full px-4 py-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-emerald-800">Kredit Gjendje:</span>
                  <span className="font-bold text-emerald-600">+€350</span>
                </div>
                <div className="text-[9px] text-emerald-600/80 uppercase font-bold tracking-wider leading-none mt-0.5">Vetëm informuese</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto pb-4">
            <table className="w-full text-sm text-left border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Rezervimi</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">PNR</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Klienti</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Fluturimi</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Data Nisjes</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Krijuar</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">Statusi</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 text-right">Total €</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 text-right">Paguar €</th>
                  <th className="px-4 py-3 text-xs font-bold text-red-500 uppercase tracking-wider border-b border-red-200 bg-red-50/50 rounded-t-lg text-right">Detyrim €</th>
                </tr>
              </thead>
              <tbody className="font-medium">
                {bookings.map((b, i) => (
                  <tr key={i} className="group transition-colors">
                    <td className="px-4 py-3.5 bg-slate-50 rounded-l-xl group-hover:bg-slate-100 text-slate-700">{b.id}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-slate-500">{b.pnr}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-slate-800">{b.client}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Plane className="w-3.5 h-3.5 text-slate-400" />
                        {b.route}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-slate-700">{b.date}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-slate-500">{b.created}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
                        b.status === 'Konfirmuar' ? 'bg-blue-100 text-blue-700' :
                        b.status === 'TICKETED' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-right text-slate-600">€{b.total}</td>
                    <td className="px-4 py-3.5 bg-slate-50 group-hover:bg-slate-100 text-right text-slate-600">€{b.paid}</td>
                    <td className="px-4 py-3.5 bg-red-50 group-hover:bg-red-100 rounded-r-xl text-right font-bold text-red-600 border-l border-white">€{b.debt}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-right font-bold text-slate-500 uppercase tracking-widest text-xs">Totali i Përgjithshëm</td>
                  <td className="px-4 py-5 text-right font-bold text-slate-800 text-base">€{totals.total.toLocaleString()}</td>
                  <td className="px-4 py-5 text-right font-bold text-slate-800 text-base">€{totals.paid.toLocaleString()}</td>
                  <td className="px-4 py-5 text-right font-bold text-red-600 text-lg bg-red-50 rounded-xl border border-red-100 mt-2 block w-full tabular-nums">€{totals.debt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-auto pt-8 border-t border-slate-200 text-center text-xs font-medium text-slate-400">
            Kings Travel · Raport Detyrimet · 13/07/2026
          </div>
        </div>
      </div>
    </div>
  );
}
