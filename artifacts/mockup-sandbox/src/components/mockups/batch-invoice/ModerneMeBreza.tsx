import { META, ROWS, TOTAL_PREV, TOTAL_THIS, PAYMENT_AMOUNT, CREDIT, eur } from "./_shared/data";

export function ModerneMeBreza() {
  return (
    <div className="min-h-screen bg-neutral-800 p-6 font-['Inter',sans-serif]">
      <div className="mx-auto max-w-[980px] bg-white shadow-2xl overflow-hidden">
        {/* Dark header */}
        <div className="bg-slate-900 px-10 py-6 text-white flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold">Albania Sky</div>
            <div className="text-[11px] text-slate-400">{META.sub}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tracking-wide text-sky-300">BATCH INVOICE</div>
            <div className="text-[11px] text-slate-300">{META.invoiceNo}</div>
            <div className="text-[11px] text-slate-400">{META.date}</div>
          </div>
        </div>

        {/* Info strip */}
        <div className="grid grid-cols-5 divide-x border-b bg-slate-50 text-center">
          {[
            ["Metoda",    META.method],
            ["Referenca", META.ref],
            ["Rezervime", String(ROWS.length)],
            ["Pag. Mëpar.", eur(TOTAL_PREV)],
            ["Kjo Pagesë", eur(TOTAL_THIS)],
          ].map(([k, v]) => (
            <div key={k} className="py-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
              <div className="text-sm font-bold text-slate-800">{v}</div>
            </div>
          ))}
        </div>

        <div className="px-10 py-6">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b-2 border-slate-200">
                <th className="py-2 pr-2">Booking</th>
                <th className="py-2 pr-2">Klient</th>
                <th className="py-2 pr-2">Flight / Route</th>
                <th className="py-2 pr-2">Nisja</th>
                <th className="py-2 pr-2 text-right">Totali</th>
                <th className="py-2 pr-2 text-right">Pag. Mëpar.</th>
                <th className="py-2 pr-2 text-right">Kjo Pagesë</th>
                <th className="py-2 text-center">Statusi</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => {
                const fullyPaid = r.prevPaid + r.thisPaid >= r.total;
                return (
                  <tr key={r.ref} className="border-b border-slate-100 hover:bg-sky-50/40">
                    <td className="py-2 pr-2 font-bold text-slate-900">{r.ref}</td>
                    <td className="py-2 pr-2 uppercase text-slate-700">{r.client}</td>
                    <td className="py-2 pr-2 text-slate-600">{r.flight} · <span className="font-medium text-slate-800">{r.route}</span></td>
                    <td className="py-2 pr-2 tabular-nums text-slate-600">{r.departure}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{eur(r.total)}</td>
                    <td className={`py-2 pr-2 text-right tabular-nums ${r.prevPaid > 0 ? "text-amber-600 font-medium" : "text-slate-300"}`}>
                      {r.prevPaid > 0 ? eur(r.prevPaid) : "—"}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums font-bold text-slate-900">{eur(r.thisPaid)}</td>
                    <td className="py-2 text-center">
                      {fullyPaid
                        ? <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">PAGUAR</span>
                        : <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">PJESËRISHT</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={4} />
                <td className="pt-3 pr-2 text-right text-[10px] text-slate-400 uppercase">Pag. Mëpar.</td>
                <td className="pt-3 pr-2 text-right font-bold text-amber-600 tabular-nums">{eur(TOTAL_PREV)}</td>
                <td className="pt-3 pr-2 text-right font-bold text-slate-900 tabular-nums">{eur(TOTAL_THIS)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="pr-2 pt-1 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Shuma e dërguar</td>
                <td colSpan={2} className="pt-1 text-right text-base font-bold tabular-nums text-emerald-600">{eur(PAYMENT_AMOUNT)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          {/* Credit note */}
          {CREDIT > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-5 py-3">
              <div>
                <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">⚡ Kreditim i gjeneruar</div>
                <div className="text-[10px] text-amber-700 mt-0.5">Pagesa tejkalon detyrimet — diferenca regjistrohet si kredi në llogari.</div>
              </div>
              <div className="text-xl font-bold text-amber-700 tabular-nums">+ {eur(CREDIT)}</div>
            </div>
          )}

          <div className="mt-6 flex justify-between border-t pt-2 text-[10px] text-slate-400">
            <span>Albania Sky — Dokument i gjeneruar automatikisht</span>
            <span>{META.invoiceNo} · {META.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
