import { META, ROWS, TOTAL_PREV, TOTAL_THIS, PAYMENT_AMOUNT, CREDIT, eur } from "./_shared/data";

// Varianti 3 — Ledger Kompakt (FINAL, zgjedhur nga useri)
// Ndryshime: "Paid Today" vetem per kete pagese, pa rresht nentotalesh,
// kreditim jeshil, anglisht zyrtar.
export function LedgerKompakt() {
  return (
    <div className="min-h-screen bg-neutral-800 p-6 font-['Inter',sans-serif]">
      <div className="mx-auto max-w-[980px] bg-white shadow-2xl px-10 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold text-indigo-900">Albania Sky</div>
            <div className="text-[11px] text-gray-500">{META.sub}</div>
          </div>
          <div className="text-right text-[11px] text-gray-600">
            <div className="text-lg font-bold text-indigo-900 uppercase tracking-wide">Payment Invoice</div>
            <div>{META.invoiceNo}</div>
            <div>{META.date}</div>
          </div>
        </div>

        {/* Meta box */}
        <div className="mt-4 grid grid-cols-4 border text-[11px]">
          <div className="border-r px-3 py-2"><span className="text-gray-400 uppercase text-[9px] block">Payment Method</span><b>{META.method}</b></div>
          <div className="border-r px-3 py-2"><span className="text-gray-400 uppercase text-[9px] block">Reference</span><b>{META.ref}</b></div>
          <div className="border-r px-3 py-2"><span className="text-gray-400 uppercase text-[9px] block">Bookings</span><b>{ROWS.length}</b></div>
          <div className="px-3 py-2"><span className="text-gray-400 uppercase text-[9px] block">Previous Payments</span><b className="text-amber-700">{eur(TOTAL_PREV)}</b></div>
        </div>

        {/* Table */}
        <table className="mt-4 w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-indigo-900 text-white">
              <th className="border border-indigo-800 px-1.5 py-1 w-6">#</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-left">Booking</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-left">Passenger</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-left">Route</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-left">Flight</th>
              <th className="border border-indigo-800 px-1.5 py-1">Departure</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-right">Total</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-right">Prev. Paid</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-right">Paid Today</th>
              <th className="border border-indigo-800 px-1.5 py-1 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => {
              const remaining = r.total - r.prevPaid - r.thisPaid;
              return (
                <tr key={r.ref} className={i % 2 ? "bg-indigo-50/40" : ""}>
                  <td className="border px-1.5 py-1 text-center text-gray-400">{i + 1}</td>
                  <td className="border px-1.5 py-1 font-bold text-indigo-900">{r.ref}</td>
                  <td className="border px-1.5 py-1 uppercase">{r.client}</td>
                  <td className="border px-1.5 py-1">{r.route}</td>
                  <td className="border px-1.5 py-1">{r.flight}</td>
                  <td className="border px-1.5 py-1 text-center tabular-nums">{r.departure}</td>
                  <td className="border px-1.5 py-1 text-right tabular-nums">{eur(r.total)}</td>
                  <td className={`border px-1.5 py-1 text-right tabular-nums ${r.prevPaid > 0 ? "text-amber-700 font-medium" : "text-gray-300"}`}>
                    {r.prevPaid > 0 ? eur(r.prevPaid) : "—"}
                  </td>
                  <td className="border px-1.5 py-1 text-right tabular-nums font-bold text-indigo-900">{eur(r.thisPaid)}</td>
                  <td className={`border px-1.5 py-1 text-right tabular-nums ${remaining <= 0 ? "text-emerald-600" : "text-rose-600 font-bold"}`}>
                    {eur(remaining)}
                  </td>
                </tr>
              );
            })}

            {/* Paid Today total row only */}
            <tr className="bg-indigo-900 text-white font-bold">
              <td colSpan={8} className="border border-indigo-800 px-1.5 py-1.5 text-right uppercase text-[10px] tracking-wide">
                Total Paid Today
              </td>
              <td className="border border-indigo-800 px-1.5 py-1.5 text-right tabular-nums text-[13px]">{eur(TOTAL_THIS)}</td>
              <td className="border border-indigo-800 px-1.5 py-1.5 text-right tabular-nums text-emerald-300">0.00 €</td>
            </tr>
          </tbody>
        </table>

        {/* Credit note — green when overpaid */}
        {CREDIT > 0 && (
          <div className="mt-3 border border-emerald-400 bg-emerald-50">
            <div className="grid grid-cols-[1fr_auto] items-center px-4 py-2.5 gap-8">
              <div>
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">CREDIT NOTE — Overpayment</div>
                <div className="text-[10px] text-emerald-700 mt-0.5">
                  Amount received ({eur(PAYMENT_AMOUNT)}) exceeds the total due ({eur(TOTAL_THIS)}).
                  The difference has been credited to the agency account.
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-emerald-600 uppercase">Credit</div>
                <div className="text-xl font-bold text-emerald-700 tabular-nums">+ {eur(CREDIT)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between border-t pt-2 text-[10px] text-gray-400">
          <span>Albania Sky — Automatically generated document</span>
          <span>{META.invoiceNo} | {META.date}</span>
        </div>
      </div>
    </div>
  );
}
