import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft, Clock3 } from "lucide-react";
import { api } from "@/lib/api";
import { pokReturnState, type PokReturnState, type PokVerifyResult } from "@/lib/pokReturnResult";
import { fmtM } from "@/lib/utils";

export default function PaymentReturn() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const ref = params.get("ref") ?? "";
  const orderId = params.get("orderId") ?? "";

  const [result, setResult] = useState<PokVerifyResult | null>(null);
  const [state, setState] = useState<PokReturnState | "loading">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    setResult(null);
    if (!ref || !orderId) {
      setState("review");
      return () => { active = false; };
    }
    // Verify this exact order even if the redirect says "failed": redirect
    // status and the booking-wide paid balance cannot attest to its payment.
    api.verifyPokPayment(ref, orderId).then((verification) => {
      if (!active) return;
      setResult(verification);
      setState(pokReturnState(verification, ref));
    }).catch(() => {
      if (active) setState("review");
    });
    return () => { active = false; };
  }, [ref, orderId]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1f5f9" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#0b1f3a]" />
          <div className="text-sm text-gray-500">{t("Duke kontrolluar pagesën…")}</div>
        </div>
      </div>
    );
  }

  const isSuccess = state === "success";
  const isPending = state === "pending";

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#f1f5f9" }}>
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 max-w-md w-full p-8 text-center">
        {isSuccess ? (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">{t("Pagesa u krye!")}</h1>
            <p className="text-gray-500 text-sm mb-6">
              {t("Pagesa juaj u procesua me sukses.")} {t("Rezervimi")}{" "}
              <span className="font-mono font-bold text-[#0b1f3a]">{ref}</span> {t("është përditësuar.")}
            </p>
            {result && typeof result.paid === "number" && Number.isFinite(result.paid)
              && typeof result.due === "number" && Number.isFinite(result.due) && (
              <div className="bg-emerald-50 rounded-2xl px-5 py-4 mb-6 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("Paguar gjithsej për rezervimin")}</span>
                  <span className="font-bold text-emerald-600">€{fmtM(result.paid)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("Mbetet")}</span>
                  <span className="font-bold text-red-500">€{fmtM(result.due)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isPending ? "bg-amber-50" : "bg-red-50"}`}>
              {isPending ? <Clock3 className="w-10 h-10 text-amber-500" /> : <AlertCircle className="w-10 h-10 text-red-400" />}
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">
              {isPending ? t("Pagesa është në pritje") : t("Pagesa kërkon verifikim")}
            </h1>
            <p className="text-gray-500 text-sm mb-6">
              {isPending
                ? t("POK nuk e konfirmon ende këtë pagesë. Ju lutemi prisni konfirmimin ose kontaktoni agjencinë.")
                : t("Nuk mund të konfirmojmë këtë pagesë. Ju lutemi kontaktoni agjencinë për verifikim.")}
              {" "}{t("Mos e provoni përsëri pagesën derisa të verifikohet, për të shmangur tarifimin e dyfishtë.")}
            </p>
          </>
        )}
        <div className="flex flex-col gap-3">
          {ref && (
            <button
              onClick={() => setLocation(`/my-bookings/${encodeURIComponent(ref)}`)}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#0b1f3a,#1a3a6b)" }}
            >
              {t("Shiko Rezervimin")}
            </button>
          )}
          <button
            onClick={() => setLocation("/my-bookings")}
            className="w-full py-3 rounded-xl font-bold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> {t("Rezervimet e Mia")}
          </button>
        </div>
      </div>
    </div>
  );
}