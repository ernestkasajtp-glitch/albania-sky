import React from 'react';

const bookings = [
  { id: "FLT458201", pnr: "K8H2ML", client: "Arben Krasniqi", flight: "Tiranë → Londër", date: "22/07/2026", created: "10/07/2026", status: "Konfirmuar", total: 520, paid: 200, debt: 320, pay: "Bank 10/07", statusColor: "text-blue-600" },
  { id: "FLT458177", pnr: "—", client: "Elira Hoxha", flight: "Tiranë → Milano", date: "25/07/2026", created: "11/07/2026", status: "TICKETED", total: 340, paid: 100, debt: 240, pay: "Cash 11/07", statusColor: "text-green-600" },
  { id: "FLT458180", pnr: "L9P3Q1", client: "Besnik Shala", flight: "Prishtinë → Dyseldorf", date: "26/07/2026", created: "12/07/2026", status: "Pritje", total: 450, paid: 0, debt: 450, pay: "—", statusColor: "text-amber-600" },
  { id: "FLT458190", pnr: "W4M8V2", client: "Mirela Dema", flight: "Tiranë → Vjenë", date: "28/07/2026", created: "12/07/2026", status: "Konfirmuar", total: 850, paid: 500, debt: 350, pay: "Bank 12/07 + Cash 13/07", statusColor: "text-blue-600" },
  { id: "FLT458195", pnr: "R2J9C4", client: "Fatos Berisha", flight: "Tiranë → Stamboll", date: "30/07/2026", created: "13/07/2026", status: "TICKETED", total: 280, paid: 200, debt: 80, pay: "Kartë 13/07", statusColor: "text-green-600" },
  { id: "FLT458205", pnr: "T5F1K9", client: "Anila Leka", flight: "Tiranë → Londër", date: "02/08/2026", created: "13/07/2026", status: "Konfirmuar", total: 1100, paid: 500, debt: 600, pay: "Bank 05/07 + Cash 13/07", statusColor: "text-blue-600" },
  { id: "FLT458210", pnr: "—", client: "Gentian Prifti", flight: "Prishtinë → Dyseldorf", date: "05/08/2026", created: "13/07/2026", status: "Pritje", total: 450, paid: 150, debt: 300, pay: "Cash 13/07", statusColor: "text-amber-600" },
  { id: "FLT458215", pnr: "M7N4X6", client: "Drita Kola", flight: "Tiranë → Milano", date: "06/08/2026", created: "13/07/2026", status: "TICKETED", total: 860, paid: 470, debt: 390, pay: "Bank 08/07 + Kartë 13/07", statusColor: "text-green-600" },
];

export function KompaktZebra() {
  return (
    <div className="min-h-screen bg-neutral-200 p-8 flex items-start justify-center font-sans antialiased text-neutral-900">
      {/* A4 Landscape Page Container */}
      <div className="bg-white shadow-xl w-[1180px] min-h-[834px] p-12 flex flex-col">
        
        {/* Header Strip */}
        <div className="flex justify-between items-baseline border-b border-neutral-800 pb-2 mb-3">
          <div className="flex items-baseline gap-4">
            <h1 className="text-xl font-bold tracking-tight text-[#1e3a5f]">KINGS TRAVEL</h1>
            <span className="text-sm font-medium tracking-wide uppercase text-neutral-500">Raport Detyrimet</span>
          </div>
          <div className="text-xs text-neutral-600 font-mono tracking-tight">
            <span className="font-semibold text-neutral-800">Agjencia:</span> Fly Travel Tirana <span className="mx-1">·</span> 
            <span className="font-semibold text-neutral-800">Kompania:</span> Fly Travel shpk <span className="mx-1">·</span> 
            info@flytravel.al <span className="mx-1">·</span> 
            +355 69 123 4567
          </div>
        </div>

        {/* Summary Strip */}
        <div className="flex justify-between items-center text-xs pb-4 mb-6 border-b border-neutral-300">
          <div className="text-neutral-500 font-mono">
            Gjeneruar: <span className="text-neutral-900 font-medium">13/07/2026 14:30</span> <span className="mx-2">·</span> 8 rezervime
          </div>
          <div className="flex items-center gap-6 font-mono text-[13px]">
            <div className="text-neutral-600">Total Shuma: <span className="text-neutral-900 font-semibold ml-1">€4,850</span></div>
            <div className="text-neutral-600">Total Paguar: <span className="text-neutral-900 font-semibold ml-1">€2,120</span></div>
            <div className="text-neutral-800 font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded-sm">
              Total Detyrim: €2,730
            </div>
            <div className="text-neutral-500 border-l border-neutral-300 pl-6 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider">Kredit Gjendje (Info):</span> 
              <span className="text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded-sm">+€350</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1">
          <table className="w-full text-left border-collapse text-[11px] font-medium">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-neutral-500 uppercase tracking-wider">
                <th className="py-2 px-2 font-semibold">Rezervimi</th>
                <th className="py-2 px-2 font-semibold">PNR</th>
                <th className="py-2 px-2 font-semibold">Klienti</th>
                <th className="py-2 px-2 font-semibold">Fluturimi</th>
                <th className="py-2 px-2 font-semibold">Data Nisjes</th>
                <th className="py-2 px-2 font-semibold">Krijuar</th>
                <th className="py-2 px-2 font-semibold">Statusi</th>
                <th className="py-2 px-2 font-semibold text-right">Total €</th>
                <th className="py-2 px-2 font-semibold text-right">Paguar €</th>
                <th className="py-2 px-2 font-semibold">Pagesa</th>
                <th className="py-2 px-2 font-semibold text-right text-red-700">Detyrim €</th>
              </tr>
            </thead>
            <tbody className="text-neutral-800 font-mono tracking-tight">
              {bookings.map((b, idx) => (
                <tr key={b.id} className={`border-b border-neutral-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                  <td className="py-2 px-2 text-neutral-900 font-semibold">{b.id}</td>
                  <td className="py-2 px-2 text-neutral-500">{b.pnr}</td>
                  <td className="py-2 px-2 font-sans text-[12px]">{b.client}</td>
                  <td className="py-2 px-2 font-sans text-[12px]">{b.flight}</td>
                  <td className="py-2 px-2">{b.date}</td>
                  <td className="py-2 px-2 text-neutral-500">{b.created}</td>
                  <td className={`py-2 px-2 font-sans font-bold text-[10px] uppercase tracking-wider ${b.statusColor}`}>{b.status}</td>
                  <td className="py-2 px-2 text-right">€{b.total}</td>
                  <td className="py-2 px-2 text-right">€{b.paid}</td>
                  <td className="py-2 px-2 font-sans text-[10px] uppercase tracking-tight text-neutral-600 whitespace-nowrap">{b.pay}</td>
                  <td className="py-2 px-2 text-right font-bold text-red-600">€{b.debt}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-800 text-[13px] font-bold font-mono">
                <td colSpan={7} className="py-3 px-2 text-right uppercase tracking-wider text-neutral-600 font-sans">
                  Totali:
                </td>
                <td className="py-3 px-2 text-right text-neutral-900">€4,850</td>
                <td className="py-3 px-2 text-right text-neutral-900">€2,120</td>
                <td className="py-3 px-2"></td>
                <td className="py-3 px-2 text-right text-red-700">€2,730</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-neutral-200 text-center text-[10px] text-neutral-400 font-mono uppercase tracking-widest">
          Kings Travel <span className="mx-2">·</span> Raport Detyrimet <span className="mx-2">·</span> 13/07/2026
        </div>
      </div>
    </div>
  );
}
