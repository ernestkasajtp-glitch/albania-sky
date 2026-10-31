import type { ReactNode } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  booking: {
    id: number; bookingRef: string; customerName: string; customerEmail?: string;
    pnr?: string; fromCity?: string; toCity?: string; airline?: string; flightNumber?: string;
    departureDate?: string; createdAt: string; totalAmount: number; paidAmount: number; dueAmount: number;
  };
  status: { label: string; text: string; bg: string };
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  formatMoney: (value: number) => string;
  formatDate: (value: string) => string;
}

export function MobileBookingCard({ booking: b, status, icon, open, onToggle, formatMoney, formatDate }: Props) {
  const { t } = useTranslation();
  return <div className="myb-mobile-card md:hidden">
    <div className="myb-mobile-head">
      <strong>{b.bookingRef}</strong>
      <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${status.text} ${status.bg}`}>{icon}{t(status.label)}</span>
    </div>
    <div className="myb-mobile-body">
      <h3>{b.customerName}</h3>
      {b.customerEmail && <p className="myb-mobile-email">{b.customerEmail}</p>}
      {b.fromCity && b.toCity && <div className="myb-mobile-route"><span>{b.fromCity}</span><ArrowRight size={18} /><span>{b.toCity}</span></div>}
      <div className="myb-mobile-meta">
        <span>{b.airline}{b.flightNumber && ` · ${b.flightNumber}`}</span>
        <strong>{b.departureDate ? formatDate(`${b.departureDate.slice(0, 10)}T12:00:00`) : formatDate(b.createdAt)}</strong>
      </div>
      <div className="myb-mobile-meta">
        <span>{b.pnr ? `PNR: ${b.pnr}` : ""}</span>
        <span>{t("Rezervuar:")} {formatDate(b.createdAt)}</span>
      </div>
      <div className="myb-mobile-money">
        <div><span>{t("Shuma Totale")}</span><strong>€{formatMoney(b.totalAmount)}</strong></div>
        <div><span>{t("Paguar")}</span><strong className="text-emerald-700">€{formatMoney(b.paidAmount)}</strong></div>
        <div><span>{t("Mbetet")}</span><strong className={b.dueAmount > 0 ? "text-red-600" : "text-emerald-700"}>€{formatMoney(b.dueAmount)}</strong></div>
      </div>
    </div>
    <button type="button" className="myb-mobile-expand" aria-expanded={open} aria-controls={`booking-expanded-${b.id}`} onClick={onToggle}>
      {t("Shiko Detajin të Plotë")}{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  </div>;
}
