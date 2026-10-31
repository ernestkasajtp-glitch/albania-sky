import React from "react";

export function TabelaKlasike() {
  const bookings = [
    {
      id: "FLT458201",
      pnr: "K8H2ML",
      client: "Arben Krasniqi",
      nisja: "Tiranë", mberritja: "Londër",
      departure: "22/07/2026",
      created: "10/07/2026",
      status: "Konfirmuar",
      total: 520,
      paid: 200,
      debt: 320,
    },
    {
      id: "FLT458177",
      pnr: "—",
      client: "Elira Hoxha",
      nisja: "Tiranë", mberritja: "Milano",
      departure: "25/07/2026",
      created: "11/07/2026",
      status: "Pritje",
      total: 340,
      paid: 100,
      debt: 240,
    },
    {
      id: "FLT458222",
      pnr: "X9P4Q1",
      client: "Besnik Shala",
      nisja: "Prishtinë", mberritja: "Dyseldorf",
      departure: "28/07/2026",
      created: "12/07/2026",
      status: "TICKETED",
      total: 650,
      paid: 300,
      debt: 350,
    },
    {
      id: "FLT458245",
      pnr: "M2N4B8",
      client: "Mirela Dema",
      nisja: "Tiranë", mberritja: "Vjenë",
      departure: "30/07/2026",
      created: "12/07/2026",
      status: "Konfirmuar",
      total: 480,
      paid: 180,
      debt: 300,
    },
    {
      id: "FLT458250",
      pnr: "—",
      client: "Fatos Berisha",
      nisja: "Tiranë", mberritja: "Stamboll",
      departure: "02/08/2026",
      created: "13/07/2026",
      status: "Pritje",
      total: 390,
      paid: 0,
      debt: 390,
    },
    {
      id: "FLT458255",
      pnr: "L9K2J1",
      client: "Anila Leka",
      nisja: "Tiranë", mberritja: "Londër",
      departure: "05/08/2026",
      created: "13/07/2026",
      status: "TICKETED",
      total: 850,
      paid: 400,
      debt: 450,
    },
    {
      id: "FLT458260",
      pnr: "R4T7Y8",
      client: "Gentian Prifti",
      nisja: "Tiranë", mberritja: "Milano",
      departure: "10/08/2026",
      created: "13/07/2026",
      status: "Konfirmuar",
      total: 920,
      paid: 500,
      debt: 420,
    },
    {
      id: "FLT458265",
      pnr: "P1O8I3",
      client: "Drita Kola",
      nisja: "Prishtinë", mberritja: "Dyseldorf",
      departure: "15/08/2026",
      created: "13/07/2026",
      status: "TICKETED",
      total: 700,
      paid: 440,
      debt: 260,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans text-slate-800 flex justify-center overflow-x-auto">
      {/* A4 Landscape Paper */}
      <div className="bg-white w-[1180px] min-h-[834px] shadow-sm ring-1 ring-slate-200 p-10 flex flex-col relative shrink-0">
        
        {/* Header Letterhead */}
        <div className="flex justify-between items-start border-b-2 border-[#1e3a5f] pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] tracking-tight">KINGS TRAVEL</h1>
            <p className="text-lg font-medium text-slate-600 mt-1 uppercase tracking-widest">Raport Detyrimet</p>
            <p className="text-xs text-slate-500 mt-4">Gjeneruar: 13/07/2026 14:30 &middot; {bookings.length} rezervime</p>
          </div>
          
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="text-slate-500 text-right">Agjencia:</div>
              <div className="font-semibold text-slate-800">Fly Travel Tirana</div>
              
              <div className="text-slate-500 text-right">Kompania:</div>
              <div className="font-semibold text-slate-800">Fly Travel shpk</div>
              
              <div className="text-slate-500 text-right">Email:</div>
              <div className="text-slate-800">info@flytravel.al</div>
              
              <div className="text-slate-500 text-right">Tel:</div>
              <div className="text-slate-800">+355 69 123 4567</div>
            </div>
          </div>
        </div>

        {/* Summary Boxes */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="border border-slate-300 p-4 rounded-sm flex flex-col justify-center">
            <span className="text-xs font-semibold text-slate-500 uppercase mb-1">Total Shuma</span>
            <span className="text-2xl font-bold text-slate-800">&euro;4,850</span>
          </div>
          <div className="border border-slate-300 p-4 rounded-sm flex flex-col justify-center">
            <span className="text-xs font-semibold text-slate-500 uppercase mb-1">Total Paguar</span>
            <span className="text-2xl font-bold text-slate-800">&euro;2,120</span>
          </div>
          <div className="border-2 border-red-200 bg-red-50 p-4 rounded-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-red-600 uppercase mb-1">Total Detyrim</span>
            <span className="text-2xl font-bold text-red-700">&euro;2,730</span>
          </div>
          <div className="border border-green-200 bg-green-50/50 p-4 rounded-sm flex flex-col justify-center border-dashed">
            <span className="text-xs font-semibold text-green-600 uppercase mb-1">Kredit Gjendje (Info)</span>
            <span className="text-xl font-bold text-green-700">+&euro;350</span>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-grow">
          <table className="w-full text-sm border-collapse border border-slate-300">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">Rezervimi</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">PNR</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">Klienti</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">Nisja</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">Mbërritja</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400 whitespace-nowrap">Data Nisjes</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400 whitespace-nowrap">Krijuar</th>
                <th className="py-2.5 px-3 text-left font-semibold border border-slate-400">Statusi</th>
                <th className="py-2.5 px-3 text-right font-semibold border border-slate-400">Total &euro;</th>
                <th className="py-2.5 px-3 text-right font-semibold border border-slate-400">Paguar &euro;</th>
                <th className="py-2.5 px-3 text-right font-semibold border border-slate-400">Detyrim &euro;</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {bookings.map((b, i) => (
                <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="py-2.5 px-3 border border-slate-300 font-mono text-xs">{b.id}</td>
                  <td className="py-2.5 px-3 border border-slate-300 font-mono text-xs">{b.pnr}</td>
                  <td className="py-2.5 px-3 border border-slate-300 font-medium">{b.client}</td>
                  <td className="py-2.5 px-3 border border-slate-300">{b.nisja}</td>
                  <td className="py-2.5 px-3 border border-slate-300">{b.mberritja}</td>
                  <td className="py-2.5 px-3 border border-slate-300">{b.departure}</td>
                  <td className="py-2.5 px-3 border border-slate-300 text-slate-500">{b.created}</td>
                  <td className="py-2.5 px-3 border border-slate-300">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      b.status === 'Konfirmuar' ? 'bg-blue-100 text-blue-800' :
                      b.status === 'TICKETED' ? 'bg-green-100 text-green-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 border border-slate-300 text-right tabular-nums text-slate-600">{b.total}</td>
                  <td className="py-2.5 px-3 border border-slate-300 text-right tabular-nums text-slate-600">{b.paid}</td>
                  <td className="py-2.5 px-3 border border-slate-300 text-right tabular-nums font-bold text-red-600">{b.debt}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-[3px] border-t-slate-400">
                <td colSpan={8} className="py-3 px-3 text-right uppercase text-slate-800">Totali:</td>
                <td className="py-3 px-3 text-right border-x border-slate-300 tabular-nums">4,850</td>
                <td className="py-3 px-3 text-right border-x border-slate-300 tabular-nums">2,120</td>
                <td className="py-3 px-3 text-right border-x border-slate-300 tabular-nums text-red-700">2,730</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-400 font-medium">
          Kings Travel &middot; Raport Detyrimet &middot; 13/07/2026
        </div>
      </div>
    </div>
  );
}
