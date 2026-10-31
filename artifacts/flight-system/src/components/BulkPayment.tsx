import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fmtM, wholeMoneyInput, dueEuro } from "@/lib/utils";
import { useListAgents } from "@workspace/api-client-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { CheckSquare, Square, CreditCard, Loader2, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, ChevronDown, Check } from "lucide-react";

const API = "/api";

type MethodOption = { value: string; label: string; color?: string; emoji?: string };

let premiumSelectSeq = 0;

function PremiumMethodSelect({
  value,
  options,
  onChange,
  label = "Metoda e pagesës",
}: {
  value: string;
  options: MethodOption[];
  onChange: (v: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const idBase = useRef(`pms-${++premiumSelectSeq}`).current;
  const selected = options.find(o => o.value === value);
  // Lista e filtruar sipas kërkimit (label, pa ndjeshmëri shkronjash).
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const selectedIdx = Math.max(0, filtered.findIndex(o => o.value === value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // When opening, reset the search and start the active option on the current selection.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(selectedIdx);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active index valid when the filter changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`#${idBase}-opt-${activeIdx}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx, idBase]);

  const commit = (idx: number) => {
    const o = filtered[idx];
    if (o) onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "Escape": e.preventDefault(); setOpen(false); break;
      case "ArrowDown": e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); break;
      case "ArrowUp": e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); break;
      case "Home": e.preventDefault(); setActiveIdx(0); break;
      case "End": e.preventDefault(); setActiveIdx(filtered.length - 1); break;
      case "Enter": e.preventDefault(); commit(activeIdx); break;
      case " ":
        // Në fushën e kërkimit hapësira shkruhet normalisht; te butoni zgjedh opsionin.
        if (e.target !== searchRef.current) { e.preventDefault(); commit(activeIdx); }
        break;
      case "Tab": setOpen(false); break;
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${idBase}-list` : undefined}
        aria-activedescendant={open ? `${idBase}-opt-${activeIdx}` : undefined}
        aria-label={`${label}${selected ? `: ${selected.label}` : ""}`}
        className="group relative w-full overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 px-3 py-2 text-left text-sm shadow-md shadow-black/20 transition focus:outline-none focus:ring-2 focus:ring-amber-400/40"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <span className="flex items-center justify-between gap-2">
          <span
            className="truncate font-semibold tracking-wide"
            style={selected?.color ? { color: selected.color, textShadow: `0 0 14px ${selected.color}55` } : { color: "#f1f5f9" }}
          >
            {selected ? `${selected.emoji ? selected.emoji + " " : ""}${selected.label}` : "Zgjidh mënyrën e pagesës"}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${idBase}-list`}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-gradient-to-b from-slate-700 to-slate-800 p-1 shadow-xl shadow-black/30 ring-1 ring-white/5"
        >
          <div className="sticky top-0 z-10 -m-1 mb-1 border-b border-white/10 bg-slate-700/95 p-1.5 backdrop-blur">
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Kërko metodën..."
              aria-label="Kërko metodën e pagesës"
              className="w-full rounded-md border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
            />
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">Asnjë metodë nuk u gjet.</div>
          )}
          {filtered.map((o, i) => {
            const isSel = o.value === value;
            const isActive = i === activeIdx;
            return (
              <div
                key={o.value}
                id={`${idBase}-opt-${i}`}
                role="option"
                aria-selected={isSel}
                onClick={() => commit(i)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${isActive ? "bg-white/10" : isSel ? "bg-white/[0.06]" : "hover:bg-white/[0.07]"}`}
              >
                <span
                  className="truncate font-semibold tracking-wide"
                  style={o.color ? { color: o.color, textShadow: `0 0 12px ${o.color}45` } : { color: "#e2e8f0" }}
                >
                  {o.emoji ? o.emoji + " " : ""}{o.label}
                </span>
                {isSel && <Check className="h-4 w-4 shrink-0 text-amber-400" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function formatCreatedAt(value: string | null | undefined) {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export function BulkPayment({ initialAgentId = "", onPaymentSuccess }: {
  initialAgentId?: string;
  onPaymentSuccess?: () => void | Promise<void>;
}) {
  const { data: agents } = useListAgents({});
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  // Agjentët e çaktivizuar (showInReports===false) nuk shfaqen për jo-admin.
  const visibleAgents = useMemo(
    () => isAdmin ? agents : (agents as any[] | undefined)?.filter(a => a.showInReports !== false),
    [agents, isAdmin],
  );
  const [agentId, setAgentId] = useState(initialAgentId);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [agentWalletBalance, setAgentWalletBalance] = useState<number | null>(null);
  const [walletRefresh, setWalletRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAgentWalletBalance(null);
    if (!agentId) { setAgentWalletBalance(null); return; }
    fetch(`${API}/agents/${agentId}/credits`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => !cancelled && d ? setAgentWalletBalance(d.balance) : null)
      .catch(() => null);
    return () => { cancelled = true; };
  }, [agentId, walletRefresh]);

  const [selectedAmounts, setSelectedAmounts] = useState<Record<number, string>>({});
  const paymentMethods = usePaymentMethods();
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDoc, setPaymentDoc] = useState<File | null>(null);
  const [docDragging, setDocDragging] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const acceptDroppedFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!ACCEPTED_DOC_TYPES.includes(file.type)) {
      setError("Lloji i skedarit nuk lejohet (vetëm PDF, JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Skedari është shumë i madh (maks. 15MB)");
      return;
    }
    setError("");
    setPaymentDoc(file);
  };
  const [payerType, setPayerType] = useState<"invoice" | "client" | "">("");
  const [totalInput, setTotalInput] = useState("");
  const [creditInput, setCreditInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const loadPending = useCallback(async (opts?: { keepResult?: boolean }) => {
    if (!agentId) {
      setPendingBookings([]);
      setSelectedAmounts({});
      return;
    }
    setLoadingBookings(true);
    setSelectedAmounts({});
    // Pas një pagese të suksesshme mbajmë banner-in e suksesit të dukshëm —
    // fshirja e tij bënte që përdoruesi të mendonte se pagesa dështoi dhe ta
    // ridërgonte (kreditim i dyfishtë).
    if (!opts?.keepResult) setResult(null);
    setError("");
    setTotalInput("");
    setCreditInput("");
    try {
      const data = await apiFetch(`/payments/pending-bookings?agentId=${agentId}`);
      setPendingBookings(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingBookings(false);
    }
  }, [agentId]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const selectedIds = Object.keys(selectedAmounts).map(Number);
  const selectedBookings = useMemo(
    () => pendingBookings.filter(b => selectedIds.includes(b.id)),
    [pendingBookings, selectedAmounts]
  );

  const totalEntered = useMemo(
    () => selectedIds.reduce((s, id) => s + (parseFloat(selectedAmounts[id]) || 0), 0),
    [selectedAmounts]
  );

  const totalSelectedDue = useMemo(
    () => selectedBookings.reduce((s, b) => s + dueEuro(b.dueAmount), 0),
    [selectedBookings]
  );
  // Credit overpayment: not allowed with credit
  const creditOverpay = method === "credit" && totalEntered > totalSelectedDue + 0.001;

  // Wallet balance insufficient: block if balance unknown (null) or less than total
  const insufficientWallet =
    method === "credit" &&
    totalEntered > 0 &&
    (agentWalletBalance === null || agentWalletBalance < totalEntered - 0.001);

  const toggle = (booking: any) => {
    setSelectedAmounts(prev => {
      const next = { ...prev };
      if (next[booking.id] !== undefined) {
        delete next[booking.id];
      } else {
        next[booking.id] = fmtM(dueEuro(booking.dueAmount));
      }
      return next;
    });
    setTotalInput("");
    setCreditInput("");
  };

  const toggleAll = () => {
    if (selectedIds.length === pendingBookings.length) {
      setSelectedAmounts({});
      setTotalInput("");
      setCreditInput("");
    } else {
      const next: Record<number, string> = {};
      pendingBookings.forEach(b => { next[b.id] = fmtM(dueEuro(b.dueAmount)); });
      setSelectedAmounts(next);
      setTotalInput("");
      setCreditInput("");
    }
  };

  const updateAmount = (bookingId: number, val: string, maxDue: number) => {
    val = wholeMoneyInput(val);
    // Payment lines always represent canonical booking dues. Any excess must
    // be entered as wallet credit (or via the total field), never on a line.
    const num = parseFloat(val) || 0;
    const capped = num > maxDue ? fmtM(maxDue) : val;
    setSelectedAmounts(prev => ({ ...prev, [bookingId]: capped }));
    setTotalInput("");
    setCreditInput("");
  };

  const handleTotalChange = (val: string) => {
    setTotalInput(val);
    const total = parseFloat(val) || 0;
    if (selectedIds.length === 0) return;

    let remaining = total;
    const next: Record<number, string> = {};
    const ordered = pendingBookings.filter(b => selectedIds.includes(b.id));
    for (const b of ordered) {
      const alloc = Math.min(remaining, dueEuro(b.dueAmount));
      next[b.id] = alloc > 0 ? fmtM(alloc) : "0";
      remaining = Math.max(0, remaining - alloc);
    }
    setSelectedAmounts(next);
    // For non-credit: excess goes to tepricë (wallet credit)
    // For credit: no tepricë allowed, cap at totalSelectedDue
    if (method !== "credit") {
      setCreditInput(remaining > 0 ? fmtM(remaining) : "");
    } else {
      setCreditInput("");
    }
  };

  const creditAmt = method !== "credit" ? (parseFloat(creditInput) || 0) : 0;
  const grandTotal = totalEntered + creditAmt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method.trim() || !(method === "credit" || paymentMethods.some(pm => pm.name === method))) {
      setError("Zgjidhni një mënyrë të vlefshme pagese.");
      return;
    }
    if (!agentId) { setError("Zgjidhni fillimisht agjencin para se të vazhdoni."); return; }
    if (selectedIds.length === 0) { setError("Zgjidhni të paktën një rezervim."); return; }

    const lines = selectedIds.map(id => ({
      bookingId: id,
      amount: Math.round(parseFloat(selectedAmounts[id]) || 0),
    })).filter(l => l.amount > 0);

    if (lines.length === 0) { setError("Shkruani shuma të vlefshme."); return; }

    // Credit method: validate no line exceeds booking due amount
    if (method === "credit") {
      for (const line of lines) {
        const booking = pendingBookings.find(b => b.id === line.bookingId);
        const due = booking ? dueEuro(booking.dueAmount) : 0;
        if (booking && line.amount > due) {
          setError(`Rezervimi ${booking.bookingRef}: shuma (€${fmtM(line.amount)}) tejkalon detyrimin (€${fmtM(due)}) — me kredit nuk lejohet mbipagesë`);
          return;
        }
      }
    }

    const firstBooking = pendingBookings.find(b => selectedIds.includes(b.id));
    const resolvedAgentId = firstBooking?.agentId ?? (agentId ? parseInt(agentId) : undefined);

    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("payments", JSON.stringify(lines));
      // The tendered amount is the actual whole-euro amount entered/transferred
      // by the user, including any wallet credit. Payment lines remain
      // canonical dues and are not used as the tendered total.
      fd.append("tenderedAmount", String(Math.max(0, Math.round(grandTotal))));
      fd.append("method", method);
      if (reference) fd.append("reference", reference);
      fd.append("notes", notes || "Pagesë masive");
      if (payerType) fd.append("payerType", payerType);
      // Dërgo GJITHMONË agentId (jo vetëm me tepricë) — serveri e përdor për
      // kontrollin e balancës së kuletës te metoda Kredit.
      if (resolvedAgentId) fd.append("agentId", String(resolvedAgentId));
      if (creditAmt > 0) {
        // Legacy compatibility for older API handlers; tenderedAmount is the
        // client-side accounting authority for the total tendered value.
        fd.append("creditAmount", String(creditAmt));
      }
      if (paymentDoc) fd.append("document", paymentDoc);
      let res = await fetch(API + "/payments/bulk", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => ({} as any));
        if (err?.duplicate) {
          const ok = window.confirm(
            "⚠️ Një pagesë identike u regjistrua para pak sekondash — ndoshta është dërguar dy herë.\n\nJeni i sigurt që doni ta regjistroni PËRSËRI këtë pagesë?"
          );
          if (!ok) { setSubmitting(false); return; }
          fd.append("allowDuplicate", "true");
          res = await fetch(API + "/payments/bulk", {
            method: "POST",
            credentials: "include",
            body: fd,
          });
        } else {
          throw new Error(err.error || "Request failed");
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Request failed");
      }
      const data = await res.json();
      setResult(data);
      setMethod("");
      setCreditInput("");
      setTotalInput("");
      setPaymentDoc(null);
      if (docInputRef.current) docInputRef.current.value = "";
      setWalletRefresh(value => value + 1);
      // Payment is already committed. A refresh failure must not invite a
      // second submission or remove the success banner.
      const refreshes = await Promise.allSettled([
        loadPending({ keepResult: true }),
        Promise.resolve().then(() => onPaymentSuccess?.()),
      ]);
      if (refreshes.some(refresh => refresh.status === "rejected")) {
        setError("Pagesa u ruajt. Rifreskimi i të dhënave dështoi; rihapni faqen, mos e regjistroni pagesën përsëri.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = pendingBookings.length > 0 && selectedIds.length === pendingBookings.length;

  return (
    <div className="space-y-4">
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800 space-y-1">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <span className="font-semibold">{result.created} pagesa u kryen me sukses!</span>
          </div>
          <div className="pl-8 text-sm space-y-0.5">
            {(result.payments ?? []).map((p: any) => (
              <div key={p.paymentId} className="flex justify-between max-w-xs">
                <span className="font-mono text-green-700">{p.bookingRef}</span>
                <span className="font-semibold">−€{fmtM(p.amount)}</span>
              </div>
            ))}
            {result.creditAdded > 0 && (
              <div className="flex justify-between max-w-xs text-blue-700 font-semibold border-t border-green-200 pt-1 mt-1">
                <span>Tepricë (Kreditim)</span>
                <span>+€{fmtM(result.creditAdded)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* LEFT: Booking list */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <select
                    className={`border rounded px-3 py-2 text-sm bg-background font-medium ${!agentId ? "border-amber-400 ring-1 ring-amber-300" : "border-border"}`}
                    value={agentId}
                    onChange={e => { setAgentId(e.target.value); setResult(null); setError(""); }}
                  >
                    <option value="">— Zgjidhni fillimisht agjencin —</option>
                    {visibleAgents?.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {!agentId && (
                    <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> E detyrueshme
                    </span>
                  )}
                </div>
              </div>
              {agentId && (
                <span className="text-sm text-muted-foreground">
                  {loadingBookings ? "Duke ngarkuar..." : `${pendingBookings.length} rezervime me borxh`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadPending()} className="text-muted-foreground hover:text-foreground" title="Rifresko">
                <RefreshCw className="h-4 w-4" />
              </button>
              {pendingBookings.length > 0 && (
                <button onClick={toggleAll} className="text-sm text-primary hover:underline font-medium">
                  {allSelected ? "Çzgjidh të gjitha" : "Zgjidh të gjitha"}
                </button>
              )}
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">
                    <button onClick={toggleAll}>
                      {allSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </TableHead>
                  <TableHead>Referenca</TableHead>
                  <TableHead>PNR</TableHead>
                  <TableHead>Klienti</TableHead>
                  <TableHead className="w-24">Krijuar</TableHead>
                  <TableHead>Fluturimi</TableHead>
                  <TableHead className="text-center w-16">Pax</TableHead>
                  <TableHead className="text-center w-24">Statusi</TableHead>
                  <TableHead className="text-right w-28">Financa</TableHead>
                  <TableHead className="text-right w-36">Shuma e pagesës</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBookings ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : !agentId ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10">
                      <div className="flex flex-col items-center gap-2 text-amber-600">
                        <AlertCircle className="h-8 w-8" />
                        <p className="font-semibold text-sm">Zgjidhni fillimisht agjencin</p>
                        <p className="text-xs text-muted-foreground max-w-xs">Pagesat masive lejohen vetëm për një agjenci. Zgjidhni agjencin nga lista sipër për të parë biletat e saj.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : pendingBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nuk ka rezervime me borxh për këtë agjenci.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingBookings.map((b: any) => {
                    const isSelected = selectedAmounts[b.id] !== undefined;
                    const amtVal = selectedAmounts[b.id] ?? "";
                    const amtNum = parseFloat(amtVal) || 0;
                    const due = dueEuro(b.dueAmount);
                    const overPay = amtNum > due; // only relevant for credit method
                    const created = formatCreatedAt(b.createdAt);

                    return (
                      <TableRow
                        key={b.id}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/20"}`}
                      >
                        <TableCell onClick={() => toggle(b)}>
                          <button>
                            {isSelected
                              ? <CheckSquare className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </TableCell>
                        <TableCell onClick={() => toggle(b)}>
                          <Link
                            href={`/bookings/${b.id}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            {b.bookingRef}
                          </Link>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {b.agentName || "Direkt"}
                          </div>
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="font-mono text-xs whitespace-nowrap">
                          {b.pnr || "—"}
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="font-medium text-sm">
                          {b.customerName}
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="whitespace-nowrap">
                          <div className="text-xs font-medium text-foreground">{created.date}</div>
                          <div className="text-[10px] text-muted-foreground">{created.time}</div>
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="text-sm text-muted-foreground">
                          {b.flight ? (
                            <div className="space-y-0.5">
                              <div className="text-[11px] font-semibold text-foreground">{b.flight.flightNumber || "—"}</div>
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <span className="font-medium">{b.flight.fromCity}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium">{b.flight.toCity}</span>
                              </div>
                              <div className="text-[10px] opacity-70 whitespace-nowrap">
                                Nisja: {b.flight.departureDate}{b.flight.departureTime ? ` · ${b.flight.departureTime}` : ""}
                              </div>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="text-center text-sm font-medium">
                          {b.infantCount > 0 ? `${b.paxCount}+${b.infantCount}b` : (b.paxCount ?? "-")}
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="text-center">
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${b.status === "ticketed" ? "bg-green-500" : b.status === "confirmed" ? "bg-blue-500" : b.status === "cancelled" ? "bg-red-500" : b.status === "pending" ? "bg-orange-400" : "bg-yellow-500"}`}>
                            {({ ticketed: "Biletë", confirmed: "Konfirmuar", cancelled: "Anuluar", pending: "Pezull", draft: "Draft" } as any)[b.status] ?? b.status}
                          </span>
                        </TableCell>
                        <TableCell onClick={() => toggle(b)} className="text-right">
                          <div className="text-[10px] text-muted-foreground">Total €{fmtM(b.totalAmount)}</div>
                          <div className="text-[10px] text-emerald-600">Paguar €{fmtM(b.paidAmount)}</div>
                          <div className="font-bold text-destructive text-sm">Borxh €{fmtM(due)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isSelected ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <div className={`flex items-center border rounded-md overflow-hidden ${method === "credit" && overPay ? "border-orange-400" : "border-primary/40"}`}>
                                <span className="px-1.5 text-xs text-muted-foreground bg-muted/40 border-r">€</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={amtVal}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => updateAmount(b.id, e.target.value, due)}
                                  className="no-number-spin w-24 px-2 py-1.5 text-sm text-right bg-white focus:outline-none"
                                />
                              </div>
                              {method === "credit" && overPay && (
                                <span className="text-[10px] text-orange-500">Tejkalon borxhin</span>
                              )}
                              {method !== "credit" && overPay && (
                                <span className="text-[10px] text-blue-500">
                                  +€{fmtM(amtNum - due)} kreditim
                                </span>
                              )}
                              {amtNum < due && amtNum > 0 && (
                                <span className="text-[10px] text-blue-500">
                                  Mbetet €{fmtM(due - amtNum)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50 italic">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {selectedIds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{selectedIds.length} rezervime · borxh: <strong>€{fmtM(totalSelectedDue)}</strong></span>
                <span className="font-bold text-primary">Biletë: €{fmtM(totalEntered)}</span>
              </div>

              {method !== "credit" && creditAmt > 0 && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-blue-700 mb-0.5">Tepricë (Kreditim në wallet)</div>
                    <div className="text-[11px] text-blue-500">
                      {agentId
                        ? <>Do t'i shtohet: <strong className="text-blue-700">{visibleAgents?.find((a: any) => String(a.id) === agentId)?.name ?? "agjentit"}</strong></>
                        : "Zgjidhni agjentin për të kredituar"}
                    </div>
                  </div>
                  <div className="flex items-center border border-blue-300 rounded-md overflow-hidden bg-white">
                    <span className="px-2 text-sm text-blue-500 bg-blue-50 border-r py-2">€</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={creditInput}
                      onChange={e => { setCreditInput(wholeMoneyInput(e.target.value)); setTotalInput(""); }}
                      placeholder="0"
                      className="no-number-spin w-28 px-2 py-2 text-sm text-right text-blue-700 font-semibold focus:outline-none"
                    />
                  </div>
                  {creditAmt > 0 && (
                    <div className="text-blue-700 font-bold text-sm">+€{fmtM(creditAmt)}</div>
                  )}
                </div>
              )}

              {grandTotal > 0 && (
                <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground font-medium">Total i transferuar</span>
                  <span className="font-bold text-base text-primary">€{fmtM(grandTotal)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Payment form */}
        <div>
          <form onSubmit={handleSubmit} className="border rounded-xl p-5 bg-white shadow-sm space-y-4 sticky top-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">Kryej Pagesën</h3>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Shuma totale
                {selectedIds.length > 0 && (
                  <span className="ml-1 text-primary/60">(shpërndan automatikisht)</span>
                )}
              </label>
              <div className="flex items-center border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                <span className="px-2 text-sm text-muted-foreground bg-muted/40 border-r py-2">€</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totalInput}
                  onChange={e => handleTotalChange(wholeMoneyInput(e.target.value))}
                  placeholder={selectedIds.length > 0 ? fmtM(totalEntered) : "0"}
                  className="no-number-spin flex-1 px-3 py-2 text-sm bg-white focus:outline-none"
                />
              </div>
              {selectedIds.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {method === "credit"
                    ? `Shkruani totalin → shpërndahet rresht pas rreshti · maks. €${fmtM(totalSelectedDue)}`
                    : "Shkruani totalin → shpërndahet rresht pas rreshti (teprica kalon kreditim)"}
                </p>
              )}
            </div>

            <div className={`rounded-lg p-3 text-sm space-y-1.5 ${selectedIds.length > 0 ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rezervime zgjedhur</span>
                <span className="font-bold">{selectedIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Biletë (total)</span>
                <span className={`font-semibold ${selectedIds.length > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  €{fmtM(totalEntered)}
                </span>
              </div>
              {creditAmt > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>Tepricë (Kreditim)</span>
                  <span className="font-semibold">+€{fmtM(creditAmt)}</span>
                </div>
              )}
              {grandTotal > 0 && (
                <div className="flex justify-between border-t border-primary/20 pt-1.5 mt-0.5">
                  <span className="font-semibold">Total transferuar</span>
                  <span className="font-bold text-base text-primary">€{fmtM(grandTotal)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Metoda e Pagesës *</label>
              <PremiumMethodSelect
                value={method}
                onChange={setMethod}
                options={[
                  ...paymentMethods.map(pm => ({ value: pm.name, label: pm.name, color: pm.color })),
                  { value: "credit", label: "Kredit (Wallet)", emoji: "🪙", color: "#f59e0b" },
                ]}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Regjistrimi tregon se pagesa është marrë; me Kredit zbritet balanca e wallet-it, jo para fizike.</p>
              <div className="mt-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Lloji i Pagesës</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayerType(payerType === "invoice" ? "" : "invoice")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${payerType === "invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted border-border"}`}
                  >
                    {payerType === "invoice" && <CheckSquare className="h-4 w-4" />}
                    📄 FATURË
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerType(payerType === "client" ? "" : "client")}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${payerType === "client" ? "bg-green-600 text-white border-green-600" : "bg-background hover:bg-muted border-border"}`}
                  >
                    {payerType === "client" && <CheckSquare className="h-4 w-4" />}
                    👤 KLIENT
                  </button>
                </div>
              </div>
              {method === "credit" && agentId && (
                <div className={`mt-1.5 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md border ${agentWalletBalance === null ? "bg-muted/30 text-muted-foreground" : agentWalletBalance >= totalEntered && totalEntered > 0 ? "bg-green-50 border-green-200 text-green-700" : agentWalletBalance !== null && agentWalletBalance <= 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-yellow-50 border-yellow-200 text-yellow-700"}`}>
                  <span>Balanca: <strong>€{agentWalletBalance !== null ? fmtM(agentWalletBalance) : "..."}</strong></span>
                  {totalEntered > 0 && agentWalletBalance !== null && (
                    <span>Pas pagesës: <strong>€{fmtM(agentWalletBalance - totalEntered)}</strong></span>
                  )}
                </div>
              )}
              {method === "credit" && !agentId && (
                <p className="mt-1 text-[11px] text-yellow-600">Zgjidhni agjentin për të parë balancën</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Referenca (opsionale)</label>
              <input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Nr. transferte, faturë..."
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Shënime</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Shënime shtesë..."
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Dokumenti i pagesës (opsionale)</label>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={e => setPaymentDoc(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {paymentDoc ? (
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <span className="truncate text-muted-foreground">📎 {paymentDoc.name}</span>
                  <button
                    type="button"
                    onClick={() => { setPaymentDoc(null); if (docInputRef.current) docInputRef.current.value = ""; }}
                    className="shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
                  >
                    Hiq
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); if (!docDragging) setDocDragging(true); }}
                  onDragEnter={e => { e.preventDefault(); setDocDragging(true); }}
                  onDragLeave={e => { e.preventDefault(); setDocDragging(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    setDocDragging(false);
                    acceptDroppedFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-sm transition-colors ${docDragging ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <span>📎 {docDragging ? "Lësho këtu për të ngjitur" : "Ngarko ose rrëshqit dokumentin këtu"}</span>
                  <span className="text-[11px] text-muted-foreground/70">PDF, JPG, PNG, WEBP — maks. 15MB</span>
                </button>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-2 text-xs space-y-1 max-h-40 overflow-y-auto border">
                {selectedBookings.map(b => {
                  const amt = parseFloat(selectedAmounts[b.id]) || 0;
                  return (
                    <div key={b.id} className="flex justify-between items-center py-0.5 border-b border-muted/40 last:border-0">
                      <span className="font-mono text-muted-foreground">{b.bookingRef}</span>
                      <span className={`font-semibold ${amt > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        −€{fmtM(amt)}
                        {amt < dueEuro(b.dueAmount) && amt > 0 && <span className="text-orange-400 ml-1">(pjesë)</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {creditOverpay && (
              <div className="flex items-center gap-2 text-xs bg-red-50 border border-red-300 rounded-md px-3 py-2 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Me kredit nuk lejohet mbipagesë — maks. €{fmtM(totalSelectedDue)}
              </div>
            )}

            {insufficientWallet && !creditOverpay && (
              <div className="flex items-center gap-2 text-xs bg-red-50 border border-red-300 rounded-md px-3 py-2 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {agentWalletBalance === null
                  ? "Duke kontrolluar balancën e wallet-it..."
                  : `Balanca e pamjaftueshme — keni €${fmtM(agentWalletBalance)}, nevojiten €${fmtM(totalEntered)}`}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !method || !(method === "credit" || paymentMethods.some(pm => pm.name === method)) || selectedIds.length === 0 || grandTotal <= 0 || creditOverpay || insufficientWallet}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {submitting
                ? "Duke procesuar..."
                : grandTotal > 0
                ? `Kryej Pagesën €${fmtM(grandTotal)}`
                : "Kryej Pagesën"}
            </button>

            {selectedIds.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">Zgjidhni të paktën një rezervim</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
