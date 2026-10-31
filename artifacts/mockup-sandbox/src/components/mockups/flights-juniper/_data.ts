// Local response-shape substitute for flight queries. No API, auth or routing imports.
import { useMemo, useState } from "react";

export type Flight = {
  id: number; fromCity: string; toCity: string; destination: string;
  departureDate: string; departureTime: string; arrivalTime: string;
  flightNumber: string; airline: string; totalSeats: number; soldSeats: number;
  adultPrice: number; googlePrice: number; checkedBaggageKg: number;
  checkedBaggagePrice: number; status: "open" | "closed" | "soldout";
  scheduleAlert: string; externalSalesBlocked: boolean; showInBookingEngine: boolean;
  group: string; netPrice: number;
};
const routes = [
  ["MXP", "Milano Malpensa", "W4 5019", "Wizz Air Malta", "06:10", "08:15"],
  ["FCO", "Romë Fiumicino", "W4 5011", "Wizz Air Malta", "07:35", "09:10"],
  ["BGY", "Milano Bergamo", "FR 8349", "Ryanair", "08:20", "10:20"],
  ["BLQ", "Bolonjë", "W4 5037", "Wizz Air Malta", "09:45", "11:35"],
  ["FMM", "Memmingen", "W4 5103", "Wizz Air Malta", "10:30", "12:45"],
  ["DTM", "Dortmund", "W4 5109", "Wizz Air Malta", "12:15", "14:55"],
  ["VCE", "Venecia", "W4 5031", "Wizz Air Malta", "13:40", "15:20"],
  ["TRN", "Torino", "FR 8341", "Ryanair", "15:10", "17:20"],
  ["BER", "Berlin", "W4 5115", "Wizz Air Malta", "16:25", "18:55"],
  ["PSA", "Pizë", "FR 8423", "Ryanair", "17:50", "19:40"],
  ["HAM", "Hamburg", "W4 5117", "Wizz Air Malta", "19:10", "21:55"],
  ["CTA", "Katania", "W4 5057", "Wizz Air Malta", "20:35", "22:10"],
];
export const flights: Flight[] = Array.from({ length: 37 }, (_, i) => {
  const r = routes[i % routes.length];
  const price = [89, 74, 67, 93, 119, 136, 82, 105, 148, 79, 157, 91][i % 12] + Math.floor(i / 12) * 7;
  const sold = [7, 12, 4, 17, 23, 8, 3, 15, 11, 20, 6, 9][i % 12];
  const total = [24, 28, 20, 20, 23, 26, 18, 24, 25, 20, 27, 22][i % 12];
  return { id: i + 1, fromCity: "TIA", toCity: r[0], destination: r[1], flightNumber: r[2], airline: r[3], departureTime: r[4], arrivalTime: r[5],
    departureDate: `2026-06-${String(18 + Math.floor(i / 6)).padStart(2, "0")}`,
    totalSeats: total, soldSeats: sold, adultPrice: price, googlePrice: price - [12, 8, -6, 9][i % 4],
    netPrice: price - 14, checkedBaggageKg: i % 3 === 0 ? 20 : 10, checkedBaggagePrice: i % 3 === 0 ? 35 : 18,
    status: total === sold ? "soldout" : i % 11 === 8 ? "closed" : "open",
    scheduleAlert: i % 12 === 3 ? "time_changed" : total - sold > 0 && total - sold < 4 ? "low_seats" : "",
    externalSalesBlocked: i % 11 === 8, showInBookingEngine: i % 11 !== 8, group: ["FMM", "DTM", "BER", "HAM"].includes(r[0]) ? "Gjermani · Verë" : "Itali · Verë" };
});
export const columnDefs = [
  { key: "route", label: "Itinerari" }, { key: "date", label: "Data" },
  { key: "time", label: "Orari" }, { key: "flightNo", label: "Fluturimi" },
  { key: "seats", label: "Vendet" }, { key: "price", label: "Çmimi ynë" },
  { key: "google", label: "Google" }, { key: "baggage", label: "Bagazhi" },
  { key: "status", label: "Statusi" }, { key: "alert", label: "Njoftimet" },
  { key: "groups", label: "Grupet" }, { key: "net", label: "Neto" },
] as const;
export const tabs = [
  { key: "all", label: "Të gjitha" }, { key: "bookable", label: "Të rezervueshme" },
  { key: "soldout", label: "Pa vende" }, { key: "alerts", label: "Njoftime" },
  { key: "newprice", label: "Çmim i ri" }, { key: "excluded", label: "Përjashtuar online" },
];
export const statusLabels = { open: "Hapur", closed: "Mbyllur", soldout: "Pa vende" };
export function dateLabel(date: string) { return `${date.slice(8)} qer 2026`; }
export function matchesTab(f: Flight, tab: string) {
  return tab === "all" || (tab === "bookable" && f.status === "open") || (tab === "soldout" && f.status === "soldout") || (tab === "alerts" && !!f.scheduleAlert) || (tab === "newprice" && f.googlePrice > f.adultPrice) || (tab === "excluded" && !f.showInBookingEngine);
}
export function useLocalFlights() {
  const [airlineFlightNo, setAirlineFlightNo] = useState("");
  const [toCity, setToCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minGooglePrice, setMinGooglePrice] = useState("");
  const [maxGooglePrice, setMaxGooglePrice] = useState("");
  const [externalFilter, setExternalFilter] = useState("all");
  const [beFilter, setBeFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");
  const [seatBooking, setSeatBooking] = useState("");
  const [group, setGroup] = useState("");
  const [tab, setTab] = useState("all");
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(Object.fromEntries(columnDefs.map(c => [c.key, !["groups", "net"].includes(c.key)])));
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const filtered = useMemo(() => flights.filter(f => {
    const q = airlineFlightNo.toLowerCase().replace(/\s/g, "");
    const available = f.totalSeats - f.soldSeats;
    return matchesTab(f, tab) && (!q || `${f.fromCity}${f.toCity}${f.destination}${f.flightNumber}${f.airline}`.toLowerCase().replace(/\s/g, "").includes(q))
      && (!toCity || f.toCity === toCity) && (!startDate || f.departureDate >= startDate) && (!endDate || f.departureDate <= endDate)
      && (statusFilter === "all" || f.status === statusFilter)
      && (!minPrice || f.adultPrice >= Number(minPrice)) && (!maxPrice || f.adultPrice <= Number(maxPrice))
      && (!minGooglePrice || f.googlePrice >= Number(minGooglePrice)) && (!maxGooglePrice || f.googlePrice <= Number(maxGooglePrice))
      && (externalFilter === "all" || f.externalSalesBlocked === (externalFilter === "blocked"))
      && (beFilter === "all" || f.showInBookingEngine === (beFilter === "visible"))
      && (alertFilter === "all" || (alertFilter === "any" ? !!f.scheduleAlert : alertFilter === "none" ? !f.scheduleAlert : f.scheduleAlert === alertFilter))
      && (!seatBooking || (seatBooking === "with" ? f.soldSeats > 0 : seatBooking === "without" ? f.soldSeats === 0 : seatBooking === "noseat" ? available === 0 : available > 0))
      && (!group || f.group === group);
  }).sort((a, b) => {
    const val = (f: Flight): string | number => sortKey === "route" ? f.toCity : sortKey === "date" ? f.departureDate + f.departureTime : sortKey === "time" ? f.departureTime : sortKey === "flightNo" ? f.flightNumber : sortKey === "seats" ? f.totalSeats - f.soldSeats : sortKey === "price" ? f.adultPrice : sortKey === "google" ? f.googlePrice : sortKey === "baggage" ? f.checkedBaggageKg : sortKey === "net" ? f.netPrice : sortKey === "status" ? f.status : sortKey === "groups" ? f.group : f.scheduleAlert;
    return (typeof val(a) === "number" ? Number(val(a)) - Number(val(b)) : String(val(a)).localeCompare(String(val(b)))) * sortDir;
  }), [airlineFlightNo, toCity, startDate, endDate, statusFilter, minPrice, maxPrice, minGooglePrice, maxGooglePrice, externalFilter, beFilter, alertFilter, seatBooking, group, tab, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedFlights = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  function clearFilters() { setAirlineFlightNo(""); setToCity(""); setStartDate(""); setEndDate(""); setStatusFilter("all"); setMinPrice(""); setMaxPrice(""); setMinGooglePrice(""); setMaxGooglePrice(""); setExternalFilter("all"); setBeFilter("all"); setAlertFilter("all"); setSeatBooking(""); setGroup(""); setTab("all"); setPage(1); setSelectedIds(new Set()); }
  function toggleSelect(id: number) { setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleSelectAll() { setSelectedIds(prev => { const next = new Set(prev); const all = paginatedFlights.every(f => next.has(f.id)); paginatedFlights.forEach(f => all ? next.delete(f.id) : next.add(f.id)); return next; }); }
  function handleSort(key: string) { setSortKey(key); setSortDir(sortKey === key ? -sortDir : 1); }
  return { airlineFlightNo, setAirlineFlightNo, toCity, setToCity, startDate, setStartDate, endDate, setEndDate, statusFilter, setStatusFilter, minPrice, setMinPrice, maxPrice, setMaxPrice, minGooglePrice, setMinGooglePrice, maxGooglePrice, setMaxGooglePrice, externalFilter, setExternalFilter, beFilter, setBeFilter, alertFilter, setAlertFilter, seatBooking, setSeatBooking, group, setGroup, tab, setTab, visibleCols, setVisibleCols, sortKey, sortDir, handleSort, page: currentPage, setPage, perPage, setPerPage, totalPages, filtered, paginatedFlights, clearFilters, selectedIds, setSelectedIds, toggleSelect, toggleSelectAll, colVisible: (key: string) => visibleCols[key] };
}