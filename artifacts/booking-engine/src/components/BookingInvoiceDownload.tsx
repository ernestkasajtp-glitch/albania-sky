import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";

type Invoice = Awaited<ReturnType<typeof api.getBookingInvoices>>[number];

export default function BookingInvoiceDownload({ bookingRef }: { bookingRef: string }) {
  const { t, i18n } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setInvoices([]);
    setSelectedId("");
    api.getBookingInvoices(bookingRef).then(items => {
      if (!active) return;
      setInvoices(items);
      setSelectedId(items.length ? String(items[0].paymentId) : "");
    }).catch(() => { if (active) setLoadError(t("Faturat nuk u ngarkuan.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingRef, retry, t]);

  async function download() {
    const invoice = invoices.find(i => String(i.paymentId) === selectedId);
    if (!invoice || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const { blob, filename } = await api.downloadBookingInvoice(bookingRef, invoice.paymentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(t("Fatura nuk u shkarkua. Provoni përsëri."));
    } finally {
      setDownloading(false);
    }
  }
  return <div className="as-invoice-download">
    {invoices.length > 1 && <label className="block mt-3 text-xs">
      {t("Zgjidh faturën")}
      <select value={selectedId} disabled={downloading} onChange={e => { setSelectedId(e.target.value); setDownloadError(""); }}
        className="block w-full mt-1 px-2 py-2 rounded border border-gray-200 bg-white text-xs">
        {invoices.map(invoice => <option key={invoice.paymentId} value={invoice.paymentId}>
          {invoice.invoiceCode} · {new Date(invoice.createdAt).toLocaleDateString(i18n.language === "en" ? "en-GB" : "sq-AL")}{invoice.kind === "batch" ? ` · ${t("Pagesë në grup")}` : ""}
        </option>)}
      </select>
    </label>}
    <button className="as-action" disabled={loading || downloading || !selectedId || !!loadError} onClick={download}>
      {loading || downloading ? <Loader2 className="animate-spin" /> : <Download />}DOWNLOAD INVOICE
    </button>
    {!loading && !loadError && !invoices.length && <p className="as-sub mt-1">{t("Nuk ka pagesë të përfunduar me faturë për shkarkim.")}</p>}
    {loadError && <div className="as-notice" role="alert">{loadError} <button className="underline" onClick={() => setRetry(n => n + 1)}>{t("Provo përsëri")}</button></div>}
    {downloadError && <div className="as-notice" role="alert">{downloadError}</div>}
  </div>;
}
