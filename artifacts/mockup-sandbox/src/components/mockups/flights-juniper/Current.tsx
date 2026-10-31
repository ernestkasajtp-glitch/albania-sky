import { useState } from "react";
import { Activity, ArrowRight, CheckSquare, PlaneTakeoff, Square, Tag } from "lucide-react";
import { dateLabel, flights, useLocalFlights } from "./_data";
import "./_group.css";

/**
 * SOURCE EXTRACTION, not a reconstruction.
 * Filter fragments: flights.tsx 2596–2637, 2675–2687.
 * Standard table: 3156–3192, 3255–3272, 3350–3382.
 * Auth/admin branches, network price cells, quick-edit/prefetch and navigation
 * are deliberately cut at their stub boundaries. DatePicker is a local date input.
 * The compact sibling modifies these same field names, column loop and row shape.
 * This baseline is retained in files only, NOT added as a second Canvas frame.
 */
export function Current() {
  const { airlineFlightNo, setAirlineFlightNo, startDate, setStartDate, endDate, setEndDate, minPrice, setMinPrice, maxPrice, setMaxPrice, statusFilter, setStatusFilter, colVisible, handleSort, paginatedFlights, selectedIds, toggleSelectAll, toggleSelect, clearFilters } = useLocalFlights();
  const [detail, setDetail] = useState<number | null>(null);
  const fmtM = (value: number) => Math.round(value);
  const fmtAmPm = (value: string) => value; // User explicitly requests 24h, unlike production.
  const fmtFlightNum = (value: string) => value;
  const openDetail = (id: number) => setDetail(id); // routing/API stub
  return <div className="kj-flights p-6">
    <div className="flex justify-between items-center mb-4 gap-2">
      <div><h1 className="text-xl md:text-2xl font-bold tracking-tight">Inventari i fluturimeve</h1><p className="text-muted-foreground text-xs md:text-sm hidden sm:block">Pamje prove · të dhëna ilustruese</p></div>
    </div>
    <div className="bg-card border rounded-xl p-3 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm min-w-[170px]">
          <PlaneTakeoff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input placeholder="Kompania / nr. fluturimit" value={airlineFlightNo} onChange={e => setAirlineFlightNo(e.target.value)} className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground" />
        </div>
        <input aria-label="Data nisjes" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 border rounded-lg px-3" />
        <input aria-label="Data mbarimit" type="date" min={startDate || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 border rounded-lg px-3" />
        <div className="flex items-center gap-1 border rounded-lg px-2.5 py-1.5 bg-background text-sm">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input type="number" min={0} inputMode="numeric" placeholder="Çmim min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="bg-transparent outline-none w-[78px] text-sm placeholder:text-muted-foreground" />
          <span className="text-muted-foreground">–</span>
          <input type="number" min={0} inputMode="numeric" placeholder="Çmim max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="bg-transparent outline-none w-[80px] text-sm placeholder:text-muted-foreground" />
        </div>
        <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
          <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
            <option value="all">Statusi</option><option value="open">Hapur</option><option value="closed">Mbyllur</option><option value="soldout">Pa vende</option>
          </select>
        </div>
        <button onClick={clearFilters} className="text-sm text-muted-foreground">Hiq filtrat</button>
      </div>
    </div>
    <div className="border rounded-xl overflow-x-auto mt-4">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-muted/40"><tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
          <th className="px-3 py-3 w-8"><button onClick={toggleSelectAll} aria-label="Zgjidh të gjitha" className="text-muted-foreground hover:text-foreground">{paginatedFlights.length > 0 && paginatedFlights.every(f => selectedIds.has(f.id)) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}</button></th>
          {(["route","date","flightNo","seats","price"] as const).filter(colVisible).map(col => {
            const labels: Record<string, string> = { route: "Itinerari", date: "Data", flightNo: "Fluturimi", seats: "Vendet", price: "Një drejtim" };
            const rightAlign = col === "price";
            return <th key={col} className={`px-4 py-3 font-medium ${rightAlign ? "text-right" : "text-left"}`}><button onClick={() => handleSort(col)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">{labels[col]}</button></th>;
          })}
          <th className="text-right px-4 py-3 font-medium">Detaje</th>
        </tr></thead>
        <tbody>{paginatedFlights.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nuk u gjetën fluturime</td></tr> : paginatedFlights.map(f => {
          const available = f.totalSeats - f.soldSeats;
          const sold = f.soldSeats || 0;
          const total = f.totalSeats;
          const isSelected = selectedIds.has(f.id);
          const dateStr = dateLabel(f.departureDate);
          return <tr key={f.id} className={`border-b transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"}`}>
            <td className="px-3 py-3"><button onClick={() => toggleSelect(f.id)} aria-label={`Zgjidh ${f.flightNumber}`} className="text-muted-foreground hover:text-foreground">{isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}</button></td>
            {colVisible("route") && <td className="px-4 py-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full shrink-0 ${f.status === "open" ? "bg-emerald-500" : "bg-amber-500"}`} /><div className="flex flex-wrap items-center gap-y-0.5"><span className="font-bold tracking-wider text-sm whitespace-nowrap">{f.fromCity} &rarr; {f.toCity}</span></div></div></td>}
            {colVisible("date") && <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{dateStr}, {fmtAmPm(f.departureTime)}{f.arrivalTime ? ` – ${fmtAmPm(f.arrivalTime)}` : ""}</td>}
            {colVisible("flightNo") && <td className="px-4 py-3"><button onClick={() => openDetail(f.id)} className="font-mono font-medium text-primary hover:underline cursor-pointer">{fmtFlightNum(f.flightNumber)}</button></td>}
            {colVisible("seats") && <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="text-foreground">{available}</span><span className="text-green-600">{sold}</span><span className="text-muted-foreground">{total}</span></div></td>}
            {colVisible("price") && <td className="px-4 py-3 font-semibold whitespace-nowrap">€{fmtM(f.adultPrice)}</td>}
            <td className="px-4 py-3 text-right"><button onClick={() => openDetail(f.id)} className="text-primary inline-flex items-center gap-2">Detaje <ArrowRight /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {detail !== null && <div className="mt-4 border rounded-lg p-4"><strong>{flights.find(f => f.id === detail)?.flightNumber}</strong><span className="ml-4">Pamje prove · të dhëna ilustruese</span><button className="ml-4 text-primary" onClick={() => setDetail(null)}>Mbyll</button></div>}
  </div>;
}