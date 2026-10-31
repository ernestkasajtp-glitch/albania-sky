import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "./_services";


export function PaymentReports() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("full");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const download = async () => { setMessage("Prototip vizual — nuk shkarkohet dokument dhe nuk dërgohet email."); };
  const inputClass = "mt-1 block w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-xs text-slate-900";
  return <section className="mb-5 rounded-xl border border-white/15 bg-white/5 p-4 text-white" aria-label={t("Raporte pagesash")}>
    <h2 className="text-sm font-semibold">{t("Raporte pagesash")}</h2>
    <p className="mt-1 text-xs text-blue-200">{t("Shkarkoni PDF dhe merrni një kopje në emailin e regjistruar të agjencisë.")}</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-40 flex-1 text-xs">{t("Raporti")}
        <select className={inputClass} value={kind} disabled={busy} onChange={e => setKind(e.target.value)}>
          <option value="full">{t("Raport i Detajuar")}</option>
          <option value="debt">{t("Raport Detyrimet")}</option>
        </select>
      </label>
      <label className="text-xs">{t("Nga data e rezervimit")}
        <input type="date" className={inputClass} value={from} max={to || undefined} disabled={busy} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="text-xs">{t("Deri më datë")}
        <input type="date" className={inputClass} value={to} min={from || undefined} disabled={busy} onChange={e => setTo(e.target.value)} />
      </label>
      <button type="button" onClick={download} disabled={busy || !!(from && to && from > to)}
        className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? t("Po përgatitet…") : t("Shkarko PDF + Email")}
      </button>
    </div>
    {message && <p role={failed ? "alert" : "status"} className={`mt-3 text-xs ${failed ? "text-red-200" : "text-emerald-200"}`}>{message}</p>}
  </section>;
}
