import { META, ROWS, TOTAL_PREV, TOTAL_THIS, PAYMENT_AMOUNT, CREDIT, eur } from "./_shared/data";

export function TabelaKlasike() {
  return (
    <div className="min-h-screen bg-neutral-800 p-6 font-['Inter',sans-serif]">
      <div className="mx-auto max-w-[980px] bg-white shadow-2xl px-10 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold text-blue-900">Albania Sky</div>
            <div className="text-[11px] text-gray-500">{META.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-blue-900 uppercase">Batch Invoice</div>
            <div className="text-[11px] text-gray-600">Invoice No: {META.invoiceNo}</div>
            <div className="text-[11px] text-gray-600">Payment date: {META.date}</div>
            <div className="text-[11px] text-gray-600">Method: <b>{META.method}</b> · Ref: {META.ref}</div>
          </div>
        </div>
        <div className="mt-3 h-[3px] bg-blue-900" />

        <div className="mt-5 text-[11px] font-bold uppercase tracking-wide text-blue-800">
          Rezervime të paguara ({ROWS.length})
        </div>

        {/* Table */}
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="bg-blue-900 text-white">
              {[
                { h: "Booking",         align: "left"  },
                { h: "Klient",          align: "left"  },
                { h: "Route",           align: "left"  },
                { h: "Flight",          align: "left"  },
                { h: "Nisja",           align: "left"  },
                { h: "Totali",          align: "right" },
                { h: "Pag. e Mëparshme",align: "right" },
                { h: "Kjo Pagesë",      align: "right" },
                { h: "Mbetur",          align: "right" },
              ].map(({ h, align }) => (
                <th key={h} className={`px-2 py-1.5 font-semibold border-r border-blue-800 last:border-r-0 text-${align}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => {
              const remaining = r.total - r.prevPaid - r.thisPaid;
              return (
                <tr key={r.ref} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                  <td className="px-2 py-1.5 font-bold text-blue-900">{r.ref}</td>
                  <td className="px-2 py-1.5 uppercase">{r.client}</td>
                  <td className="px-2 py-1.5">{r.route}</td>
                  <td className="px-2 py-1.5">{r.flight}</td>
                  <td className="px-2 py-1.5">{r.departure}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(r.total)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.prevPaid > 0 ? "text-amber-700 font-medium" : "text-gray-300"}`}>
                    {r.prevPaid > 0 ? eur(r.prevPaid) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold text-blue-800">{eur(r.thisPaid)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${remaining <= 0 ? "text-emerald-600" : "text-rose-600 font-bold"}`}>
                    {eur(remaining)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals section */}
        <div className="mt-4 border border-gray-200 divide-y text-[11px]">
          <div className="flex justify-between px-4 py-2 bg-gray-50">
            <span className="text-gray-500 uppercase tracking-wide">Pagesa të mëparshme (të gjitha)</span>
            <span className="tabular-nums text-amber-700 font-semibold">{eur(TOTAL_PREV)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 bg-gray-50">
            <span className="text-gray-500 uppercase tracking-wide">Pagesa me këtë faturë</span>
            <span className="tabular-nums font-bold text-blue-900">{eur(TOTAL_THIS)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 bg-emerald-50">
            <span className="font-bold uppercase text-emerald-800">Shuma totale e dërguar</span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{eur(PAYMENT_AMOUNT)}</span>
          </div>
        </div>

        {/* Credit note — shown only when overpaid */}
        {CREDIT > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-amber-400 text-white font-bold text-sm">+</div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">Kreditim i gjeneruar</div>
              <div className="text-[10px] text-amber-700">Shuma e dërguar tejkalon detyrimet — diferenca kreditohet automatikisht në llogarinë e agjencisë.</div>
            </div>
            <div className="text-lg font-bold text-amber-700 tabular-nums">{eur(CREDIT)}</div>
          </div>
        )}

        <div className="mt-8 flex justify-between border-t pt-2 text-[10px] text-gray-400">
          <span>Albania Sky — Dokument i gjeneruar automatikisht</span>
          <span>Invoice: {META.invoiceNo}</span>
        </div>
      </div>
    </div>
  );
}
