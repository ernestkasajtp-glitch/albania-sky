import { Mail, Ticket } from "lucide-react";

export function TicketEmailPendingBadge({ size = "sm" }: { size?: "xs" | "sm" }) {
  const cls = size === "xs" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  const icon = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-red-100 text-red-700 ring-1 ring-red-300 font-bold leading-none ${cls}`}
      title="Bileta është lëshuar, por emaili nuk i është dërguar agjentit"
    >
      <Mail className={icon} />
      Pa dërguar
    </span>
  );
}

/**
 * Badge që tregon statusin e biletave (PDF nga emaili i Wizzair) për rezervimin:
 *  - ROZË  n/n — të gjitha biletat u gjetën dhe u ruajtën.
 *  - PORTOKALLI x/n — email-i më i fundit ka vetëm disa nga pasagjerët;
 *    pjesa tjetër është "Pa email".
 *  - GRI   0/N — rezervim Wizz i statusit "ticketed" me PNR, por bileta ende
 *    s'është gjetur nga emaili (N = numri i PNR-ve të pritur).
 */

const PNR_TOKEN_RE = /\b[A-Z0-9]{6}\b/g;

function countExpectedPnrs(b: any): number {
  const set = new Set<string>();
  const txt = String(b?.pnr || "").toUpperCase();
  for (const m of txt.match(PNR_TOKEN_RE) || []) {
    if (/[A-Z]/.test(m)) set.add(m);
  }
  for (const p of b?.passengers || []) {
    if (p?.cancelled) continue;
    const v = String(p?.pnr || p?.groupPnr || "").trim().toUpperCase();
    if (/^[A-Z0-9]{5,8}$/.test(v) && /[A-Z]/.test(v)) set.add(v);
  }
  return Math.max(set.size, 1);
}

/**
 * Gjendja e biletës-nga-emaili për një rezervim (e njëjta logjikë si badge-i):
 *  - "with"    → bileta u gjet nga emaili (badge rozë)
 *  - "without" → Wizz ticketed me PNR, pa biletë ende (badge gri 0/N)
 *  - null      → jashtë skemës (i përjashtuar, jo-Wizz, pa PNR, jo-ticketed)
 */
export function ticketEmailState(b: any): "with" | "without" | null {
  if (b?.ticketSearchExcluded) return null;
  const partial = parsePartialCounts(b?.ticketSearchNote);
  if (partial && partial.missing > 0) return "without";
  const urls = String(b?.airlineTicketUrl || "").split(",").filter(Boolean);
  if (urls.length > 0) return "with";
  if (b?.status !== "ticketed") return null;
  if (!/wizz/i.test(String(b?.flight?.airline || ""))) return null;
  const hasAnyPnr =
    !!String(b?.pnr || "").trim() ||
    (b?.passengers || []).some((p: any) => !p?.cancelled && (p?.pnr || p?.groupPnr));
  if (!hasAnyPnr) return null;
  return "without";
}

function parsePartialCounts(note: unknown): { found: number; missing: number } | null {
  const m = String(note || "").match(/Emaili më i fundit:\s*(\d+)\s+bilet(?:ë|a)\s+ekzistuese,\s*(\d+)\s+pa email/i);
  return m ? { found: Number(m[1]), missing: Number(m[2]) } : null;
}

export function TicketFoundBadge({ booking, size = "sm" }: { booking: any; size?: "xs" | "sm" }) {
  const cls = size === "xs" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  const icon = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";

  const state = ticketEmailState(booking);
  if (!state) return null;

  const partial = parsePartialCounts(booking?.ticketSearchNote);
  if (partial && partial.missing > 0) {
    const total = partial.found + partial.missing;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-700 ring-1 ring-amber-200 font-bold leading-none ${cls}`}
        title={`${partial.found} ${partial.found === 1 ? "biletë ekzistuese" : "bileta ekzistuese"}, ${partial.missing} pa email`}
      >
        <Ticket className={icon} />
        {partial.found}/{total}
      </span>
    );
  }

  if (state === "with") {
    const n = String(booking?.airlineTicketUrl || "").split(",").filter(Boolean).length;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-pink-100 text-pink-700 ring-1 ring-pink-200 font-bold leading-none ${cls}`}
        title={n > 1 ? `${n} bileta të gjetura nga emaili` : "Bileta u gjet nga emaili"}
      >
        <Ticket className={icon} />
        {n}/{n}
      </span>
    );
  }

  const total = countExpectedPnrs(booking);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-500 ring-1 ring-slate-200 font-bold leading-none ${cls}`}
      title="Bileta s'është gjetur ende nga emaili"
    >
      <Ticket className={icon} />
      0/{total}
    </span>
  );
}
