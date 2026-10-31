import { useState, useEffect, useMemo, useRef } from "react";
import { fmtM, fmtAmPm, roundWholeEuro } from "@/lib/utils";
import { useRoute, useLocation, Link } from "wouter";
import { api } from "@/lib/api";
import { bookingCreateErrorMessage } from "@/lib/bookingError";
import { isLettersOnly } from "@/lib/nameValidation";
import { useAuth } from "@/context/AuthContext";
import { Plane, Plus, Trash2, ArrowRight, Loader2, AlertCircle, Download, CreditCard, Luggage } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const AIRLINE_BRANDS: { match: string[]; from: string; to: string }[] = [
  { match: ["w4", "wizz"],        from: "#C6007E", to: "#E8007B" },
  { match: ["fr", "ryanair"],     from: "#073590", to: "#0350C8" },
  { match: ["u2", "easyjet"],     from: "#FF6600", to: "#FF8800" },
  { match: ["lh", "lufthansa"],   from: "#05164D", to: "#1D3A8A" },
  { match: ["tk", "turkish"],     from: "#C70A0C", to: "#E51213" },
  { match: ["ba", "british"],     from: "#075AAA", to: "#084E93" },
  { match: ["af", "air france"],  from: "#002157", to: "#0039A6" },
  { match: ["vy", "vueling"],     from: "#E6B800", to: "#C9A800" },
  { match: ["a3", "aegean"],      from: "#005DA4", to: "#0072C6" },
];

function getAirlineBrand(airline: string, flightNumber: string) {
  const key = (airline + " " + flightNumber).toLowerCase();
  const brand = AIRLINE_BRANDS.find(b => b.match.some(m => key.includes(m)));
  return brand
    ? `linear-gradient(135deg, ${brand.from}, ${brand.to})`
    : "linear-gradient(135deg, #0b1f3a, #1a3a6b)";
}

interface Passenger {
  type: "adult" | "child" | "infant";
  firstName: string;
  lastName: string;
  gender: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  baggageOption: string;
  hasSeatSelection: boolean;
  hasPriorityBoarding: boolean;
  hasInsurance: boolean;
}

const emptyPassenger = (): Passenger => ({
  type: "adult",
  firstName: "",
  lastName: "",
  gender: "",
  passportNumber: "",
  nationality: "",
  dateOfBirth: "",
  baggageOption: "",
  hasSeatSelection: false,
  hasPriorityBoarding: false,
  hasInsurance: false,
});

export default function BookFlight({ airline = false }: { airline?: boolean }) {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/flights/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const flightId = params?.id ? parseInt(params.id) : 0;

  const [flight, setFlight] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"confirm" | "pay" | null>(null);
  const actionRef = useRef<"confirm" | "pay">("confirm");
  const [success, setSuccess] = useState<any>(null);

  const [customerEmail, setCustomerEmail] = useState(user?.email || "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Pre-fill passengers from URL params (adults/children/infants)
  const [passengers, setPassengers] = useState<Passenger[]>(() => {
    const sp = new URLSearchParams(window.location.search);
    const a = Math.max(1, parseInt(sp.get("adults") || "1") || 1);
    const c = Math.max(0, parseInt(sp.get("children") || "0") || 0);
    const i = Math.max(0, parseInt(sp.get("infants") || "0") || 0);
    const list: Passenger[] = [];
    for (let x = 0; x < a; x++) list.push({ ...emptyPassenger(), type: "adult" });
    for (let x = 0; x < c; x++) list.push({ ...emptyPassenger(), type: "child" });
    for (let x = 0; x < i; x++) list.push({ ...emptyPassenger(), type: "infant" });
    return list;
  });
  // The booking customer is the first passenger, not the agency account holder.
  // Derive it rather than storing a second name that could go stale after edits or login.
  const customerName = [
    passengers[0]?.firstName?.trim(),
    passengers[0]?.lastName?.trim(),
  ].filter(Boolean).join(" ");

  useEffect(() => {
    api.getFlight(flightId)
      .then(setFlight)
      .catch(() => setError(t("Fluturimi nuk u gjet ose nuk është më i disponueshëm.")))
      .finally(() => setLoading(false));
  }, [flightId]);

  useEffect(() => {
    if (user) {
      setCustomerEmail(prev => prev || user.email);
    }
  }, [user]);

  // Restore form draft saved before login redirect
  useEffect(() => {
    if (!flightId) return;
    const raw = localStorage.getItem("bookflight_draft");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (String(draft.flightId) === String(flightId)) {
        if (draft.passengers?.length) setPassengers(draft.passengers);
        if (draft.customerEmail) setCustomerEmail(draft.customerEmail);
        if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
        if (draft.notes) setNotes(draft.notes);
        localStorage.removeItem("bookflight_draft");
      }
    } catch {
      localStorage.removeItem("bookflight_draft");
    }
  }, [flightId]);

  const totals = useMemo(() => {
    const ticketGroups = {
      adult: { count: 0, amount: 0 },
      child: { count: 0, amount: 0 },
      infant: { count: 0, amount: 0 },
    };
    if (!flight) return { ticketGroups, ticket: 0, baseTicket: 0, tax: 0, extras: 0, savings: 0, total: 0, effAdult: 0, baseAdult: 0, flightSavings: 0, fd: null as null | { type: string; value: number } };
    // The server already folds the agent's discount AND markup into agentXPrice (per unit),
    // for BOTH rule and flat pricing. So price shown == price charged: just sum agentXPrice.
    let ticket = 0, baseTicket = 0, extras = 0, flightSavings = 0;
    const rawFd = (flight as any).flightDiscount;
    const fd = rawFd && (rawFd.type === "percent" || rawFd.type === "fixed") && Number(rawFd.value) > 0
      && typeof (flight as any).preDiscountAdultPrice === "number" ? rawFd as { type: string; value: number } : null;
    for (const p of passengers) {
      // New booking amounts are deliberately normalized at the client boundary.
      // The API remains the source of truth, while every unit sent/calculated here
      // follows the confirmed whole-euro policy.
      const eff = roundWholeEuro(p.type === "adult" ? (flight.agentAdultPrice ?? flight.adultPrice)
        : p.type === "child" ? (flight.agentChildPrice ?? flight.childPrice)
        : (flight.agentInfantPrice ?? flight.infantPrice));
      const base = roundWholeEuro(p.type === "adult" ? flight.adultPrice
        : p.type === "child" ? flight.childPrice
        : flight.infantPrice);
      ticket += eff;
      ticketGroups[p.type].count += 1;
      ticketGroups[p.type].amount += eff;
      baseTicket += base;
      if (fd) {
        const pre = p.type === "adult" ? flight.preDiscountAdultPrice
          : p.type === "child" ? flight.preDiscountChildPrice : flight.preDiscountInfantPrice;
        if (typeof pre === "number") flightSavings += Math.max(0, roundWholeEuro(pre) - eff);
      }
      if (p.baggageOption === "checked") extras += roundWholeEuro(flight.checkedBaggagePrice);
      if (p.hasSeatSelection) extras += roundWholeEuro(flight.seatSelectionPrice);
      if (p.hasPriorityBoarding) extras += roundWholeEuro(flight.priorityBoardingPrice);
      if (p.hasInsurance) extras += roundWholeEuro(flight.insurancePrice);
    }
    const tax = roundWholeEuro(flight.tax) * passengers.length;
    const savings = Math.max(0, baseTicket - ticket);
    const total = ticket + tax + extras;
    return {
      ticketGroups, ticket, baseTicket, tax, extras, savings, total,
      effAdult: roundWholeEuro(flight.agentAdultPrice ?? flight.adultPrice),
      // With a flight discount the "old" price is the agency final BEFORE discount, not raw base.
      baseAdult: roundWholeEuro(fd ? (flight as any).preDiscountAdultPrice : flight.adultPrice),
      flightSavings, fd,
    };
  }, [flight, passengers]);

  const updatePassenger = (i: number, field: keyof Passenger, value: any) => {
    setPassengers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  // Save the current form as a draft and send the user through login. Used both
  // when they aren't logged in yet AND when their session silently expired while
  // the page stayed open (a 401 on submit). On return, the draft is restored and
  // they can finish without re-typing — no dead-end "Authentication required".
  const saveDraftAndGoToLogin = () => {
    localStorage.setItem("bookflight_draft", JSON.stringify({
      flightId,
      passengers,
      customerEmail,
      customerPhone,
      notes,
    }));
    localStorage.setItem("bookflight_redirect", "/flights/" + flightId);
    setLocation("/login?redirect=/flights/" + flightId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      saveDraftAndGoToLogin();
      return;
    }
    const badName = passengers.find(p => !isLettersOnly(p.firstName) || !isLettersOnly(p.lastName));
    if (badName) {
      setError(t("Emri dhe mbiemri duhet të përmbajnë vetëm shkronjat A–Z (pa ë/ç ose shkronja të tjera) ({{name}}).", { name: badName.firstName || t("pasagjeri") }));
      return;
    }
    if (!isLettersOnly(customerName)) {
      setError(t("Emri i klientit duhet të përmbajë vetëm shkronjat A–Z (pa ë/ç ose shkronja të tjera)."));
      return;
    }
    const missingGender = passengers.find(p => p.gender !== "M" && p.gender !== "F");
    if (missingGender) {
      setError(t("Gjinia (M/F) është e detyrueshme për të gjithë pasagjerët ({{name}}).", { name: missingGender.firstName || t("pasagjeri") }));
      return;
    }
    const missingDob = passengers.find(p => (p.type === "child" || p.type === "infant") && !p.dateOfBirth);
    if (missingDob) {
      setError(t("Datëlindja është e detyrueshme për të gjithë fëmijët dhe foshnjat ({{name}}).", { name: missingDob.firstName || t("pasagjeri") }));
      return;
    }
    // Validim moshe në datën e fluturimit: foshnjë <2 vjeç, fëmijë 2–11 vjeç, pa datë të ardhme.
    for (const p of passengers) {
      if ((p.type !== "child" && p.type !== "infant") || !p.dateOfBirth) continue;
      const b = new Date(p.dateOfBirth + "T00:00:00");
      if (isNaN(b.getTime())) continue;
      const nm = p.firstName || t("pasagjeri");
      if (b.getTime() > Date.now()) {
        setError(t("Datëlindja s'mund të jetë në të ardhmen ({{name}}).", { name: nm }));
        return;
      }
      const ref = new Date((flight?.departureDate || new Date().toISOString().slice(0, 10)) + "T00:00:00");
      let age = ref.getFullYear() - b.getFullYear();
      const mo = ref.getMonth() - b.getMonth();
      if (mo < 0 || (mo === 0 && ref.getDate() < b.getDate())) age--;
      if (p.type === "infant" && age >= 2) {
        setError(t("Foshnja duhet të jetë nën 2 vjeç në datën e fluturimit ({{name}}).", { name: nm }));
        return;
      }
      if (p.type === "child" && (age < 2 || age > 11)) {
        setError(t("Fëmija duhet të jetë 2–11 vjeç në datën e fluturimit ({{name}}).", { name: nm }));
        return;
      }
    }
    const action = actionRef.current;
    setSubmitting(true);
    setSubmitAction(action);
    setError("");

    // 1) Create the booking. If this fails, nothing was created — safe to retry.
    let created: any = null;
    try {
      created = await api.createBooking({
        flightId,
        customerName,
        customerEmail,
        customerPhone,
        notes,
        // Do not transmit client-calculated money fields: the API recalculates
        // authoritative prices. Passenger selections remain the contract payload.
        passengers,
      });
    } catch (err: any) {
      // Session expired while the page stayed open: the in-memory `user` is
      // stale but the server cookie is gone, so the booking call comes back 401.
      // Instead of showing a dead-end "Authentication required" error, save the
      // draft and route through login so they re-authenticate and continue.
      if (err?.status === 401) {
        saveDraftAndGoToLogin();
        return;
      }
      setError(bookingCreateErrorMessage(err));
      setSubmitting(false);
      setSubmitAction(null);
      return;
    }

    // 2) "Pay and Book": booking already exists, now open card payment.
    if (action === "pay") {
      try {
        const data = await api.initPokPayment(created.bookingRef);
        if (data?.confirmUrl) {
          // Keep the buttons disabled while the browser navigates to POK.
          window.location.href = data.confirmUrl;
          return;
        }
      } catch {
        // Fall through: the booking is saved, only opening payment failed.
      }
      // Booking exists but payment couldn't be opened — show the success screen
      // so the user pays later from "Rezervimet e Mia" instead of resubmitting
      // (which would create a duplicate booking).
      setSuccess(created);
      setError(t("Rezervimi u krijua, por pagesa me kartë nuk u hap dot. Mund ta paguani te “Rezervimet e Mia”."));
      setSubmitting(false);
      setSubmitAction(null);
      return;
    }

    // 3) "Konfirmo": no payment, just confirm.
    setSuccess(created);
    setSubmitting(false);
    setSubmitAction(null);
  };

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
        <Plane className="absolute inset-0 m-auto h-5 w-5 text-blue-600" />
      </div>
      <p className="text-gray-400 text-sm">{t("Duke ngarkuar fluturimin...")}</p>
    </div>
  );
  if (error && !flight) return (
    <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-600 font-medium text-lg">{error}</p>
      </div>
    </div>
  );

  const printTicket = () => {
    if (!flight || !success) return;
    const typeLabel = (t: string) => t === "adult" ? "I Rritur" : t === "child" ? "Fëmijë" : "Foshnjë";
    const statusLabel = success.status === "confirmed" ? t("Konfirmuar") : success.status === "pending" ? t("Në Pritje") : success.status === "ticketed" ? t("Biletuar") : success.status === "cancelled" ? t("Anuluar") : success.status;
    const statusColor = success.status === "confirmed" ? "#16a34a" : "#ca8a04";
    const generatedNow = new Date();
    const generatedAt = generatedNow.toLocaleDateString(i18n.language === "en" ? "en-GB" : "sq-AL", { day: "2-digit", month: "long", year: "numeric" }) +
      ", " + generatedNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    const passRows = passengers.map((p, i) => `
      <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
        <td style="padding:8px 12px;font-weight:600">${p.firstName} ${p.lastName}</td>
        <td style="padding:8px 12px"><span style="background:#dbeafe;color:#1d4ed8;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600">${t(typeLabel(p.type))}</span></td>
        <td style="padding:8px 12px;font-family:monospace;color:#6b7280">${p.passportNumber || "—"}</td>
        <td style="padding:8px 12px;color:#6b7280">${p.nationality || "—"}</td>
        <td style="padding:8px 12px;color:#6b7280">${p.dateOfBirth || "—"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="${i18n.language === "en" ? "en" : "sq"}">
<head>
  <meta charset="UTF-8"/>
  <title>${t("Biletë Fluturimi")} – ${success.bookingRef}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
    .ticket { max-width: 720px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
    .header { background: #2563eb; color: #fff; padding: 28px 36px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
    .ref-label { font-size: 11px; color: #bfdbfe; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .ref { font-size: 26px; font-family: monospace; font-weight: 700; }
    .route { background: #eff6ff; border-bottom: 1px solid #bfdbfe; padding: 24px 36px; display: flex; align-items: center; gap: 0; }
    .city { text-align: center; }
    .city .code { font-size: 36px; font-weight: 800; color: #1e293b; }
    .city .time { font-size: 14px; color: #6b7280; margin-top: 4px; }
    .arrow-line { flex: 1; display: flex; align-items: center; gap: 6px; padding: 0 16px; }
    .dash { flex: 1; border-top: 2px dashed #93c5fd; }
    .plane-icon { font-size: 20px; color: #2563eb; }
    .meta { display: flex; justify-content: center; gap: 24px; margin-top: 12px; font-size: 13px; color: #64748b; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-weight: 600; background: ${success.status === "confirmed" ? "#dcfce7" : "#fef9c3"}; color: ${statusColor}; }
    .divider { border: none; border-top: 2px dashed #e2e8f0; margin: 0 24px; }
    .section { padding: 20px 36px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 12px; }
    .contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 13px; color: #374151; }
    .contact-item { display: flex; align-items: center; gap: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 600; }
    td { border-top: 1px solid #f1f5f9; }
    .price-box { background: #f8fafc; border-radius: 10px; padding: 16px; font-size: 14px; }
    .price-row { display: flex; justify-content: space-between; color: #64748b; margin-bottom: 8px; }
    .price-total { display: flex; justify-content: space-between; font-weight: 800; font-size: 17px; color: #1e293b; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 6px; }
    .total-amount { color: #2563eb; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 36px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    @media print {
      body { background: #fff; }
      .ticket { margin: 0; box-shadow: none; border-radius: 0; max-width: 100%; }
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="logo">✈ Albania Sky</div>
      <div>
        <div class="ref-label">${t("Referenca e Rezervimit")}</div>
        <div class="ref">${success.bookingRef}</div>
      </div>
    </div>

    <div class="route">
      <div class="city">
        <div class="code">${flight.fromCity}</div>
        <div class="time">${fmtAmPm(flight.departureTime)}</div>
      </div>
      <div class="arrow-line">
        <div class="dash"></div>
        <div class="plane-icon">✈</div>
        <div class="dash"></div>
      </div>
      <div class="city">
        <div class="code">${flight.toCity}</div>
        <div class="time">${fmtAmPm(flight.arrivalTime)}</div>
      </div>
    </div>
    <div class="meta" style="padding:10px 0 16px">
      <span>📅 ${flight.departureDate}</span>
      <span>✈ ${flight.airline} · ${flight.flightNumber}</span>
      <span>${t("Statusi:")} <span class="status-badge">${statusLabel}</span></span>
    </div>

    <hr class="divider"/>

    <div class="section">
      <div class="section-title">${t("Kontakti")}</div>
      <div class="contact-grid">
        <div class="contact-item">👤 <strong>${customerName}</strong></div>
        ${customerEmail ? `<div class="contact-item">✉ ${customerEmail}</div>` : ""}
        ${customerPhone ? `<div class="contact-item">📞 ${customerPhone}</div>` : ""}
      </div>
    </div>

    <hr class="divider"/>

    <div class="section">
      <div class="section-title">${t("Pasagjerët")} (${passengers.length})</div>
      <table>
        <thead>
          <tr>
            <th>${t("Emri")}</th><th>${t("Lloji")}</th><th>${t("Pasaporta")}</th><th>${t("Kombësia")}</th><th>${t("Datëlindja")}</th>
          </tr>
        </thead>
        <tbody>${passRows}</tbody>
      </table>
    </div>

    <hr class="divider"/>

    <div class="section">
      <div class="section-title">${t("Çmimi")}</div>
      <div class="price-box">
        <div class="price-row"><span>${t("Bileta")} × ${passengers.length}</span><span>€${fmtM(totals.ticket)}</span></div>
        ${totals.tax > 0 ? `<div class="price-row"><span>${t("Taksa & Tarifa")}</span><span>€${fmtM(totals.tax)}</span></div>` : ""}
        ${totals.extras > 0 ? `<div class="price-row"><span>${t("Shërbime Shtesë")}</span><span>€${fmtM(totals.extras)}</span></div>` : ""}
        ${totals.fd && totals.flightSavings > 0 ? `<div class="price-row" style="color:#047857;font-weight:600"><span>${t("Zbritje fluturimi")}</span><span>−€${fmtM(totals.flightSavings)}</span></div>` : (!totals.fd && totals.savings > 0 ? `<div class="price-row" style="color:#16a34a;font-weight:600"><span>${t("Kursim")}</span><span>−€${fmtM(totals.savings)}</span></div>` : "")}
        <div class="price-total"><span>${t("Gjithsej")}</span><span class="total-amount">€${fmtM(success.totalAmount)}</span></div>
      </div>
    </div>

    <div class="footer">
      <span>${t("Lëshuar:")} ${generatedAt}</span>
      <span>${success.bookingRef}</span>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  if (success) return (
    <div className={`${airline ? "air-portal air-confirm" : ""} max-w-2xl mx-auto px-4 py-12`}>
      {error && <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {/* Confirmation header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{t("Rezervimi u Konfirmua!")}</h2>
        <p className="text-gray-500 text-sm">{t("Referenca jote e rezervimit:")}</p>
        <div className="text-3xl font-mono font-bold text-blue-600 bg-blue-50 py-3 px-6 rounded-xl inline-block mt-2 mb-2">
          {success.bookingRef}
        </div>
        <p className="text-gray-400 text-xs">{t("Statusi:")} <strong className="capitalize text-gray-600">{success.status === "confirmed" ? t("Konfirmuar") : t("Në Pritje")}</strong></p>
      </div>

      {/* Mini flight summary */}
      <div className="text-white rounded-2xl p-5 mb-4" style={{ background: getAirlineBrand(flight?.airline ?? "", flight?.flightNumber ?? "") }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white/70 text-xs mb-1">{flight?.airline} · {flight?.flightNumber}</div>
            <div className="font-bold text-lg">{flight?.departureDate} · {fmtAmPm(flight?.departureTime)} → {fmtAmPm(flight?.arrivalTime)}</div>
          </div>
          <div className="flex items-center gap-3 text-xl font-bold">
            <span>{flight?.fromCity}</span>
            <ArrowRight className="h-5 w-5" />
            <span>{flight?.toCity}</span>
          </div>
          <div className="text-right">
            <div className="text-blue-200 text-xs">{t("Gjithsej")}</div>
            <div className="text-2xl font-bold">€{fmtM(success.totalAmount)}</div>
          </div>
        </div>
      </div>

      {/* Passengers summary */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("Pasagjerët")}</h3>
        <div className="space-y-2">
          {passengers.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
              <span className="font-medium text-gray-800">{p.firstName} {p.lastName}</span>
              <div className="flex items-center gap-3 text-gray-500">
                {p.passportNumber && <span className="font-mono text-xs">{p.passportNumber}</span>}
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {p.type === "adult" ? t("I Rritur") : p.type === "child" ? t("Fëmijë") : t("Foshnjë")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={printTicket}
          className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-xl transition-all shadow-md hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}
        >
          <Download className="h-4 w-4" />
          {t("Shkarko Biletën PDF")}
        </button>
        <button
          onClick={() => setLocation("/my-bookings")}
          className="flex-1 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
        >
          {t("Rezervimet e Mia")}
        </button>
        <button
          onClick={() => setLocation("/flights")}
          className="flex-1 border border-gray-200 text-gray-600 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
        >
          {t("Kërko Fluturime")}
        </button>
      </div>
    </div>
  );

  const flightSummary = (
      <div className={`${airline ? "air-itinerary" : ""} text-white rounded-2xl p-5 mb-6`} style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plane className="h-5 w-5" />
            <div>
              <div className="font-semibold">{flight?.airline} {flight?.flightNumber}</div>
              <div className="text-blue-100 text-sm">{airline && flight?.departureDate ? new Date(`${flight.departureDate}T12:00:00`).toLocaleDateString(i18n.language === "en" ? "en-GB" : "sq-AL", { day: "numeric", month: "long", year: "numeric" }) : flight?.departureDate} {t("në")} {fmtAmPm(flight?.departureTime)}{airline && <> → {fmtAmPm(flight?.arrivalTime)}</>}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-lg font-bold">
            <span>{flight?.fromCity}</span>
            <ArrowRight className="h-4 w-4" />
            <span>{flight?.toCity}</span>
          </div>
          <div className="text-right">
            {(totals.fd ? totals.baseAdult > totals.effAdult : totals.savings > 0) && (
              <div className="text-blue-200 text-xs line-through">€{fmtM(totals.baseAdult)}</div>
            )}
            {totals.fd && (
              <div className="inline-block text-[10px] font-bold bg-emerald-500 text-white rounded-full px-2 py-0.5 mb-0.5">
                {t("Zbritje fluturimi")} {totals.fd.type === "percent" ? `−${totals.fd.value}%` : `−€${fmtM(totals.fd.value)}`}
              </div>
            )}
            <div className="text-2xl font-bold">€{fmtM(totals.effAdult)}</div>
            <div className="text-blue-100 text-xs">{t("për person")}</div>
          </div>
        </div>
      </div>
  );

  return (
    <div className={`${airline ? "air-portal air-booking" : ""} max-w-5xl mx-auto px-4 py-8`}>
      {!airline && flightSummary}
      <form onSubmit={handleSubmit} className="grid md:grid-cols-3 gap-6">
        <div className={`${airline ? "air-passengers" : ""} md:col-span-2 space-y-6`}>
          {/* Passengers */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t("Pasagjerët")}</h2>
              <button
                type="button"
                onClick={() => setPassengers(prev => [...prev, emptyPassenger()])}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-4 w-4" /> {t("Shto Pasagjer")}
              </button>
            </div>
            <div className="space-y-4">
              {passengers.map((p, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">{t("Pasagjeri")} {i + 1}</span>
                    {i > 0 && (
                      <button type="button" onClick={() => setPassengers(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Lloji")}</label>
                      <select value={p.type} onChange={e => updatePassenger(i, "type", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="adult">{t("I Rritur")}</option>
                        <option value="child">{t("Fëmijë")}</option>
                        <option value="infant">{t("Foshnjë")}</option>
                      </select>
                    </div>
                    <div>
                      <label id={`gender-label-${i}`} className="block text-xs font-medium text-gray-500 mb-1">{t("Gjinia")} *</label>
                      {airline ? <div className="air-gender-options" role="radiogroup" aria-labelledby={`gender-label-${i}`} aria-required="true">
                        {(["M", "F"] as const).map(gender => <label key={gender} className={`air-gender-choice ${p.gender === gender ? "is-selected" : ""}`}>
                          <input type="radio" name={`passenger-gender-${i}`} value={gender} required checked={p.gender === gender} onChange={() => updatePassenger(i, "gender", gender)} />
                          <span>{gender === "M" ? t("Mashkull") : t("Femër")}</span>
                        </label>)}
                      </div> : <select required value={p.gender} onChange={e => updatePassenger(i, "gender", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">{t("Zgjidh")}</option>
                        <option value="M">{t("Mashkull")}</option>
                        <option value="F">{t("Femër")}</option>
                      </select>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Emri")} *</label>
                      <input required value={p.firstName} onChange={e => updatePassenger(i, "firstName", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Mbiemri")} *</label>
                      <input required value={p.lastName} onChange={e => updatePassenger(i, "lastName", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Nr. Pasaportës")}</label>
                      <input value={p.passportNumber} onChange={e => updatePassenger(i, "passportNumber", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{t("Kombësia")}</label>
                      <input value={p.nationality} onChange={e => updatePassenger(i, "nationality", e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {(p.type === "child" || p.type === "infant") && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t("Datëlindja")} <span className="text-red-500">*</span>
                      </label>
                      <input type="date" value={p.dateOfBirth} onChange={e => updatePassenger(i, "dateOfBirth", e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${!p.dateOfBirth ? "border-red-400" : "border-gray-200"}`} />
                    </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                    {flight?.checkedBaggagePrice && (
                      <label className={airline ? `air-baggage-option ${p.baggageOption === "checked" ? "is-selected" : ""}` : "flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"}>
                        <input type="checkbox" checked={p.baggageOption === "checked"} onChange={e => updatePassenger(i, "baggageOption", e.target.checked ? "checked" : "")} className="rounded" />
                        {airline && <Luggage aria-hidden="true" />}
                        <span>{t("Bagazh i Regjistruar")} (+€{fmtM(flight.checkedBaggagePrice)})</span>
                      </label>
                    )}
                    {flight?.seatSelectionPrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasSeatSelection} onChange={e => updatePassenger(i, "hasSeatSelection", e.target.checked)} className="rounded" />
                        {t("Zgjedhje Vendi")} (+€{fmtM(flight.seatSelectionPrice)})
                      </label>
                    )}
                    {!airline && flight?.priorityBoardingPrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasPriorityBoarding} onChange={e => updatePassenger(i, "hasPriorityBoarding", e.target.checked)} className="rounded" />
                        {t("Hipje me Përparësi")} (+€{fmtM(flight.priorityBoardingPrice)})
                      </label>
                    )}
                    {flight?.insurancePrice && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={p.hasInsurance} onChange={e => updatePassenger(i, "hasInsurance", e.target.checked)} className="rounded" />
                        {t("Sigurim")} (+€{fmtM(flight.insurancePrice)})
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          {airline && flightSummary}
          <div className={`${airline ? "air-fare-summary" : ""} bg-white border border-gray-200 rounded-2xl p-5 shadow-sm sticky top-4`}>
            <h2 className="font-semibold text-gray-900 mb-4">{t("Përmbledhja e Çmimit")}</h2>
            <div className="space-y-2 text-sm">
              {airline ? (["adult", "child", "infant"] as const).map(type => {
                const group = totals.ticketGroups[type];
                if (!group.count) return null;
                return <div key={type} className="flex justify-between gap-3 text-gray-600">
                  <span>{group.count} × {type === "adult" ? t("I Rritur") : type === "child" ? t("Fëmijë") : t("Foshnjë")}</span>
                  <span className="font-semibold tabular-nums">€{fmtM(group.amount)}</span>
                </div>;
              }) : <div className="flex justify-between text-gray-600">
                <span>{t("Bileta")} ×{passengers.length}</span>
                <span>€{fmtM(totals.ticket)}</span>
              </div>}
              {totals.tax > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Taksa & Tarifa")}</span>
                  <span>€{fmtM(totals.tax)}</span>
                </div>
              )}
              {totals.extras > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("Shërbime Shtesë")}</span>
                  <span>€{fmtM(totals.extras)}</span>
                </div>
              )}
              {totals.fd && totals.flightSavings > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>{t("Zbritje fluturimi")} ({totals.fd.type === "percent" ? `−${totals.fd.value}%` : `−€${fmtM(totals.fd.value)}`})</span>
                  <span>−€{fmtM(totals.flightSavings)}</span>
                </div>
              )}
              {!totals.fd && totals.savings > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>{t("Kursim")}</span>
                  <span>−€{fmtM(totals.savings)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900 text-base">
                <span>{t("Gjithsej")}</span>
                <span className="text-blue-600">€{fmtM(totals.total)}</span>
              </div>
            </div>
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {!user ? (
              <Link
                href={`/login?redirect=/flights/${flightId}`}
                onClick={() => {
                  localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes }));
                  localStorage.setItem("bookflight_redirect", "/flights/" + flightId);
                }}
                className="w-full mt-4 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}
              >
                {t("Hyr për të Rezervuar")}
              </Link>
            ) : (
              <div className="mt-4 space-y-2.5">
                <button
                  type="submit"
                  onClick={() => { actionRef.current = "confirm"; }}
                  disabled={submitting}
                  className="w-full disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #0b1f3a, #1a3a6b)" }}
                >
                  {submitting && submitAction === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting && submitAction === "confirm" ? t("Duke procesuar...") : t("Konfirmo Rezervimin")}
                </button>
                <button
                  type="submit"
                  onClick={() => { actionRef.current = "pay"; }}
                  disabled={submitting}
                  className="w-full disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
                >
                  {submitting && submitAction === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {submitting && submitAction === "pay" ? t("Duke procesuar...") : "Pay and Book"}
                </button>
              </div>
            )}
            {!user && (
              <p className="text-center text-xs text-gray-400 mt-2">
                <Link href={`/login?redirect=/flights/${flightId}`} onClick={() => { localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes })); localStorage.setItem("bookflight_redirect", "/flights/" + flightId); }} className="text-blue-600 underline">{t("Hyr")}</Link> {t("ose")} <Link href={`/register?redirect=${encodeURIComponent("/flights/" + flightId)}`} onClick={() => { localStorage.setItem("bookflight_draft", JSON.stringify({ flightId, passengers, customerEmail, customerPhone, notes })); localStorage.setItem("bookflight_redirect", "/flights/" + flightId); }} className="text-blue-600 underline">{t("Regjistrohu")}</Link> {t("së pari")}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
