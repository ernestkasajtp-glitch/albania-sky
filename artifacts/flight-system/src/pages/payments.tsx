import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtM, fmtAmPm, wholeMoneyInput, dueEuro } from "@/lib/utils";
import { fmtFlightNum } from "@/lib/utils";
import { generateDetailedReportHTML, REPORT_TOOLBAR_CSS, reportToolbarHTML, cpCodeOf } from "@/lib/reportDetailed";
import { format } from "date-fns";
import { useListPayments, useListAgents } from "@workspace/api-client-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentMethodCombobox } from "@/components/PaymentMethodCombobox";
import { Badge } from "@/components/ui/badge";
import { useSearch } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Loader2, AlertCircle, RefreshCw, FileDown, Search, Filter, X, CreditCard, CheckCircle2, Settings2, Download, ChevronRight, ChevronDown, Layers, History } from "lucide-react";
import { BulkPayment } from "@/components/BulkPayment";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePaymentMethods, refreshPaymentMethods } from "@/hooks/usePaymentMethods";
import { AgentRankBadge } from "@/components/AgentRankBadge";

const API = "/api";

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

const METHOD_LABELS: Record<string, string> = {
  cash: "Para në dorë",
  bank_transfer: "Transfertë",
  card: "Kartë",
  credit: "Kredit",
  online: "Online",
  other: "Tjetër",
};

type PaymentConfirmation = {
  ids: number[];
  kind: "single" | "batch" | "selection";
  amount: number;
  label?: string;
  method?: string;
  note?: string;
};

// ─── Payment Ledger tab ────────────────────────────────────────────────────
const MOVE_TYPES: Record<string, { label: string; color: string; bg: string; sign: "+" | "−" }> = {
  payment_cash:         { label: "Cash",           color: "text-green-600",   bg: "",                  sign: "+" },
  payment_bank:         { label: "Bankë",           color: "text-green-600",   bg: "",                  sign: "+" },
  payment_bank_transfer:{ label: "Bankë",           color: "text-green-600",   bg: "",                  sign: "+" },
  payment_card:         { label: "Kartë",           color: "text-green-600",   bg: "",                  sign: "+" },
  payment_other:        { label: "Tjetër",          color: "text-green-600",   bg: "",                  sign: "+" },
  payment_credit:       { label: "Kredit (Wallet)", color: "text-purple-700",  bg: "bg-purple-50/40",   sign: "−" },
  refund_auto:          { label: "Kreditim Auto",   color: "text-blue-600",    bg: "bg-blue-50/30",     sign: "+" },
  refund_manual:        { label: "Rimbursim",       color: "text-red-600",     bg: "bg-red-50/30",      sign: "−" },
  wallet_deposit:       { label: "Depozitë Wallet", color: "text-emerald-600", bg: "bg-emerald-50/40",  sign: "+" },
  wallet_credit:        { label: "Tepricë → Wallet",color: "text-blue-600",    bg: "bg-blue-50/30",     sign: "+" },
};

function getMoveType(row: any) {
  if (row._source === "wallet") return row.method === "wallet-deposit" ? "wallet_deposit" : "wallet_credit";
  if (row.isRefund) return row.reference === "KREDIT-AUTO" ? "refund_auto" : "refund_manual";
  if (row.method === "credit") return "payment_credit";
  return "payment_generic";
}

function getRowDisplay(row: any, methodOptions: { name: string; color?: string }[]): { label: string; color: string; bg: string; sign: "+" | "−" } {
  const mt = getMoveType(row);
  if (mt !== "payment_generic" && MOVE_TYPES[mt]) return MOVE_TYPES[mt];
  // Dynamic payment method — use its real name and color
  const pm = methodOptions.find(m => m.name === row.method);
  if (pm) {
    return { label: pm.name, color: pm.color ? "" : "text-green-600", bg: "", sign: "+" };
  }
  // Legacy hardcoded mapping fallback
  const legacy = MOVE_TYPES[`payment_${row.method}`];
  if (legacy) return legacy;
  return { label: row.method || "Pagesë", color: "text-green-600", bg: "", sign: "+" };
}

function matchesPaymentGroup(row: any, group: string, methodOptions: { name: string; color?: string }[]) {
  if (!group || row._source !== "payment" || row.isRefund || row.method === "credit") return !group;
  const text = `${row.method ?? ""} ${getRowDisplay(row, methodOptions).label}`.toLowerCase();
  if (group === "bank") {
    return /bank|bankë|transfer|transfert|raiffeisen|bkt|credins|intesa|otp|abi|procredit|union|tirana/.test(text);
  }
  if (group === "cash") return /cash|para në dorë|para ne dore/.test(text);
  if (group === "pok") return /pok|card|kartë|karte/.test(text);
  return true;
}

function PaymentLedger() {
  const { data: agents } = useListAgents({});
  const { user, hasPermission } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const canEditLedger = hasPermission("can_edit_payments_ledger");
  const hiddenAgentIds = useMemo(
    () => new Set((agents as any[] | undefined)?.filter(a => a.showInReports === false).map(a => a.id) ?? []),
    [agents],
  );
  const visibleAgents = useMemo(
    () => isAdmin ? agents : (agents as any[] | undefined)?.filter(a => a.showInReports !== false),
    [agents, isAdmin],
  );
  const paymentMethods = usePaymentMethods();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<PaymentConfirmation | null>(null);
  const [confirmDlgBusy, setConfirmDlgBusy] = useState(false);
  const confirmInFlight = useRef(false);
  const [bulkNote, setBulkNote] = useState("");
  const [search, setSearch]         = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [confirmedFilter, setConfirmedFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [colF, setColF] = useState({ date: "", agent: "", booking: "", amount: "", method: "", payer: "", confirmed: "", note: "", ref: "" });
  const setCol = (k: string, v: string) => setColF(prev => ({ ...prev, [k]: v }));
  const [rows, setRows]             = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  // Dialogu i anulimit të pagesës — kërkon shënim TË DETYRUESHËM.
  const [historyDlg, setHistoryDlg] = useState<{ payId: number; label: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const patchPaymentRows = useCallback((updates: Map<number, Record<string, any>>) => {
    setRows(current => current.map(row => {
      if (row._batch) {
        const members = (row._members ?? []).map((member: any) => {
          const paymentId = typeof member.id === "string" && member.id.startsWith("pay-")
            ? parseInt(member.id.slice(4), 10)
            : null;
          return paymentId !== null && updates.has(paymentId)
            ? { ...member, ...updates.get(paymentId) }
            : member;
        });
        const active = members.filter((member: any) => member.status !== "cancelled");
        const used = active.length > 0 ? active : members;
        return {
          ...row,
          _members: members,
          confirmed: used.length > 0 && used.every((member: any) => member.confirmed),
        };
      }
      const paymentId = typeof row.id === "string" && row.id.startsWith("pay-")
        ? parseInt(row.id.slice(4), 10)
        : null;
      return paymentId !== null && updates.has(paymentId)
        ? { ...row, ...updates.get(paymentId) }
        : row;
    }));
  }, []);
  const openHistory = useCallback(async (payId: number, label: string) => {
    setHistoryDlg({ payId, label });
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const rows = await apiFetch(`/payments/${payId}/history`);
      setHistoryRows(Array.isArray(rows) ? rows : []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  const [cancelDlg, setCancelDlg] = useState<{ ids: number[]; batch: boolean } | null>(null);
  const [cancelDlgNote, setCancelDlgNote] = useState("");
  const [cancelDlgBusy, setCancelDlgBusy] = useState(false);
  const doCancelPayments = async () => {
    if (!cancelDlg || !cancelDlgNote.trim()) return;
    setCancelDlgBusy(true);
    try {
      const results = await Promise.allSettled(cancelDlg.ids.map((pid: number) =>
        apiFetch(`/payments/${pid}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled", cancelNote: cancelDlgNote.trim() }) })
      ));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed === 0) toast({ title: cancelDlg.batch ? "Pagesa masive u anulua" : "Pagesa u anulua" });
      else toast({ title: "Anulim i pjesshëm", description: `${cancelDlg.ids.length - failed}/${cancelDlg.ids.length} u anuluan; ${failed} dështuan.`, variant: "destructive" });
      setCancelDlg(null);
      setCancelDlgNote("");
      loadLedger();
    } finally {
      setCancelDlgBusy(false);
    }
  };
  const { toast } = useToast();

  const loadLedger = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set("agentId", agentFilter);
      if (dateFrom)    params.set("dateFrom", dateFrom);
      if (dateTo)      params.set("dateTo", dateTo);
      if (search)      params.set("search", search);
      const data = await apiFetch(`/payments/ledger?${params}`);
      setRows(data);
    } catch { setRows([]); }
    finally { setIsLoading(false); }
  }, [agentFilter, dateFrom, dateTo, search]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  // Agjentët e çaktivizuar (showInReports===false) nuk shfaqen fare për jo-admin —
  // as te rreshtat, as te totalet (hyrje/dalje/net).
  const visibleRows = useMemo(
    () => isAdmin ? rows : rows.filter(r => r.agentId == null || !hiddenAgentIds.has(r.agentId)),
    [rows, isAdmin, hiddenAgentIds],
  );

  const filtered = useMemo(() => {
    return visibleRows.filter(r => {
      if (methodFilter) {
        if (!matchesPaymentGroup(r, methodFilter, paymentMethods)) return false;
      }
      if (payerFilter && r.payerType !== payerFilter) return false;
      if (confirmedFilter) {
        const conf = r._batch ? ((r._members ?? []).length > 0 && (r._members ?? []).every((m: any) => m.confirmed)) : !!r.confirmed;
        if (confirmedFilter === "yes" && !conf) return false;
        if (confirmedFilter === "no" && conf) return false;
      }
      if (typeFilter === "in"  && (r.isRefund && r.reference !== "KREDIT-AUTO") && r._source !== "wallet") return false;
      if (typeFilter === "in"  && r._source === "payment" && r.method === "credit") return false;
      if (typeFilter === "out" && (!r.isRefund || r.reference === "KREDIT-AUTO") && r.method !== "credit") return false;
      const inc = (v: any, q: string) => String(v ?? "").toLowerCase().includes(q.toLowerCase());
      if (colF.date && !inc(format(new Date(r.createdAt), "dd MMM yyyy h:mm a"), colF.date)) return false;
      if (colF.agent && !inc(r.agentName, colF.agent)) return false;
      if (colF.booking && !inc(r.bookingRef ?? (r.bookingId ? `#${r.bookingId}` : ""), colF.booking)) return false;
      if (colF.amount && !inc(fmtM(r.amount), colF.amount) && !inc(r.amount, colF.amount)) return false;
      if (colF.method && !inc(`${getRowDisplay(r, paymentMethods).label} ${r.method ?? ""}${r._batch ? " pagesë masive" : ""}`, colF.method)) return false;
      if (colF.payer) {
        if (r._batch) return false;
        if (colF.payer === "invoice" && r.payerType !== "invoice") return false;
        if (colF.payer === "client" && r.payerType !== "client") return false;
      }
      if (colF.confirmed) {
        const conf = r._batch ? ((r._members ?? []).length > 0 && (r._members ?? []).every((m: any) => m.confirmed)) : !!r.confirmed;
        if (colF.confirmed === "yes" && !conf) return false;
        if (colF.confirmed === "no" && conf) return false;
      }
      if (colF.note && !inc(r.confirmNote, colF.note)) return false;
      if (colF.ref && !inc(`${r.invoiceCode ?? ""} ${r.reference ?? ""} ${r.notes ?? ""}`, colF.ref)) return false;
      return true;
    });
  }, [visibleRows, methodFilter, payerFilter, confirmedFilter, typeFilter, colF, paymentMethods]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );
  useEffect(() => {
    setPage(1);
  }, [search, agentFilter, methodFilter, payerFilter, confirmedFilter, typeFilter, dateFrom, dateTo, colF, pageSize]);
  useEffect(() => { setPage(currentPage); }, [currentPage]);
  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedBatches(new Set());
  }, [currentPage, pageSize, search, agentFilter, methodFilter, payerFilter, confirmedFilter, typeFilter, dateFrom, dateTo, colF]);

  // Paginate parent rows first so an expanded batch stays together.
  const displayRows = useMemo(() => {
    const out: any[] = [];
    for (const r of pageRows) {
      out.push(r);
      if (r._batch && expandedBatches.has(r.batchId)) {
        for (const m of (r._members ?? [])) out.push({ ...m, _isMember: true });
      }
    }
    return out;
  }, [pageRows, expandedBatches]);

  const totalIn  = useMemo(() => visibleRows.filter(r => { const t = getMoveType(r); return (t === "payment_generic" || t.startsWith("payment_")) && r.method !== "credit" || t.startsWith("wallet_") || t === "refund_auto"; }).reduce((s, r) => s + Number(r.amount), 0), [visibleRows]);
  const totalOut = useMemo(() => visibleRows.filter(r => getMoveType(r) === "payment_credit" || getMoveType(r) === "refund_manual").reduce((s, r) => s + Number(r.amount), 0), [visibleRows]);

  const hasColF = Object.values(colF).some(v => v !== "");
  const hasActive = search || agentFilter || methodFilter || payerFilter || confirmedFilter || typeFilter || dateFrom || dateTo || hasColF;
  const clearAll  = () => { setSearch(""); setAgentFilter(""); setMethodFilter(""); setPayerFilter(""); setConfirmedFilter(""); setTypeFilter(""); setDateFrom(""); setDateTo(""); setColF({ date: "", agent: "", booking: "", amount: "", method: "", payer: "", confirmed: "", note: "", ref: "" }); };

  const getRealPayId = (row: any): number | null =>
    row._source === "payment" && typeof row.id === "string" && row.id.startsWith("pay-") ? parseInt(row.id.slice(4), 10) : null;
  const isRowSelectable = (row: any) => {
    const isCancelled = row.status === "cancelled";
    const isAutoCredit = row.isRefund && row.reference === "KREDIT-AUTO";
    return canEditLedger && row._source === "payment" && !isCancelled && !isAutoCredit && getRealPayId(row) !== null && !row.confirmed;
  };
  const selectableRows = useMemo(() => pageRows.filter(isRowSelectable), [pageRows, canEditLedger]);
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selectedIds.has(getRealPayId(r)!));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableRows.map(r => getRealPayId(r)!)));
  };
  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectedTotal = useMemo(() => {
    return filtered
      .filter(r => { const pid = getRealPayId(r); return pid !== null && selectedIds.has(pid); })
      .reduce((s, r) => s + Number(r.amount), 0);
  }, [filtered, selectedIds]);
  const downloadLedgerPdf = () => {
    if (filtered.length === 0) {
      toast({ title: "Nuk ka pagesa për të shkarkuar.", variant: "destructive" });
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Regjistri i Pagesave", 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(90);
    const period = dateFrom || dateTo
      ? `Periudha: ${dateFrom || "fillimi"} - ${dateTo || "sot"}`
      : "Periudha: Te gjitha datat";
    doc.text(`${period} | Gjeneruar: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["Data", "Agjenti", "Rezervimi", "Shuma", "Menyra", "Klient / Fature", "Statusi", "Referenca / Shenime"]],
      body: filtered.map(row => {
        const display = getRowDisplay(row, paymentMethods);
        const notes = [row.reference, row.confirmNote, row.notes].filter(Boolean).join(" | ");
        return [
          format(new Date(row.createdAt), "dd/MM/yyyy HH:mm"),
          row.agentName || "-",
          row.bookingRef || (row.bookingId ? `#${row.bookingId}` : "-"),
          `${display.sign === "−" ? "-" : "+"} EUR ${fmtM(row.amount)}`,
          row.status === "cancelled" ? "Anuluar" : display.label,
          row.payerType === "invoice" ? "Fature" : row.payerType === "client" ? "Klient" : "-",
          row.confirmed ? "KONFIRMUAR" : "PENDING",
          notes || "-",
        ];
      }),
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 27 },
        1: { cellWidth: 31 },
        2: { cellWidth: 24 },
        3: { cellWidth: 24 },
        4: { cellWidth: 28 },
        5: { cellWidth: 25 },
        6: { cellWidth: 27 },
      },
    });
    doc.save(`Regjistri_Pagesave_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };
  const bulkConfirm = () => {
    if (selectedIds.size === 0) return;
    setConfirmDlg({
      ids: Array.from(selectedIds),
      kind: "selection",
      amount: selectedTotal,
      note: bulkNote.trim() || undefined,
    });
  };
  const submitConfirmation = async () => {
    if (!confirmDlg || confirmInFlight.current) return;
    if (!canEditLedger) {
      setConfirmDlg(null);
      toast({ title: "Nuk keni leje të konfirmoni pagesa", variant: "destructive" });
      return;
    }
    confirmInFlight.current = true;
    setConfirmDlgBusy(true);
    if (confirmDlg.kind === "selection") setBulkConfirming(true);
    try {
      const body = {
        confirmed: true,
        ...(confirmDlg.note ? { confirmNote: confirmDlg.note } : {}),
      };
      const results = await Promise.allSettled(
        confirmDlg.ids.map(id =>
          apiFetch(`/payments/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        )
      );
      const savedUpdates = new Map<number, Record<string, any>>();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          savedUpdates.set(confirmDlg.ids[index], {
            confirmed: true,
            ...(confirmDlg.note ? { confirmNote: confirmDlg.note } : {}),
          });
        }
      });
      const ok = savedUpdates.size;
      const fail = results.length - ok;
      patchPaymentRows(savedUpdates);
      if (confirmDlg.kind === "single") {
        if (fail) {
          const rejected = results[0];
          toast({
            title: "Gabim",
            description: rejected.status === "rejected" && rejected.reason instanceof Error
              ? rejected.reason.message : "S'u arrit konfirmimi",
            variant: "destructive",
          });
        } else {
          toast({ title: "Pagesa u konfirmua" });
        }
      } else if (confirmDlg.kind === "batch") {
        if (fail === 0) toast({ title: "Pagesa masive u konfirmua" });
        else toast({ title: "Konfirmim i pjesshëm", description: `${ok}/${results.length} u konfirmuan; ${fail} dështuan.`, variant: "destructive" });
      } else {
        toast({
          title: fail === 0 ? `U konfirmuan ${ok} pagesa` : `U konfirmuan ${ok}, dështuan ${fail}`,
          variant: fail === 0 ? "default" : "destructive",
        });
        setSelectedIds(new Set(confirmDlg.ids.filter(id => !savedUpdates.has(id))));
        if (fail === 0) setBulkNote("");
      }
      setConfirmDlg(null);
    } catch (error) {
      toast({ title: "Gabim", description: error instanceof Error ? error.message : "S'u arrit konfirmimi", variant: "destructive" });
    } finally {
      confirmInFlight.current = false;
      setConfirmDlgBusy(false);
      if (confirmDlg.kind === "selection") setBulkConfirming(false);
    }
  };
  const bulkApplyNote = async () => {
    if (selectedIds.size === 0) return;
    const noteTrimmed = bulkNote.trim();
    if (!noteTrimmed) { toast({ title: "Shkruani një shënim së pari", variant: "destructive" }); return; }
    if (!window.confirm(`Vendos shënimin "${noteTrimmed}" te ${selectedIds.size} pagesa?`)) return;
    setBulkConfirming(true);
    const ids = Array.from(selectedIds);
    try {
      const results = await Promise.allSettled(
        ids.map(id =>
          apiFetch(`/payments/${id}`, { method: "PATCH", body: JSON.stringify({ confirmNote: noteTrimmed }) })
        )
      );
      const savedUpdates = new Map<number, Record<string, any>>();
      const failedIds = new Set<number>();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          savedUpdates.set(ids[index], { confirmNote: noteTrimmed });
        } else {
          failedIds.add(ids[index]);
        }
      });
      patchPaymentRows(savedUpdates);
      const ok = savedUpdates.size;
      const fail = results.length - ok;
      toast({
        title: fail === 0 ? `Shënimi u vendos te ${ok} pagesa` : `U vendos te ${ok}, dështuan ${fail}`,
        variant: fail === 0 ? "default" : "destructive",
      });
      setSelectedIds(failedIds);
      if (fail === 0) setBulkNote("");
    } finally {
      setBulkConfirming(false);
    }
  };
  const editRowNote = async (payId: number, currentNote: string) => {
    const next = window.prompt("Shënim manual për këtë pagesë:", currentNote || "");
    if (next === null) return;
    const confirmNote = next.trim() || null;
    if (confirmNote === (currentNote || null)) return;
    try {
      await apiFetch(`/payments/${payId}`, { method: "PATCH", body: JSON.stringify({ confirmNote }) });
      patchPaymentRows(new Map([[payId, { confirmNote }]]));
      toast({ title: "Shënimi u ruajt" });
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "S'u arrit ruajtja", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="page-filter-panel bg-card border rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[200px] flex-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Referenca, shënime, agjent, rezervim..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
            {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-muted-foreground" /></button>}
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Të gjitha agjentet</option>
              {visibleAgents?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Të gjitha pagesat</option>
              <option value="bank">Pagesë Banke</option>
              <option value="cash">Pagesë Cash</option>
              <option value="pok">Kartë (POK)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={payerFilter} onChange={e => setPayerFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Klient / Faturë</option>
              <option value="client">Klient</option>
              <option value="invoice">Faturë</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={confirmedFilter} onChange={e => setConfirmedFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">KONFIRMUAR / PENDING</option>
              <option value="yes">KONFIRMUAR</option>
              <option value="no">PENDING</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-transparent outline-none text-sm text-muted-foreground">
              <option value="">Të gjitha llojet</option>
              <option value="in">Hyrje (+)</option>
              <option value="out">Dalje (−)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <span className="text-xs text-muted-foreground shrink-0">Nga</span>
            <DatePicker value={dateFrom} placeholder="Nga…" onChange={v => { setDateFrom(v); if (dateTo && v > dateTo) setDateTo(v); }} className="border-0 shadow-none px-0 h-auto text-xs" />
          </div>
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <span className="text-xs text-muted-foreground shrink-0">Deri</span>
            <DatePicker value={dateTo} placeholder="Deri…" min={dateFrom || undefined} onChange={v => setDateTo(v)} className="border-0 shadow-none px-0 h-auto text-xs" />
          </div>

          {hasActive && (
            <button onClick={clearAll} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-3.5 w-3.5" /> Pastro
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 px-1 text-xs text-muted-foreground flex-wrap">
          <span>{isLoading ? "Duke ngarkuar..." : `${filtered.length} lëvizje`}</span>
          <span className="text-green-600 font-medium">+€{fmtM(totalIn)} hyrje</span>
          {totalOut > 0 && <span className="text-red-600 font-medium">−€{fmtM(totalOut)} dalje</span>}
          <span className="font-semibold text-foreground">Net: €{fmtM(totalIn - totalOut)}</span>
          <button
            onClick={downloadLedgerPdf}
            disabled={isLoading || filtered.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            Shkarko PDF ({filtered.length})
          </button>
          <button onClick={loadLedger} className="flex items-center gap-1 hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Rifresko
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-amber-500 text-white px-4 py-2.5 rounded-lg shadow-lg border border-amber-600">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-white text-amber-700 rounded-full h-6 min-w-6 px-1.5 flex items-center justify-center font-bold text-xs">
              {selectedIds.size}
            </span>
            pagesa të zgjedhura
          </div>
          <div className="text-sm">
            Total: <span className="font-bold text-base">€{fmtM(selectedTotal)}</span>
          </div>
          <input
            type="text"
            value={bulkNote}
            onChange={e => setBulkNote(e.target.value)}
            placeholder="Shënim për të gjitha (opsional)…"
            disabled={bulkConfirming}
            className="flex-1 min-w-[180px] text-sm px-3 py-1.5 rounded-md bg-white text-gray-900 placeholder:text-gray-400 outline-none border border-amber-600 focus:ring-2 focus:ring-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkNote(""); }}
              className="text-xs px-3 py-1.5 rounded-md bg-white/20 hover:bg-white/30 font-medium"
              disabled={bulkConfirming}
            >
              Pastro
            </button>
            <button
              onClick={bulkApplyNote}
              disabled={bulkConfirming || !bulkNote.trim()}
              className="text-sm px-3 py-1.5 rounded-md bg-amber-700 text-white hover:bg-amber-800 font-medium disabled:opacity-50"
              title="Vendos vetëm shënimin (pa konfirmuar)"
            >
              Vendos shënimin
            </button>
            <button
              onClick={bulkConfirm}
              disabled={bulkConfirming}
              className="text-sm px-4 py-1.5 rounded-md bg-white text-amber-700 hover:bg-amber-50 font-bold flex items-center gap-1.5 disabled:opacity-60"
            >
              {bulkConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : "✓"}
              Konfirmo {bulkNote.trim() ? "+ shënim" : "të gjitha"}
            </button>
          </div>
        </div>
      )}

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableRows.length === 0}
                  title={selectableRows.length === 0 ? "Asnjë pagesë e pakonfirmuar" : "Zgjidh të gjitha të pakonfirmuarat"}
                  className="h-4 w-4 cursor-pointer"
                />
              </TableHead>
              <TableHead className="w-[140px]">Data</TableHead>
              <TableHead>Agjenti</TableHead>
              <TableHead>Rezervimi</TableHead>
              <TableHead>Shuma</TableHead>
              <TableHead>Mënyra e Pagesës</TableHead>
              <TableHead>Klient / Faturë</TableHead>
              <TableHead>Konfirmuar</TableHead>
              <TableHead>Veprime</TableHead>
              <TableHead className="w-[220px]">Shënim Manual</TableHead>
              <TableHead>Referenca / Shënime</TableHead>
            </TableRow>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[36px] py-1.5" />
              <TableHead className="py-1.5">
                <input value={colF.date} onChange={e => setCol("date", e.target.value)} placeholder="Filtro datën…" className="w-full max-w-[120px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <input value={colF.agent} onChange={e => setCol("agent", e.target.value)} placeholder="Agjenti…" className="w-full max-w-[130px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <input value={colF.booking} onChange={e => setCol("booking", e.target.value)} placeholder="Rezervimi…" className="w-full max-w-[100px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <input value={colF.amount} onChange={e => setCol("amount", e.target.value)} placeholder="Shuma…" className="w-full max-w-[80px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <input value={colF.method} onChange={e => setCol("method", e.target.value)} placeholder="Mënyra…" className="w-full max-w-[110px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <select value={colF.payer} onChange={e => setCol("payer", e.target.value)} className="h-7 px-1 text-xs font-normal border rounded bg-background">
                  <option value="">Të gjitha</option>
                  <option value="client">👤 Klient</option>
                  <option value="invoice">📄 Faturë</option>
                </select>
              </TableHead>
              <TableHead className="py-1.5">
                <select value={colF.confirmed} onChange={e => setCol("confirmed", e.target.value)} className="h-7 px-1 text-xs font-normal border rounded bg-background">
                  <option value="">Të gjitha</option>
                  <option value="yes">✓ KONFIRMUAR</option>
                  <option value="no">PENDING</option>
                </select>
              </TableHead>
              <TableHead className="py-1.5" />
              <TableHead className="py-1.5">
                <input value={colF.note} onChange={e => setCol("note", e.target.value)} placeholder="Shënimi…" className="w-full max-w-[140px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
              <TableHead className="py-1.5">
                <input value={colF.ref} onChange={e => setCol("ref", e.target.value)} placeholder="Referenca…" className="w-full max-w-[160px] h-7 px-2 text-xs font-normal border rounded bg-background" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                {hasActive ? "Nuk ka lëvizje me këto kritere." : "Nuk ka lëvizje."}
              </TableCell></TableRow>
            ) : (
              displayRows.map((row: any) => {
                if (row._batch) {
                  const isExpanded = expandedBatches.has(row.batchId);
                  const members = row._members ?? [];
                  const bdef = getRowDisplay(row, paymentMethods);
                  const bpmColor = paymentMethods.find((m: any) => m.name === row.method)?.color;
                  const unconfirmedIds = members.filter((m: any) => !m.confirmed && m.status !== "cancelled").map((m: any) => getRealPayId(m)).filter((x: number | null): x is number => x !== null);
                  const cancelIds = members.filter((m: any) => m.status !== "cancelled").map((m: any) => getRealPayId(m)).filter((x: number | null): x is number => x !== null);
                  const allConfirmed = members.length > 0 && members.every((m: any) => m.confirmed);
                  const toggleExpand = () => setExpandedBatches(prev => { const n = new Set(prev); n.has(row.batchId) ? n.delete(row.batchId) : n.add(row.batchId); return n; });
                  const confirmBatch = () => {
                    if (unconfirmedIds.length === 0) return;
                    setConfirmDlg({
                      ids: unconfirmedIds,
                      kind: "batch",
                      amount: members.filter((m: any) => !m.confirmed && m.status !== "cancelled")
                        .reduce((sum: number, m: any) => sum + Number(m.amount), 0),
                      label: row.invoiceCode || row.bookingRef,
                      method: bdef.label,
                    });
                  };
                  const cancelBatch = () => {
                    if (cancelIds.length === 0) return;
                    setCancelDlgNote("");
                    setCancelDlg({ ids: cancelIds, batch: true });
                  };
                  return (
                    <TableRow key={row.id} className="bg-indigo-50/50 hover:bg-indigo-50 border-y border-indigo-200">
                      <TableCell className="w-[36px]">
                        <button onClick={toggleExpand} className="p-0.5 rounded hover:bg-indigo-100 text-indigo-600" title={isExpanded ? "Mbyll biletat" : "Shfaq biletat"}>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(row.createdAt), "dd MMM yyyy h:mm a")}</TableCell>
                      <TableCell>{row.agentName ? <span className="inline-flex items-center gap-1 text-xs font-medium"><AgentRankBadge agentName={row.agentName} />{row.agentName}</span> : <span className="text-muted-foreground/40">—</span>}</TableCell>
                      <TableCell>
                        <button onClick={toggleExpand} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline">
                          <Layers className="h-3.5 w-3.5" /> {row.bookingRef}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-foreground">{bdef.sign}€{fmtM(row.amount)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-300">PAGESË MASIVE</Badge>
                          <Badge variant="outline" className="text-[10px] font-medium" style={bpmColor ? { color: bpmColor, borderColor: bpmColor } : undefined}>{bdef.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-muted-foreground/40 text-xs">—</span></TableCell>
                      <TableCell>
                        {canEditLedger && unconfirmedIds.length > 0 ? (
                          <button
                            onClick={confirmBatch}
                            title="Kliko për të konfirmuar të gjitha pagesat"
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                          >
                            PENDING
                          </button>
                        ) : allConfirmed ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-300">✓ KONFIRMUAR</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">PENDING</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {canEditLedger && cancelIds.length > 0 && (
                            <button onClick={cancelBatch} className="text-[10px] text-red-600 hover:underline font-semibold">Anulo të gjitha</button>
                          )}
                          <a
                            href={`${API}/payments/batch/${row.batchId}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                            title={row.invoiceCode ? `Shkarko Faturën Masive ${row.invoiceCode}` : "Shkarko Faturën Masive"}
                          >
                            <Download className="h-3 w-3" /> Faturë
                          </a>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-muted-foreground/40 text-xs">—</span></TableCell>
                      <TableCell className="max-w-[320px]">
                        {row.invoiceCode && (
                          <div className="font-mono text-[10px] font-semibold text-slate-600" title="Kodi i faturës masive">{row.invoiceCode}</div>
                        )}
                        {row.notes && (
                          <div className="text-xs text-muted-foreground truncate" title={row.notes}>{row.notes}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }
                const mt = getMoveType(row);
                const def = getRowDisplay(row, paymentMethods);
                const pmColor = paymentMethods.find(m => m.name === row.method)?.color;
                const isCancelled = row.status === "cancelled";
                const isAutoCredit = row.isRefund && row.reference === "KREDIT-AUTO";
                const canCancel = canEditLedger && row._source === "payment" && !isCancelled && !isAutoCredit && typeof row.bookingId === "number";
                const realPayId = row._source === "payment" && typeof row.id === "string" && row.id.startsWith("pay-") ? parseInt(row.id.slice(4), 10) : null;
                const canConfirm = canEditLedger && row._source === "payment" && !isCancelled && !isAutoCredit && realPayId !== null;
                const isConfirmed = !!row.confirmed;
                const onCancelRow = () => {
                  if (!realPayId) return;
                  setCancelDlgNote("");
                  setCancelDlg({ ids: [realPayId], batch: false });
                };
                const onToggleConfirm = async () => {
                  if (!realPayId) return;
                  if (!isConfirmed) {
                    setConfirmDlg({
                      ids: [realPayId],
                      kind: "single",
                      amount: Number(row.amount),
                      label: row.invoiceCode || row.bookingRef || `#${realPayId}`,
                      method: def.label,
                    });
                    return;
                  }
                  try {
                    await apiFetch(`/payments/${realPayId}`, { method: "PATCH", body: JSON.stringify({ confirmed: false }) });
                    patchPaymentRows(new Map([[realPayId, { confirmed: false }]]));
                    toast({ title: "Pagesa u zhbllokua nga konfirmimi" });
                  } catch (e: any) {
                    toast({ title: "Gabim", description: e?.message || "S'u arrit konfirmimi", variant: "destructive" });
                  }
                };
                const canTogglePayerType = canEditLedger && row._source === "payment" && !isCancelled && !isAutoCredit && realPayId !== null;
                const onTogglePayerType = async () => {
                  if (!realPayId) return;
                  const next = row.payerType === "invoice" ? "client" : "invoice";
                  const nextLabel = next === "invoice" ? "📄 FATURË" : "👤 KLIENT";
                  if (!window.confirm(`Ta ndryshoj këtë pagesë në ${nextLabel}?`)) return;
                  try {
                    await apiFetch(`/payments/${realPayId}`, { method: "PATCH", body: JSON.stringify({ payerType: next }) });
                    toast({ title: `Pagesa u shënua si ${next === "invoice" ? "Faturë" : "Klient"}` });
                    loadLedger();
                  } catch (e: any) {
                    toast({ title: "Gabim", description: e?.message || "S'u arrit ndryshimi", variant: "destructive" });
                  }
                };
                const isSelectable = canConfirm && !isConfirmed && realPayId !== null;
                const isSelected = realPayId !== null && selectedIds.has(realPayId);
                return (
                  <TableRow key={row.id} className={`${isCancelled ? "bg-red-50 opacity-70" : def.bg} ${isSelected ? "!bg-amber-50" : ""} ${row._isMember ? "border-l-2 border-l-indigo-300" : ""}`}>
                    <TableCell className="w-[36px]">
                      {isSelectable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(realPayId!)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className={`text-xs text-muted-foreground whitespace-nowrap ${isCancelled ? "line-through text-red-500" : ""}`}>
                      {format(new Date(row.createdAt), "dd MMM yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {row.agentName ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${isCancelled ? "line-through text-red-500" : ""}`}>
                          <AgentRankBadge agentName={row.agentName} />
                          {row.agentName}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell>
                      {row.bookingId ? (
                        <button onClick={() => setSelectedBookingId(row.bookingId)} className={`hover:underline font-mono text-xs font-semibold ${isCancelled ? "line-through text-red-500" : "text-primary"}`}>
                          {row.bookingRef ?? `#${row.bookingId}`}
                        </button>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-bold ${isCancelled ? "line-through text-red-500" : "text-foreground"}`}
                      >
                        {def.sign}€{fmtM(row.amount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${isCancelled ? "border-red-400 text-red-700 bg-red-50" : def.color}`}
                        style={!isCancelled && pmColor && mt === "payment_generic" ? { color: pmColor, borderColor: pmColor } : undefined}
                      >
                        {isCancelled ? "Anuluar" : def.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.payerType === "invoice" && (
                          canTogglePayerType ? (
                            <button
                              onClick={onTogglePayerType}
                              title="Kliko për ta ndryshuar në KLIENT"
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 cursor-pointer"
                            >
                              📄 FATURË
                            </button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700 border-blue-300">📄 FATURË</Badge>
                          )
                        )}
                        {row.payerType === "client" && (
                          canTogglePayerType ? (
                            <button
                              onClick={onTogglePayerType}
                              title="Kliko për ta ndryshuar në FATURË"
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-300 hover:bg-green-100 cursor-pointer"
                            >
                              👤 KLIENT
                            </button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-bold bg-green-50 text-green-700 border-green-300">👤 KLIENT</Badge>
                          )
                        )}
                        {!row.payerType && <span className="text-muted-foreground/40 text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {canConfirm && (
                          isConfirmed ? (
                            <button
                              onClick={onToggleConfirm}
                              title="Klikoni për të zhbërë konfirmimin"
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
                            >
                              ✓ KONFIRMUAR
                            </button>
                          ) : (
                            <button
                              onClick={onToggleConfirm}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500 text-white border border-amber-600 hover:bg-amber-600 animate-pulse"
                            >
                              PENDING
                            </button>
                          )
                        )}
                        {!canConfirm && (isConfirmed ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-300">✓ KONFIRMUAR</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">PENDING</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {canCancel && (
                          <button onClick={onCancelRow} className="text-[10px] text-red-600 hover:underline font-semibold">Anulo</button>
                        )}
                        {realPayId !== null && (
                          <button
                            onClick={() => openHistory(realPayId, row.invoiceCode || row.bookingRef || `#${realPayId}`)}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-violet-300 text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1"
                            title="Historiku i pagesës — çdo lëvizje (krijim, ndryshim, anulim, konfirmim…)"
                          >
                            <History className="h-3 w-3" /> Historiku
                          </button>
                        )}
                        {realPayId !== null && !row._isMember && (
                          <a
                            href={`${API}/payments/${realPayId}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                            title={row.invoiceCode ? `Shkarko Faturën ${row.invoiceCode}` : "Shkarko Faturën"}
                          >
                            <Download className="h-3 w-3" /> Faturë
                          </a>
                        )}
                        {row._source === "wallet" && row.invoiceCode && (
                          <a
                            href={`${API}/agents/credits/${String(row.id).replace("wallet-", "")}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                            title={`Shkarko Faturën e Kreditit ${row.invoiceCode}`}
                          >
                            <Download className="h-3 w-3" /> Faturë
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`max-w-[220px] ${isCancelled ? "line-through text-red-500" : ""}`}>
                      <div className="flex items-start gap-1.5">
                        <div className="flex-1 min-w-0">
                          {row.confirmNote ? (
                            <div className="text-xs text-foreground font-medium truncate" title={row.confirmNote}>{row.confirmNote}</div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </div>
                        {canEditLedger && realPayId !== null && !isCancelled && !isAutoCredit && (
                          <button
                            onClick={() => editRowNote(realPayId, row.confirmNote || "")}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 font-medium shrink-0"
                            title={row.confirmNote ? "Ndrysho shënimin manual" : "Shto shënim manual"}
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`max-w-[320px] ${isCancelled ? "line-through text-red-500" : ""}`}>
                      {row.invoiceCode && !row._isMember && (
                        <div className="font-mono text-[10px] font-semibold text-slate-600" title="Kodi i faturës">{row.invoiceCode}</div>
                      )}
                      {row.reference && row.reference !== "KREDIT-AUTO" && (
                        <div className="font-mono text-xs text-muted-foreground">{row.reference}</div>
                      )}
                      {row.notes && (
                        <div className="text-xs text-muted-foreground truncate" title={row.notes}>{row.notes}</div>
                      )}
                      {!row.invoiceCode && !row.reference && !row.notes && <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Rezultate për faqe
            <select
              aria-label="Rezultate për faqe"
              className="h-9 rounded-md border bg-background px-2"
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
            >
              {[10, 30, 50].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <span className="text-muted-foreground">
            {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} nga {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={isLoading || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Para</Button>
          <span>Faqja {currentPage} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={isLoading || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!confirmDlg} onOpenChange={open => { if (!open && !confirmDlgBusy) setConfirmDlg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmo {confirmDlg?.ids.length === 1 ? "pagesën" : "pagesat"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDlg?.kind === "batch"
              ? "Pagesat në pritje të kësaj pagese masive do të kalojnë në statusin KONFIRMUAR."
              : confirmDlg?.kind === "selection"
                ? "Pagesat e zgjedhura do të kalojnë në statusin KONFIRMUAR."
                : "Kjo pagesë do të kalojë në statusin KONFIRMUAR."}
          </p>
          <div className="overflow-hidden rounded-lg border text-sm">
            {confirmDlg?.label && <div className="flex justify-between gap-4 border-b px-4 py-2.5"><span className="text-muted-foreground">Referenca</span><strong className="text-right break-all">{confirmDlg.label}</strong></div>}
            {confirmDlg?.method && <div className="flex justify-between gap-4 border-b px-4 py-2.5"><span className="text-muted-foreground">Mënyra</span><strong className="text-right">{confirmDlg.method}</strong></div>}
            <div className="flex justify-between gap-4 border-b px-4 py-2.5"><span className="text-muted-foreground">Numri i pagesave</span><strong>{confirmDlg?.ids.length}</strong></div>
            <div className="flex justify-between gap-4 border-b px-4 py-2.5"><span className="text-muted-foreground">Shuma</span><strong>€{fmtM(confirmDlg?.amount ?? 0)}</strong></div>
            <div className="flex justify-between gap-4 px-4 py-2.5"><span className="text-muted-foreground">Statusi</span><strong className="text-right">PENDING → KONFIRMUAR</strong></div>
          </div>
          {confirmDlg?.note && <p className="text-xs text-muted-foreground">Shënimi për të gjitha: <span className="font-medium text-foreground">{confirmDlg.note}</span></p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" disabled={confirmDlgBusy} onClick={() => setConfirmDlg(null)}>Anulo</Button>
            <Button disabled={confirmDlgBusy} onClick={submitConfirmation}>
              {confirmDlgBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Konfirmo {confirmDlg?.ids.length === 1 ? "pagesën" : "pagesat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>

      {/* Historiku i pagesës — çdo lëvizje me datë/orë + emër përdoruesi */}
      <Dialog open={!!historyDlg} onOpenChange={open => { if (!open) setHistoryDlg(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <History className="h-4 w-4" /> Historiku i Pagesës {historyDlg?.label && <span className="font-mono text-sm text-slate-500">{historyDlg.label}</span>}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">S'ka lëvizje të regjistruara për këtë pagesë. (Historiku regjistrohet për lëvizjet e reja — pagesat e vjetra s'kanë histori të mëparshme.)</p>
          ) : (
            <div className="space-y-2">
              {historyRows.map((h: any) => {
                const AL: Record<string, { label: string; cls: string }> = {
                  created:       { label: "Krijim",            cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                  updated:       { label: "Ndryshim",          cls: "bg-blue-100 text-blue-700 border-blue-300" },
                  cancelled:     { label: "Anulim",            cls: "bg-red-100 text-red-700 border-red-300" },
                  restored:      { label: "Rikthim",           cls: "bg-amber-100 text-amber-700 border-amber-300" },
                  confirmed:     { label: "Konfirmim",         cls: "bg-green-100 text-green-700 border-green-300" },
                  unconfirmed:   { label: "Heqje konfirmimi",  cls: "bg-orange-100 text-orange-700 border-orange-300" },
                  refund_created:{ label: "Rimbursim",         cls: "bg-purple-100 text-purple-700 border-purple-300" },
                  refunded:      { label: "U rimbursua",       cls: "bg-purple-100 text-purple-700 border-purple-300" },
                };
                const a = AL[h.action] ?? { label: h.action, cls: "bg-slate-100 text-slate-700 border-slate-300" };
                return (
                  <div key={h.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${a.cls}`}>{a.label}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{format(new Date(h.createdAt), "dd MMM yyyy h:mm a")}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mb-1">
                      nga <span className="font-semibold text-slate-800">{h.userName ?? "—"}</span>{h.userRole ? <span className="text-slate-400"> ({h.userRole})</span> : null}
                    </div>
                    {h.fieldName && <div className="font-semibold text-slate-700">{h.fieldName}</div>}
                    {(h.oldValue || h.newValue) && (
                      <div className="text-slate-700">
                        {h.oldValue && <span className="line-through text-red-500 mr-1.5">{h.oldValue}</span>}
                        {h.newValue && <span className="text-emerald-700 font-medium">{h.newValue}</span>}
                      </div>
                    )}
                    {h.note && <div className="mt-1 text-slate-500 italic whitespace-pre-wrap">{h.note}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogu i anulimit të pagesës — shënim i detyrueshëm */}
      <Dialog open={!!cancelDlg} onOpenChange={open => { if (!open) { setCancelDlg(null); setCancelDlgNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {cancelDlg?.batch ? `Anulo ${cancelDlg.ids.length} pagesat e pagesës masive?` : "Anulo këtë pagesë?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pagesa do të hiqet nga llogaritë por do të mbahet në histori me vijë të kuqe.
          </p>
          <div>
            <label className="text-xs font-semibold text-foreground">Shënimi i anulimit <span className="text-red-600">*</span></label>
            <Textarea
              value={cancelDlgNote}
              onChange={e => setCancelDlgNote(e.target.value)}
              placeholder="Pse po anulohet kjo pagesë? (i detyrueshëm)"
              rows={3}
              className="mt-1"
              autoFocus
            />
            {!cancelDlgNote.trim() && <p className="text-[11px] text-red-500 mt-1">Shënimi është i detyrueshëm për të anuluar.</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setCancelDlg(null); setCancelDlgNote(""); }}>Mbylle</Button>
            <Button
              variant="destructive"
              disabled={!cancelDlgNote.trim() || cancelDlgBusy}
              onClick={doCancelPayments}
            >
              {cancelDlgBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Anulo Pagesën
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Report Download ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "Biletë", cancelled: "Anuluar",
};
const PASSENGER_TYPES: Record<string, string> = { adult: "I rritur", child: "Fëmijë", infant: "Foshnjë" };
const REPORT_METHOD_LABELS: Record<string, string> = { cash: "Para në dorë", bank_transfer: "Bankë", card: "Kartë", other: "Tjetër" };

function generateReportHTML(data: any[], filters: { agentName: string; customerName: string; debtFilter: string }, opts?: { hideCommission?: boolean }) {
  const hideComm = !!opts?.hideCommission;
  const now = format(new Date(), "dd/MM/yyyy h:mm a");
  const totalSales = data.reduce((s, b) => s + b.totalAmount, 0);
  const totalPaid = data.reduce((s, b) => s + b.paidAmount, 0);
  const totalDue = data.reduce((s, b) => s + dueEuro(b.dueAmount), 0);
  const totalCommission = data.reduce((s, b) => s + (b.commissionAmount ?? 0), 0);

  const debtLabels: Record<string, string> = { all: "Të gjitha", debt: "Me borxh", "no-debt": "Pa borxh" };

  const rows = data.map((b, i) => {
    const passengersList = b.passengers.map((p: any) => `${p.firstName} ${p.lastName} (${PASSENGER_TYPES[p.type] || p.type})`).join("<br/>");
    const bgRow = i % 2 === 0 ? "#fff" : "#f8fafc";
    const dueColor = dueEuro(b.dueAmount) > 0 ? "#dc2626" : "#16a34a";
    return `
      <tr style="background:${bgRow}">
        <td>${i + 1}</td>
        <td><strong>${b.bookingRef}</strong>${b.pnr ? `<br/><span style="font-family:monospace;color:#2563eb;font-size:11px">PNR: ${b.pnr}</span>` : ""}${cpCodeOf(b) ? `<br/><span style="font-family:monospace;color:#0e7490;font-size:11px">CP: ${cpCodeOf(b)}</span>` : ""}</td>
        <td>${b.customerName}${b.agentName ? `<br/><span style="color:#64748b;font-size:11px">${b.agentName}</span>` : ""}</td>
        <td>${b.flight ? `${b.flight.airline} ${fmtFlightNum(b.flight.flightNumber)}<br/><strong>${b.flight.fromCity} → ${b.flight.toCity}</strong><br/>${b.flight.departureDate} ${fmtAmPm(b.flight.departureTime)}` : "-"}</td>
        <td>${passengersList || "-"}</td>
        <td style="text-align:right">€${fmtM(b.totalAmount)}</td>
        <td style="text-align:right;color:#16a34a">€${fmtM(b.paidAmount)}</td>
        <td style="text-align:right;color:${dueColor};font-weight:bold">€${fmtM(dueEuro(b.dueAmount))}</td>
        ${hideComm ? "" : `<td style="text-align:right;color:#7c3aed">${b.commissionAmount != null ? "€" + fmtM(b.commissionAmount) : "-"}</td>`}
        <td><span style="background:${b.status === "ticketed" ? "#16a34a" : b.status === "confirmed" ? "#2563eb" : b.status === "cancelled" ? "#dc2626" : "#f59e0b"};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px">${STATUS_LABELS[b.status] || b.status}</span></td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8"/>
<title>Raport Biletash – Kings Travel</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px; }
  h1 { font-size: 22px; color: #1e40af; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 16px; }
  .filters { display: flex; gap: 24px; background: #f1f5f9; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 11px; }
  .filter-item strong { display: block; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; vertical-align: top; line-height: 1.5; }
  .summary { display: grid; grid-template-columns: repeat(${hideComm ? 3 : 4}, 1fr); gap: 12px; margin-top: 8px; }
  .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .summary-box .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
  .summary-box .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .footer { margin-top: 24px; color: #94a3b8; font-size: 10px; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 0; } }
  ${REPORT_TOOLBAR_CSS}
</style>
</head>
<body>
${reportToolbarHTML({ filename: hideComm ? "Raport_Biletash_Pa_Komision" : "Raport_Biletash", orientation: "landscape" })}
<h1>Raport Biletash</h1>
<div class="meta">Gjeneruar: ${now} &nbsp;·&nbsp; ${data.length} rezervime</div>
<div class="filters">
  <div class="filter-item"><strong>Agjencia / Klienti</strong>${filters.agentName || filters.customerName || "Të gjithë"}</div>
  <div class="filter-item"><strong>Filteri i Borxhit</strong>${debtLabels[filters.debtFilter] || "Të gjitha"}</div>
  <div class="filter-item"><strong>Total Shitje</strong>€${fmtM(totalSales)}</div>
  ${hideComm ? "" : `<div class="filter-item"><strong>Total Komisioni</strong><span style="color:#7c3aed">€${fmtM(totalCommission)}</span></div>`}
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Ref / PNR</th>
      <th>Klienti / Agjencia</th>
      <th>Fluturimi</th>
      <th>Pasagjerët</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:right">Paguar</th>
      <th style="text-align:right">Mbetet</th>
      ${hideComm ? "" : `<th style="text-align:right">Komisioni</th>`}
      <th>Statusi</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="summary">
  <div class="summary-box"><div class="label">Shitjet Totale</div><div class="value">€${fmtM(totalSales)}</div></div>
  <div class="summary-box"><div class="label">Total Paguar</div><div class="value" style="color:#16a34a">€${fmtM(totalPaid)}</div></div>
  <div class="summary-box"><div class="label">Total Borxh</div><div class="value" style="color:#dc2626">€${fmtM(totalDue)}</div></div>
  ${hideComm ? "" : `<div class="summary-box"><div class="label">Total Komisioni</div><div class="value" style="color:#7c3aed">€${fmtM(totalCommission)}</div></div>`}
</div>
<div class="footer">Kings Travel &nbsp;·&nbsp; Raport i gjeneruar automatikisht &nbsp;·&nbsp; ${now}</div>
</body>
</html>`;
}

function ReportDownload() {
  const { data: agents } = useListAgents({});
  const { user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const hiddenAgentIds = useMemo(
    () => new Set((agents as any[] | undefined)?.filter(a => a.showInReports === false).map(a => a.id) ?? []),
    [agents],
  );
  const visibleAgents = useMemo(
    () => isAdmin ? agents : (agents as any[] | undefined)?.filter(a => a.showInReports !== false),
    [agents, isAdmin],
  );
  const [agentId, setAgentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [debtFilter, setDebtFilter] = useState("all");
  const [reportData, setReportData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  const agentName = agents?.find((a: any) => String(a.id) === agentId)?.name ?? "";

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (agentId) q.set("agentId", agentId);
      if (customerName.trim()) q.set("customerName", customerName.trim());
      if (debtFilter !== "all") q.set("debtFilter", debtFilter);
      const data = await apiFetch(`/payments/report?${q.toString()}`);
      setReportData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agentId, customerName, debtFilter]);

  // Agjentët e çaktivizuar (showInReports===false) nuk shfaqen fare te raporti
  // për userat jo-admin (as te tabela, as te totalet, as te PDF).
  const visibleReport = useMemo(
    () => !reportData ? null
      : isAdmin ? reportData
      : reportData.filter((b: any) => b.agentId == null || !hiddenAgentIds.has(b.agentId)),
    [reportData, isAdmin, hiddenAgentIds],
  );

  const handleDownload = () => {
    if (!visibleReport || visibleReport.length === 0) return;
    const html = generateReportHTML(visibleReport, { agentName, customerName, debtFilter });
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const totalSales = visibleReport?.reduce((s, b) => s + b.totalAmount, 0) ?? 0;
  const totalPaid = visibleReport?.reduce((s, b) => s + b.paidAmount, 0) ?? 0;
  const totalDue = visibleReport?.reduce((s, b) => s + dueEuro(b.dueAmount), 0) ?? 0;
  const totalComm = visibleReport?.reduce((s, b) => s + (b.commissionAmount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-muted/30 border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Filtrat e Raportit</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agjencia</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              value={agentId}
              onChange={e => { setAgentId(e.target.value); setReportData(null); }}
            >
              <option value="">Të gjitha agjencitë</option>
              {visibleAgents?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Klienti (kërko)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); setReportData(null); }}
                placeholder="Emri i klientit..."
                className="w-full border rounded-md pl-8 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Filteri i Borxhit</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              value={debtFilter}
              onChange={e => { setDebtFilter(e.target.value); setReportData(null); }}
            >
              <option value="all">Të gjitha rezervimet</option>
              <option value="debt">Vetëm me borxh</option>
              <option value="no-debt">Vetëm pa borxh (paguar plotë)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Duke ngarkuar..." : "Gjenero Raportin"}
          </button>
          {visibleReport && visibleReport.length > 0 && (
            <>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <FileDown className="h-4 w-4" />
                Shkarko PDF ({visibleReport.length} biletë)
              </button>
              <button
                onClick={() => {
                  const html = generateReportHTML(visibleReport ?? [], { agentName, customerName, debtFilter }, { hideCommission: true });
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(html); win.document.close(); }
                }}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <FileDown className="h-4 w-4" />
                PDF pa Komisione
              </button>
              <button
                onClick={() => {
                  const agentObj = agents?.find((a: any) => String(a.id) === agentId);
                  const subtitle = [
                    agentObj ? agentObj.name : agentName || "Të gjithë agjentët",
                    customerName ? `Klient: ${customerName}` : "",
                    debtFilter === "debt" ? "Me borxh" : debtFilter === "no-debt" ? "Pa borxh" : "",
                  ].filter(Boolean).join(" · ");
                  const html = generateDetailedReportHTML(visibleReport ?? [], "Raport i Detajuar – Pagesat", subtitle);
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(html); win.document.close(); }
                }}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <FileDown className="h-4 w-4" />
                Raport i Detajuar
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
      </div>

      {/* Summary cards */}
      {visibleReport && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Biletë gjithsej", value: visibleReport.length.toString(), color: "text-foreground" },
              { label: "Shitjet Totale", value: `€${fmtM(totalSales)}`, color: "text-primary" },
              { label: "Total Paguar", value: `€${fmtM(totalPaid)}`, color: "text-green-600" },
              { label: "Total Borxh", value: `€${fmtM(totalDue)}`, color: "text-destructive" },
              { label: "Komisioni Total", value: `€${fmtM(totalComm)}`, color: "text-purple-600" },
            ].map(c => (
              <div key={c.label} className="border rounded-lg p-3 bg-white">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className={`text-xl font-bold mt-0.5 ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Preview table */}
          {visibleReport.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
              Nuk ka rezervime për filtrat e zgjedhura.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Ref / PNR</TableHead>
                    <TableHead>Klienti</TableHead>
                    <TableHead>Agjencia</TableHead>
                    <TableHead>Fluturimi</TableHead>
                    <TableHead>Pasagjerë</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paguar</TableHead>
                    <TableHead className="text-right">Borxh</TableHead>
                    <TableHead className="text-right">Komisioni</TableHead>
                    <TableHead>Statusi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReport.map((b: any) => (
                    <TableRow key={b.id} className={b.status === "cancelled" ? "!bg-red-50/70 line-through text-red-700/70 [&_*]:line-through [&_*]:!text-red-700/70" : ""}>
                      <TableCell>
                        <button onClick={() => setSelectedBookingId(b.id)} className="font-mono font-semibold text-primary hover:underline text-xs">
                          {b.bookingRef}
                        </button>
                        {b.pnr && (
                          <div className="font-mono text-[10px] text-blue-600 mt-0.5">PNR: {b.pnr}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{b.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.agentName || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {b.flight ? (
                          <div>
                            <div className="font-medium">{b.flight.fromCity} → {b.flight.toCity}</div>
                            <div className="text-xs text-muted-foreground">{b.flight.departureDate}</div>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.passengers.length} pasagjer
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">€{fmtM(b.totalAmount)}</TableCell>
                      <TableCell className="text-right text-sm text-green-600">€{fmtM(b.paidAmount)}</TableCell>
                      <TableCell className={`text-right font-bold text-sm ${dueEuro(b.dueAmount) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        €{fmtM(dueEuro(b.dueAmount))}
                      </TableCell>
                      <TableCell className="text-right text-sm text-purple-600">
                        {b.commissionAmount != null ? `€${fmtM(b.commissionAmount)}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${b.status === "ticketed" ? "bg-green-500" : b.status === "confirmed" ? "bg-blue-500" : b.status === "cancelled" ? "bg-red-500" : "bg-yellow-500"}`}>
                          {STATUS_LABELS[b.status] || b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Client Payment tab ────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", confirmed: "Konfirmuar", ticketed: "Biletë",
  cancelled: "Anuluar", pending: "Pritje",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  ticketed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-orange-100 text-orange-800",
};

function ClientPayment() {
  const dynamicMethods = usePaymentMethods();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Payment form per booking
  const [openId, setOpenId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [payerType, setPayerType] = useState<"invoice" | "client" | "">("");
  const [saving, setSaving] = useState(false);

  const doSearch = useCallback(async (term?: string) => {
    const q = new URLSearchParams({ noAgent: "1" });
    const s = (term ?? search).trim();
    if (s) q.set("search", s);
    setSearching(true);
    setSearched(false);
    try {
      const data = await apiFetch(`/bookings?${q}`);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [search]);

  const openForm = (id: number) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setAmount(""); setMethod(""); setReference(""); setNotes("");
  };

  const submitPayment = async (bookingId: number, due: number) => {
    if (!method.trim() || !dynamicMethods.some(pm => pm.name === method)) {
      toast({ title: "Zgjidh një mënyrë të vlefshme pagese", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt === 0) { toast({ title: "Shuma nuk mund të jetë 0", variant: "destructive" }); return; }
    if (amt > due + 0.001) {
      toast({ title: `Shuma kalon borxhin. Maksimumi i lejuar: €${fmtM(due)}`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch(`${API}/bookings/${bookingId}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, reference: reference || undefined, notes: notes || undefined, payerType: payerType || undefined }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "Gabim"); }
      toast({ title: "Pagesa u regjistrua me sukses" });
      setOpenId(null);
      doSearch();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-muted/30 border rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" /> Kërko Rezervimin e Klientit
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="Emri, email ose kodi rezervimit (p.sh. FLTVOTFD0)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            className="flex-1"
          />
          <Button onClick={() => doSearch()} disabled={searching} className="gap-1.5">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Kërko
          </Button>
          {searched && (
            <Button variant="outline" onClick={() => { setSearch(""); setResults([]); setSearched(false); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!searched && (
          <p className="text-xs text-muted-foreground mt-2">Shtyp emrin, email-in ose kodin e rezervimit dhe kliko "Kërko".</p>
        )}
      </div>

      {searched && results.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">Asnjë rezervim i gjetur për klientin.</div>
      )}

      {results.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Kodi</TableHead>
                <TableHead>Klienti</TableHead>
                <TableHead>Fluturimi</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Statusi</TableHead>
                <TableHead className="text-right">Totali</TableHead>
                <TableHead className="text-right text-green-600">Paguar</TableHead>
                <TableHead className="text-right text-destructive">Mbetet</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((b: any) => {
                const due = dueEuro(b.dueAmount);
                const isOpen = openId === b.id;
                return (
                  <>
                    <TableRow key={b.id} className={b.status === "cancelled" ? "!bg-red-50/70 line-through text-red-700/70 [&_*]:line-through [&_*]:!text-red-700/70" : (isOpen ? "bg-primary/5" : due > 0 ? "bg-red-50/30" : "")}>
                      <TableCell className="font-mono text-xs font-bold">{b.bookingRef}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{b.customerName}</div>
                        {b.customerEmail && <div className="text-xs text-muted-foreground">{b.customerEmail}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{b.fromCity} → {b.toCity}</TableCell>
                      <TableCell className="text-sm">{b.departureDate ? format(new Date(b.departureDate), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? ""}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">€{fmtM(b.totalAmount)}</TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">€{fmtM(b.paidAmount)}</TableCell>
                      <TableCell className={`text-right font-bold ${due > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        €{fmtM(due)}
                      </TableCell>
                      <TableCell>
                        {due > 0 ? (
                          <Button size="sm" variant={isOpen ? "secondary" : "default"} onClick={() => openForm(b.id)} className="text-xs h-7">
                            {isOpen ? "Mbyll" : "Shto Pagesë"}
                          </Button>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> E shlyer
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`form-${b.id}`} className="bg-primary/5">
                        <TableCell colSpan={9} className="py-4">
                          <div className="max-w-2xl mx-auto space-y-4">
                            <div className="text-sm font-semibold text-primary mb-1">
                              Regjistro pagesën — {b.customerName} ({b.bookingRef}) · Mbetet: €{fmtM(due)}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Shuma (€) *</label>
                                <Input
                                  type="text" inputMode="numeric"
                                  className="no-number-spin"
                                  value={amount} onChange={e => setAmount(wholeMoneyInput(e.target.value))}
                                  placeholder={`maks. €${fmtM(due)}`}
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Metoda *</label>
                                <PaymentMethodCombobox
                                  value={method}
                                  onChange={setMethod}
                                  options={dynamicMethods.map(pm => ({ value: pm.name, label: pm.name, color: pm.color }))}
                                />
                                <p className="mt-1 text-[11px] text-muted-foreground">Regjistrimi i pagesës tregon se pagesa është marrë.</p>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Lloji i Pagesës</label>
                              <div className="grid grid-cols-2 gap-2 max-w-md">
                                <button type="button" onClick={() => setPayerType(payerType === "invoice" ? "" : "invoice")} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${payerType === "invoice" ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted border-border"}`}>
                                  {payerType === "invoice" && <CheckCircle2 className="h-4 w-4" />}
                                  📄 FATURË
                                </button>
                                <button type="button" onClick={() => setPayerType(payerType === "client" ? "" : "client")} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${payerType === "client" ? "bg-green-600 text-white border-green-600" : "bg-background hover:bg-muted border-border"}`}>
                                  {payerType === "client" && <CheckCircle2 className="h-4 w-4" />}
                                  👤 KLIENT
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Referenca (opsionale — p.sh. nr. transfertës)</label>
                              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="REF-001..." />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Shënime (opsionale)</label>
                              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Shënime shtesë..." />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" onClick={() => setOpenId(null)}>Anulo</Button>
                              <Button onClick={() => submitPayment(b.id, due)} disabled={saving || !amount}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                                Regjistro Pagesën
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Payment Methods CRUD ──────────────────────────────────────────────────
type PaymentMethod = { id: number; name: string; color: string; active: boolean; sortOrder: number; createdAt: string };

function PaymentMethodsTab() {
  const { toast } = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/payment-methods");
      setMethods(Array.isArray(data) ? data : []);
      refreshPaymentMethods();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "S'u arrit ngarkimi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const onPatch = async (id: number, patch: Partial<Pick<PaymentMethod, "name" | "color" | "active" | "sortOrder">>) => {
    try {
      await apiFetch(`/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      load();
    } catch (e: any) {
      toast({ title: "Gabim", description: e?.message || "S'u arrit ruajtja", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="text-sm font-semibold">Metodat e Pagesës ({methods.length})</h3>
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Rifresko
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : methods.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nuk ka metoda pagese.</div>
        ) : (
          <div className="divide-y">
            {methods.map(m => (
              <div key={m.id} className={`flex items-center gap-3 p-3 ${!m.active ? "opacity-50" : ""}`}>
                <input
                  type="color"
                  value={m.color}
                  onChange={e => onPatch(m.id, { color: e.target.value })}
                  className="h-8 w-10 rounded border cursor-pointer flex-shrink-0"
                  title="Ngjyra"
                />
                <Input
                  defaultValue={m.name}
                  onBlur={e => { if (e.target.value.trim() && e.target.value !== m.name) onPatch(m.id, { name: e.target.value.trim() }); }}
                  className="flex-1"
                />
                <Badge
                  style={{ backgroundColor: m.color + "20", color: m.color, borderColor: m.color + "40" }}
                  className="font-medium border whitespace-nowrap"
                >
                  {m.name}
                </Badge>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.active}
                    onChange={e => onPatch(m.id, { active: e.target.checked })}
                    className="cursor-pointer"
                  />
                  Aktive
                </label>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 border-t text-xs text-muted-foreground">
          Ndryshimet ruhen automatikisht kur dilni nga fusha (ngjyra dhe checkbox-i menjëherë).
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function PaymentsList() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialAgentId = params.get("agentId") ?? "";

  const { hasPermission } = useAdminAuth();
  const canViewPaymentsReport = hasPermission("can_view_payments_report");

  const [tab, setTab] = useState<"bulk" | "ledger" | "report" | "client" | "methods">("bulk");

  const tabs = [
    { id: "bulk", label: "Pagesa Masive", icon: null },
    { id: "ledger", label: "Regjistri i Pagesave", icon: null },
    { id: "report", label: "Shkarko Raport", icon: <FileDown className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" /> },
    { id: "client", label: "Pagesa nga Klientët", icon: <CreditCard className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" /> },
    { id: "methods", label: "Metodat e Pagesës", icon: <Settings2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" /> },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pagesat</h1>
        <p className="text-muted-foreground">Menaxhimi i pagesave dhe faturave të agjentëve.</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.filter(t => t.id !== "report" || canViewPaymentsReport).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bulk" && <BulkPayment initialAgentId={initialAgentId} />}
      {tab === "ledger" && <PaymentLedger />}
      {tab === "report" && canViewPaymentsReport && <ReportDownload />}
      {tab === "client" && <ClientPayment />}
      {tab === "methods" && <PaymentMethodsTab />}
    </div>
  );
}
