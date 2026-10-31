import { useMemo, useState } from "react";
import { demoBookings, demoTransactions } from "../portal-mybookings/_services";

export type Booking = typeof demoBookings[number];
export const statusNames: Record<string, string> = { all: "Të gjitha", ticketed: "Ticketed", confirmed: "Konfirmuar", draft: "Dërguar", cancelled: "Anuluar", unpaid: "Të papaguara" };
export const money = (n: number) => `€${Math.round(n).toLocaleString("de-DE")}`;
export const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
export const city: Record<string,string> = { TIA:"Tiranë", PRN:"Prishtinë", BLQ:"Bologna", MXP:"Milano Malpensa", BGY:"Bergamo", DTM:"Dortmund", LTN:"London Luton" };
export function usePortal() {
 const [search,setSearch] = useState("");
 const [status,setStatus] = useState("all");
 const [sort,setSort] = useState("date");
 const [tab,setTab] = useState("bookings");
 const [selected,setSelected] = useState<Booking|null>(null);
 const [report,setReport] = useState(false);
 const [reportType,setReportType] = useState("full");
 const [from,setFrom] = useState("");
 const [to,setTo] = useState("");
 const [notice,setNotice] = useState("");
 const active = demoBookings.filter(b=>b.status!=="cancelled");
 const stats = {total:active.reduce((s,b)=>s+b.totalAmount,0),paid:active.reduce((s,b)=>s+b.paidAmount,0),due:active.reduce((s,b)=>s+b.dueAmount,0)};
 const attention = active.filter(b=>b.dueAmount>0);
 const filtered = useMemo(()=>demoBookings.filter(b=>(status==="all" || (status==="unpaid"? b.dueAmount>0&&b.status!=="cancelled":b.status===status)) && [b.customerName,b.bookingRef,b.pnr,b.fromCity,b.toCity,b.flightNumber,city[b.fromCity],city[b.toCity]].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="amount"?b.totalAmount-a.totalAmount:sort==="due"?b.dueAmount-a.dueAmount:a.departureDate.localeCompare(b.departureDate)),[search,status,sort]);
 const transactions = demoTransactions.filter(t=>[t.customerName,t.bookingRef,t.route,t.reference].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="amount"?b.amount-a.amount:a.createdAt.localeCompare(b.createdAt));
 const reportRows = active.filter(b=>(reportType==="full"||b.dueAmount>0)&&(!from||b.createdAt.slice(0,10)>=from)&&(!to||b.createdAt.slice(0,10)<=to));
 const openReports = () => {setReport(true);setNotice("");};
 const reset = () => {setSearch("");setStatus("all");};
 return {search,setSearch,status,setStatus,sort,setSort,tab,setTab,selected,setSelected,report,setReport,reportType,setReportType,from,setFrom,to,setTo,notice,setNotice,stats,attention,filtered,transactions,reportRows,openReports,reset};
}
export type Portal = ReturnType<typeof usePortal>;
