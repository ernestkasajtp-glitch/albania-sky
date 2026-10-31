import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Progress = { id: string; status: "running" | "completed" | "failed"; from: string; to: string;
  total: number; checked: number; created: number; existing: number; ignored: number; errors: number; error?: string; scope?: "allMail" | "inbox" };
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/../api/cp-import-alerts/priority-history`;

async function readResponse(response: Response): Promise<Progress | null> {
  if (response.status === 401) throw new Error("Sesioni ka përfunduar. Hyni përsëri në sistem.");
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Serveri nuk ktheu përgjigjen e kontrollit PRIORITY. Rifreskoni faqen; nëse vazhdon, kontaktoni administratorin.");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Përgjigjja e kontrollit PRIORITY nuk mund të lexohet. Provoni përsëri."); }
  if (!response.ok) throw new Error(data?.error || "Kontrolli PRIORITY dështoi. Provoni përsëri.");
  return data;
}
export function PriorityHistory({ onFinished }: { onFinished: () => void }) {
  const { toast } = useToast();
  const [from, setFrom] = useState("2026-09-01");
  const [to, setTo] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const lastFinished = useRef<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const response = await fetch(API, { credentials: "include", cache: "no-store" });
        const data = await readResponse(response);
        if (cancelled) return;
        setProgress(data); setError("");
        if (data && data.status !== "running" && lastFinished.current !== data.id) {
          lastFinished.current = data.id;
          onFinishedRef.current();
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Leximi dështoi."); }
      if (!cancelled) timer = setTimeout(read, 3000);
    };
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  const start = async () => {
    if (lock.current) return;
    if (!window.confirm(`Të kontrollohen email-et e marra nga ${from} deri më ${to}? Krijohen vetëm njoftime PRIORITY, pa ndryshuar rezervimet.`)) return;
    lock.current = true; setStarting(true);
    try {
      const response = await fetch(API, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      const data = await readResponse(response);
      if (!data) throw new Error("Serveri nuk konfirmoi nisjen e kontrollit.");
      setProgress(data); setError("");
      toast({ title: "Kontrolli historik u nis", description: "Mund ta lini faqen; kontrolli vazhdon në server." });
    } catch (e) {
      toast({ title: "Kontrolli nuk u nis", description: e instanceof Error ? e.message : "Provoni përsëri.", variant: "destructive" });
    } finally { lock.current = false; setStarting(false); }
  };
  const busy = starting || progress?.status === "running";
  return <section className="rounded-lg border bg-white p-4 mb-4 space-y-3">
    <h2 className="font-semibold">Kontroll historik PRIORITY</h2>
    <p className="text-xs text-slate-500">Sipas datës së marrjes së email-it, jo nisjes së fluturimit. Njoftimet ekzistuese nuk përsëriten.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Nga data<input aria-label="Nga data" type="date" className="block border rounded p-2" value={from} max={to} disabled={busy} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-sm">Deri më<input aria-label="Deri më" type="date" className="block border rounded p-2" value={to} min={from} disabled={busy} onChange={e => setTo(e.target.value)} /></label>
      <Button disabled={busy || !from || !to || from > to} onClick={start}>{busy ? "Kontrolli në proces…" : "Kontrollo email-et e vjetra"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {progress && <div aria-live="polite" className={`text-sm ${progress.status === "failed" || progress.errors ? "text-red-700" : "text-slate-700"}`}>
      <p className="font-medium">{progress.status === "running" ? "Duke kontrolluar" : progress.status === "failed" ? "Kontrolli u ndërpre" : progress.errors ? "Kontrolli përfundoi me gabime" : "Kontrolli përfundoi"} · {progress.from} — {progress.to}</p>
      <p>{progress.checked}/{progress.total} email-e · {progress.created} njoftime të reja · {progress.existing} ekzistuese · {progress.ignored} anashkaluara · {progress.errors} gabime</p>
      {progress.scope === "allMail" && <p>Përfshihen edhe email-et e arkivuara.</p>}
      {progress.scope === "inbox" && <p className="text-amber-700">U kontrollua vetëm Inbox; dosja e arkivës nuk është e disponueshme për lexim.</p>}
      {progress.error && <p>{progress.error}</p>}
      {progress.errors > 0 && <p>Mund ta përsëritni kontrollin; njoftimet e krijuara nuk dyfishohen.</p>}
    </div>}
  </section>;
}
