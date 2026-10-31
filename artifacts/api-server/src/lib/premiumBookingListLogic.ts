import { QueryPremiumBookingsBody } from "@workspace/api-zod";

export type PremiumQuery = ReturnType<typeof QueryPremiumBookingsBody.parse>;
export const PREMIUM_PAGE_SIZE = 50;
// A read-index snapshot is immutable and replaced on writes. Retain only
// derived calendar dates, never query results or financial summaries.
const snapshotDays = new WeakMap<object, Map<string, Map<string, string>>>();

// These read-only rules intentionally match the former Premium browser pipeline,
// including global-search/chip precedence, cancelled rows, and mixed-type sorting.
// Do not replace them with simplified status/date filters.
export function premiumPnrs(b: any): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of b.passengers || []) {
    if (p.cancelled) continue;
    const v = p.pnr || p.groupPnr;
    if (v && !seen.has(String(v))) { seen.add(String(v)); out.push(String(v)); }
  }
  return out.length === 0 && b.pnr ? [String(b.pnr)] : out;
}

export function premiumEmailState(b: any): "with" | "without" | null {
  if (b.ticketSearchExcluded) return null;
  const partial = String(b.ticketSearchNote || "").match(/Emaili më i fundit:\s*(\d+)\s+bilet(?:ë|a)\s+ekzistuese,\s*(\d+)\s+pa email/i);
  if (partial && Number(partial[2]) > 0) return "without";
  if (String(b.airlineTicketUrl || "").split(",").filter(Boolean).length) return "with";
  if (b.status !== "ticketed" || !/wizz/i.test(String(b.flight?.airline || ""))) return null;
  return String(b.pnr || "").trim() ||
    (b.passengers || []).some((p: any) => !p.cancelled && (p.pnr || p.groupPnr)) ? "without" : null;
}

export function premiumSearch(b: any, raw: string): boolean {
  const query = raw.trim().toLowerCase();
  if (!query) return true;
  const fields = [b.bookingRef, b.pnr, b.customerName, b.customerEmail, b.customerPhone,
    b.agentName, b.source, b.notes, b.status];
  const f = b.flight;
  if (f) fields.push(f.flightNumber, f.airline, f.fromCity, f.toCity, f.fromAirport, f.toAirport);
  for (const p of b.passengers || []) fields.push(p.firstName, p.lastName, p.passportNumber, p.pnr, p.seatNumber, p.groupPnr);
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}

function dueEuro(value: any): number {
  const n = Number(value ?? 0);
  return !Number.isFinite(n) || n < 1 ? 0 : Math.round(n);
}

export function premiumListResult(all: readonly any[], q: PremiumQuery, isAdmin: boolean) {
  // Browser timezone/locale are explicit, preserving date-fns and localeCompare.
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: q.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const tirane = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" });
  let zones = snapshotDays.get(all);
  if (!zones) { zones = new Map(); snapshotDays.set(all, zones); }
  const datesFor = (zone: string) => {
    let dates = zones!.get(zone);
    if (!dates) {
      if (zones!.size >= 4) zones!.delete(zones!.keys().next().value!);
      dates = new Map(); zones!.set(zone, dates);
    }
    return dates;
  };
  const browserDays = datesFor(q.timeZone);
  const tiraneDays = datesFor("Europe/Tirane");
  const day = (iso: string, fmt = formatter) => {
    const cache = fmt === tirane ? tiraneDays : browserDays;
    const saved = cache.get(iso);
    if (saved !== undefined) return saved;
    const parts = fmt.formatToParts(new Date(iso));
    const value = ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
    cache.set(iso, value);
    return value;
  };
  const collator = new Intl.Collator(q.locale);
  const scope = q.loadAll ? all : all.filter(b => day(b.createdAt, tirane) >= q.todayISO);
  const statusCounts: Record<string, number> = { draft: 0, pending: 0, confirmed: 0, ticketed: 0, cancelled: 0 };
  const emailTicketCounts = { withEmail: 0, withoutEmail: 0 };
  let alertCount = 0, unsentTicketCount = 0, totalCount = 0;
  for (const b of scope) {
    if (statusCounts[b.status] !== undefined) statusCounts[b.status]++;
    const email = premiumEmailState(b);
    if (email === "with") emailTicketCounts.withEmail++;
    if (email === "without") emailTicketCounts.withoutEmail++;
    if (Number(b.emailAlertsCount) > 0) alertCount++;
    if (b.status === "ticketed" && b.ticketEmailPending === true) unsentTicketCount++;
    if (b.status !== "cancelled") totalCount++;
  }
  const hasText = !!(q.search.trim() || q.pnrSearch.trim() || q.flightSearch.trim());
  const textMatches = (b: any) => {
    if (q.search && !premiumSearch(b, q.search)) return false;
    if (q.pnrSearch && !premiumPnrs(b).some(p => p.toLowerCase().includes(q.pnrSearch.toLowerCase()))) return false;
    if (q.flightSearch) {
      const f = b.flight, term = q.flightSearch.toLowerCase().trim();
      if (!f) return false;
      const route = term.match(/^([a-zçë]{2,4})\s*[-–—>→\/]\s*([a-zçë]{2,4})$/);
      if (route) return !!(f.fromCity?.toLowerCase().includes(route[1]) && f.toCity?.toLowerCase().includes(route[2]));
      return [f.flightNumber, f.airline, f.fromCity, f.toCity].some(v => v?.toLowerCase().includes(term));
    }
    return true;
  };
  const globalChip = !!(q.emailTicketFilter || q.alertFilter || q.unsentTicketFilter);
  const paymentGlobal = !!(q.paymentFilter && !q.statusFilter);
  const filtered = scope.filter(b => {
    if (!textMatches(b)) return false;
    if (!globalChip) {
      if (paymentGlobal) {
        if (b.status === "cancelled" || (q.agentFilter.length && !q.agentFilter.includes(String(b.agentId)))) return false;
      } else if (!hasText) {
        if (q.statusFilter && b.status !== q.statusFilter) return false;
        if (q.agentFilter.length && !q.agentFilter.includes(String(b.agentId))) return false;
        if (q.dateFrom || q.dateTo) {
          if (!b.createdAt) return false;
          const created = day(b.createdAt);
          if ((q.dateFrom && created < q.dateFrom) || (q.dateTo && created > q.dateTo)) return false;
        }
      }
    }
    if (q.emailTicketFilter && premiumEmailState(b) !== q.emailTicketFilter) return false;
    if (q.alertFilter && (q.alertFilter === "with" ? !(Number(b.emailAlertsCount) > 0) : Number(b.emailAlertsCount) > 0)) return false;
    if (q.unsentTicketFilter && !(b.status === "ticketed" && b.ticketEmailPending === true)) return false;
    if (q.paymentFilter) {
      const paid = Number(b.paidAmount ?? 0), due = dueEuro(b.dueAmount);
      if (q.paymentFilter === "paid" ? !(paid > 0 && due <= 0)
        : q.paymentFilter === "partial" ? !(paid > 0 && due > 0) : !(paid <= 0)) return false;
    }
    const departure = b.flight?.departureDate;
    if ((q.flightDateFrom || q.flightDateTo) &&
      (!departure || (q.flightDateFrom && departure < q.flightDateFrom) || (q.flightDateTo && departure > q.flightDateTo))) return false;
    return true;
  });
  const stats = { periodCount: 0, periodSales: 0, periodProfit: 0, periodPax: 0 };
  let filteredUnpaid = 0, filteredCount = 0;
  for (const b of filtered) {
    if (b.status === "cancelled") continue;
    filteredCount++;
    if (!isAdmin && b.hiddenFromReports) continue;
    stats.periodCount++;
    stats.periodSales += Number(b.totalAmount ?? 0);
    stats.periodProfit += Number(b.commissionAmount ?? 0);
    stats.periodPax += (b.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length;
    filteredUnpaid += dueEuro(b.dueAmount);
  }
  const val = (b: any): string | number => {
    switch (q.sortBy) {
      case "date": return b.createdAt || "";
      case "ref": return b.bookingRef || "";
      case "pnr": return premiumPnrs(b).join(" / ");
      case "klienti": {
        const px = (b.passengers || []).find((p: any) => p.type !== "infant") || b.passengers?.[0];
        return ((px ? `${px.firstName} ${px.lastName}`.trim() : b.customerName) || "").toLocaleLowerCase(q.locale);
      }
      case "agjencia": return (b.agentName || "").toLocaleLowerCase(q.locale);
      case "fluturimi": return b.flight ? `${b.flight.fromCity ?? ""} ${b.flight.toCity ?? ""}` : "";
      case "flightDate": return b.flight?.departureDate ?? "";
      case "flightTime": return b.flight?.departureTime ?? "";
      case "pax": return (b.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length;
      case "financa": return Number(b.totalAmount ?? 0);
      case "neto": return Number(b.netPrice ?? 0) > 0 ? Number(b.netPrice) : "";
      case "commission": return Number(b.commissionAmount ?? 0);
      case "paid": return Number(b.paidAmount ?? 0);
      case "due": return dueEuro(b.dueAmount);
      case "credit": return Number(b.creditAmount ?? 0);
      case "statusi": return ({ draft: 0, pending: 1, confirmed: 2, ticketed: 3, cancelled: 4 } as Record<string, number>)[b.status] ?? 99;
      default: return "";
    }
  };
  if (q.sortBy) {
    const dir = q.sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = val(a), bv = val(b);
      const ea = av === "" || av == null, eb = bv === "" || bv == null;
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return collator.compare(String(av), String(bv)) * dir;
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / PREMIUM_PAGE_SIZE));
  const page = Math.min(q.page, totalPages);
  return {
    ids: (q.exportAll ? filtered : filtered.slice((page - 1) * PREMIUM_PAGE_SIZE, page * PREMIUM_PAGE_SIZE)).map(b => b.id as number),
    page, totalPages, matchingCount: filtered.length, totalCount, filteredCount,
    statusCounts, emailTicketCounts, alertCount, unsentTicketCount, stats, filteredUnpaid,
  };
}