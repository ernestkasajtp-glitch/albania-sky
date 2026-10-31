import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertCircle } from "lucide-react";
import BookingDetailView from "@/components/BookingDetailView";

export default function BookingDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/my-bookings/:ref");
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pokLoading, setPokLoading] = useState(false);
  const [pokError, setPokError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const ref = params?.ref ?? "";

  useEffect(() => {
    if (!authLoading && !user) { setLocation("/login"); return; }
    if (user && ref) {
      api.getBookingDetail(ref)
        .then(setBooking)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, ref]);

  async function handlePokPay() {
    setPokError("");
    setPokLoading(true);
    try {
      const data = await api.initPokPayment(ref);
      if (data?.confirmUrl) {
        window.location.href = data.confirmUrl;
      } else {
        setPokError(t("Nuk u mor URL-ja e pagesës. Provoni përsëri."));
      }
    } catch (err: any) {
      setPokError(err.message || t("Gabim gjatë inicimit të pagesës."));
    } finally {
      setPokLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const blob = await api.downloadBookingPdf(ref);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent — non-blocking
    } finally {
      setPdfLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f5f9" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#0b1f3a] border-t-transparent animate-spin" />
          <div className="text-sm text-gray-500">{t("Duke ngarkuar rezervimin…")}</div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f5f9" }}>
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-2">{t("Rezervimi nuk u gjet")}</h2>
          <p className="text-gray-400 text-sm mb-5">{error || t("Ky rezervim nuk ekziston ose nuk keni akses.")}</p>
          <button onClick={() => setLocation("/my-bookings")}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg,#0b1f3a,#1a3a6b)" }}>
            <ArrowLeft className="h-4 w-4" /> {t("Kthehu te Rezervimet")}
          </button>
        </div>
      </div>
    );
  }

  return <BookingDetailView
    booking={booking}
    pokLoading={pokLoading}
    pokError={pokError}
    pdfLoading={pdfLoading}
    onPay={handlePokPay}
    onDownload={handleDownloadPdf}
    onBack={() => setLocation("/my-bookings")}
  />;
}
