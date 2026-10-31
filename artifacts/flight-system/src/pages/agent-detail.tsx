import { useState, useEffect, useCallback, Fragment } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtM, wholeMoneyInput, dueEuro } from "@/lib/utils";
import { useRoute } from "wouter";

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  return <AgentDetailContent id={id} />;
}
import { format } from "date-fns";
import { useGetAgent, useListBookings, useUpdateAgent } from "@workspace/api-client-react";
import { AgentColorPicker } from "@/components/AgentColorPicker";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { TrendingUp, ArrowDownCircle, ArrowUpCircle, Loader2, Plus, Save, TrendingDown, CreditCard, FileText, Pencil, Paperclip, Layers, Download, ChevronRight, ChevronDown, CalendarRange } from "lucide-react";
import { BulkPayment } from "@/components/BulkPayment";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { downloadReportPDF, generateDebtReportHTML } from "@/lib/reportDetailed";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { AgentFlightVisibility } from "@/components/AgentFlightVisibility";
import { GroupSelector } from "@/components/AgencyGroups";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

const tiraneDateKey = (value: string | Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const PAGE_SIZE_OPTIONS = ["5", "10", "30", "50", "all"] as const;

function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: string;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) {
  const numericPageSize = pageSize === "all" ? Math.max(1, totalItems) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / numericPageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-1 pt-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Shfaq</span>
        <Select value={pageSize} onValueChange={onPageSizeChange}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={size}>
                {size === "all" ? "Të gjitha" : size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>nga {totalItems} rezultate</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={safePage <= 1 || pageSize === "all"}
          onClick={() => onPageChange(safePage - 1)}
        >
          Para
        </Button>
        <span className="min-w-[80px] text-center text-xs text-muted-foreground">
          Faqja {safePage} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={safePage >= totalPages || pageSize === "all"}
          onClick={() => onPageChange(safePage + 1)}
        >
          Tjetër
        </Button>
      </div>
    </div>
  );
}


const statusColors: Record<string, string> = {
  confirmed: "bg-blue-500", ticketed: "bg-green-500",
  cancelled: "bg-red-500", draft: "bg-yellow-500", pending: "bg-orange-400",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar",
  ticketed: "Biletë", cancelled: "Anuluar",
};

export function AgentDetailContent({ id }: { id: number }) {
  const { toast } = useToast();
  const { hasPermission, user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const showAgentCommission = hasPermission("can_view_commission_in_agents");
  const queryClient = useQueryClient();

  const { data: agent, isLoading: isAgentLoading } = useGetAgent(id, { query: { enabled: !!id } as any });
  const { data: bookings, isLoading: isBookingsLoading } = useListBookings({ agentId: id }, { query: { enabled: !!id } as any });

  // UI optimiste për çelësat (Switch): pasi çelësi lexon vlerën nga cache-i i
  // react-query, ai vizualisht "ngec" në gjendjen e vjetër derisa të mbarojë
  // kërkesa në server + rifreskimi. Këtu mbajmë mbivendosje lokale që çelësi të
  // ndryshojë menjëherë; pastrohet sa herë vijnë të dhëna të freskëta nga serveri.
  const [optimisticToggles, setOptimisticToggles] = useState<Record<string, boolean>>({});
  useEffect(() => { setOptimisticToggles({}); }, [agent]);
  const toggleValue = (field: string, serverVal: boolean): boolean =>
    field in optimisticToggles ? optimisticToggles[field] : serverVal;

  const [credits, setCredits] = useState<{ balance: number; transactions: any[] } | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  // Booking detail modal
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositRef, setDepositRef] = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  const [depositDoc, setDepositDoc] = useState<File | null>(null);
  const [depositSaving, setDepositSaving] = useState(false);
  const paymentMethods = usePaymentMethods();

  const updateAgent = useUpdateAgent();
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creditPage, setCreditPage] = useState(1);
  const [creditPageSize, setCreditPageSize] = useState("5");
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPageSize, setBookingPageSize] = useState("5");

  const matchesDateFilter = useCallback((value: string | Date) => {
    const date = tiraneDateKey(value);
    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  }, [dateFrom, dateTo]);
  const filteredTransactions = (credits?.transactions ?? []).filter((transaction: any) =>
    matchesDateFilter(transaction.createdAt),
  );
  const filteredBookings = (bookings ?? []).filter((booking: any) =>
    matchesDateFilter(booking.createdAt),
  );
  const creditTotalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / (creditPageSize === "all" ? Math.max(1, filteredTransactions.length) : Number(creditPageSize))),
  );
  const bookingTotalPages = Math.max(
    1,
    Math.ceil(filteredBookings.length / (bookingPageSize === "all" ? Math.max(1, filteredBookings.length) : Number(bookingPageSize))),
  );
  const safeCreditPage = Math.min(creditPage, creditTotalPages);
  const safeBookingPage = Math.min(bookingPage, bookingTotalPages);
  const paginatedTransactions = creditPageSize === "all"
    ? filteredTransactions
    : filteredTransactions.slice(
        (safeCreditPage - 1) * Number(creditPageSize),
        safeCreditPage * Number(creditPageSize),
      );
  const paginatedBookings = bookingPageSize === "all"
    ? filteredBookings
    : filteredBookings.slice(
        (safeBookingPage - 1) * Number(bookingPageSize),
        safeBookingPage * Number(bookingPageSize),
      );

  useEffect(() => {
    setCreditPage(1);
    setBookingPage(1);
  }, [dateFrom, dateTo]);

  // Edit-agent dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDisplayColor, setEditDisplayColor] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editFinanceEmail, setEditFinanceEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCommission, setEditCommission] = useState("0");
  const [editMarkup, setEditMarkup] = useState("0");
  const [editMarkupPercent, setEditMarkupPercent] = useState("0");
  const [editSaving, setEditSaving] = useState(false);
  const [editGroupId, setEditGroupId] = useState<number | null>(null);

  const openEditDialog = () => {
    if (!agent) return;
    setEditName(agent.name ?? "");
    setEditDisplayColor(agent.displayColor ?? null);
    setEditCompany((agent as any).company ?? "");
    setEditEmail(agent.email ?? "");
    setEditFinanceEmail((agent as any).financeEmail ?? "");
    setEditPhone((agent as any).phone ?? "");
    setEditCommission(String((agent as any).commission ?? 0));
    setEditMarkup(String((agent as any).markup ?? 0));
    setEditMarkupPercent(String((agent as any).markupPercent ?? 0));
    setEditGroupId((agent as any).groupId ?? null);
    setIsEditOpen(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    if (!editName.trim()) {
      toast({ title: "Emri është i detyrueshëm", variant: "destructive" });
      return;
    }
    if (!editEmail.trim()) {
      toast({ title: "Email-i është i detyrueshëm", variant: "destructive" });
      return;
    }
    if (isAdmin && editGroupId === null) {
      toast({ title: "Zgjidhni grupin e agjencisë", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      await updateAgent.mutateAsync({
        id,
        data: {
          name: editName.trim(),
          displayColor: editDisplayColor,
          company: editCompany.trim() || null,
          email: editEmail.trim(),
          financeEmail: editFinanceEmail.trim() || null,
          phone: editPhone.trim() || null,
          commission: Number(editCommission) || 0,
          markup: Number(editMarkup) || 0,
          markupPercent: Number(editMarkupPercent) || 0,
          ...(isAdmin ? { groupId: editGroupId } : {}),
        } as any,
      });
      toast({ title: "Të dhënat u ruajtën" });
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["agency-groups"] });
      queryClient.invalidateQueries({ queryKey: ["visibility-context", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleShowInReports = async (val: boolean) => {
    if (!id) return;
    try {
      await updateAgent.mutateAsync({ id, data: { showInReports: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Agjenti shfaqet te lista për userat jo-admin" : "Agjenti fshihet nga lista për userat jo-admin" });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleActive = async () => {
    if (!id || !agent) return;
    const newStatus = agent.status === "active" ? "inactive" : "active";
    try {
      await updateAgent.mutateAsync({ id, data: { status: newStatus } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${id}`] });
      toast({ title: newStatus === "active" ? "Agjenti u aktivizua" : "Agjenti u çaktivizua (Joaktiv)" });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleShowContact = async (val: boolean) => {
    if (!id) return;
    try {
      await updateAgent.mutateAsync({ id, data: { showContactToUsers: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Kontakti i agjentit shfaqet për userat jo-admin" : "Kontakti i agjentit fshihet për userat jo-admin" });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleManagerCanEdit = async (val: boolean) => {
    if (!id) return;
    try {
      await updateAgent.mutateAsync({ id, data: { managerCanEdit: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Menaxherët mund ta editojnë këtë agjent" : "Menaxherët nuk mund ta editojnë këtë agjent" });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleNotifyByEmail = async (val: boolean) => {
    if (!id) return;
    setOptimisticToggles((o) => ({ ...o, notifyByEmail: val }));
    try {
      await updateAgent.mutateAsync({ id, data: { notifyByEmail: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Agjenti do të njoftohet me email për çdo rezervim" : "Agjenti nuk do të njoftohet me email" });
    } catch (e: any) {
      setOptimisticToggles((o) => ({ ...o, notifyByEmail: !val }));
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleWeeklyDebtReport = async (val: boolean) => {
    if (!id) return;
    setOptimisticToggles((p) => ({ ...p, weeklyDebtReport: val }));
    try {
      await updateAgent.mutateAsync({ id, data: { weeklyDebtReport: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Agjenti do marrë raportin javor të detyrimeve (e hënë 07:00, vetëm nëse është debitor)" : "Agjenti nuk merr më raportin javor të detyrimeve" });
    } catch (e: any) {
      setOptimisticToggles((p) => { const c = { ...p }; delete c.weeklyDebtReport; return c; });
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleSeesHiddenFlights = async (val: boolean) => {
    if (!id) return;
    try {
      await updateAgent.mutateAsync({ id, data: { seesHiddenFlights: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Ky agjent i sheh edhe fluturimet e fshehura në Booking Engine" : "Ky agjent NUK i sheh fluturimet e fshehura" });
    } catch (e: any) {
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleToggleStatusEmail = async (
    field: "notifyCreated" | "notifyProcessing" | "notifyConfirmed" | "notifyTicketed" | "notifyCancelled",
    val: boolean,
  ) => {
    if (!id) return;
    setOptimisticToggles((o) => ({ ...o, [field]: val }));
    try {
      await updateAgent.mutateAsync({ id, data: { [field]: val } as any });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: val ? "Email-i për këtë status do të dërgohet" : "Email-i për këtë status NUK do të dërgohet" });
    } catch (e: any) {
      setOptimisticToggles((o) => ({ ...o, [field]: !val }));
      toast({ title: "Gabim gjatë ruajtjes", description: e?.message ?? "Provo përsëri", variant: "destructive" });
    }
  };

  const handleGenerateReport = async (debtOnly = false) => {
    if (!id) return;
    setReportLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/payments/report?agentId=${id}${debtOnly ? "&debtFilter=debt" : ""}${dateFrom ? `&dateFrom=${dateFrom}` : ""}${dateTo ? `&dateTo=${dateTo}` : ""}`,
        { credentials: "include" },
      );
      if (!resp.ok) throw new Error("Gabim gjatë marrjes së të dhënave");
      const data = await resp.json();
      const agentObj = agent as any;
      if (debtOnly && (!Array.isArray(data) || data.length === 0)) {
        toast({
          title: "S'ka detyrime",
          description: `${agentObj.name} nuk ka asnjë rezervim me pagesë të mangët.`,
        });
        return;
      }
      // Full credit/wallet ledger (deposits, payments, refunds) — all historical
      // operations, so the report mirrors the on-page "Historia e Krediteve".
      let creditTransactions: any[] = filteredTransactions;
      if (!credits) {
        const creditsResp = await fetch(`${API_BASE}/agents/${id}/credits`, { credentials: "include" });
        if (creditsResp.ok) {
          const creditsData = await creditsResp.json();
          creditTransactions = Array.isArray(creditsData?.transactions)
            ? creditsData.transactions.filter((transaction: any) => matchesDateFilter(transaction.createdAt))
            : [];
        }
      }
      const filteredWalletMovement = creditTransactions
        .filter((transaction: any) => transaction.source === "wallet")
        .reduce((sum: number, transaction: any) => {
          const amount = Math.abs(Number(transaction.amount ?? 0));
          return sum + (transaction.type === "payment" || Number(transaction.amount) < 0 ? -amount : amount);
        }, 0);
      const netCreditVal = dateFrom || dateTo
        ? filteredWalletMovement
        : Number(agentObj.netCredit ?? 0) > 0
          ? Number(agentObj.netCredit)
          : Number(agentObj.walletBalance ?? 0) > 0
            ? Number(agentObj.walletBalance)
            : 0;
      const html = generateDebtReportHTML(data, agentObj, {
        autoAction: debtOnly ? "download" : undefined,
        agentCredit: netCreditVal,
        creditTransactions: debtOnly ? [] : creditTransactions,
        reportLabel: debtOnly ? "Raport Detyrimet" : "Raport i Detajuar",
        creditLabel: debtOnly ? "Kredit Gjendje (Info)" : "Balanca Kredit",
        filename: debtOnly
          ? `RAPORT DETYRIMET ${agentObj.name} DETYRIMI=${fmtM(agentObj.totalDebt)}€`
          : `RAPORT I DETAJUAR ${agentObj.name}`,
        hideTotals: !isAdmin && agentObj.showInReports === false,
      });
      if (debtOnly) {
        downloadReportPDF(html);
        return;
      }
      const win = window.open("", "_blank");
      if (win) { win.document.write(html); win.document.close(); }
    } catch (e: any) {
      toast({ title: "Gabim", description: e.message, variant: "destructive" });
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (agent) {
      const dt = (agent as any).discountType ?? "percent";
      setDiscountType(dt);
      if (dt === "fixed") setDiscountValue(String((agent as any).discountFixed ?? 0));
      else setDiscountValue(String((agent as any).discountPercent ?? 0));
    }
  }, [agent]);

  const loadCredits = useCallback(async () => {
    if (!id) return;
    setLoadingCredits(true);
    try {
      const resp = await fetch(`${API_BASE}/agents/${id}/credits`, { credentials: "include" });
      if (!resp.ok) throw new Error("Nuk u ngarkua historia e krediteve.");
      setCredits(await resp.json());
    } catch {
      toast({
        title: "Historia nuk u rifreskua",
        description: "Rihapni faqen për të parë gjendjen e fundit. Mos e përsëritni një pagesë që u shfaq si e suksesshme.",
        variant: "destructive",
      });
    } finally {
      setLoadingCredits(false);
    }
  }, [id, toast]);

  const handlePaymentSuccess = async () => {
    setCreditPage(1);
    await Promise.all([
      loadCredits(),
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${id}`] }),
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] }),
    ]);
  };

  useEffect(() => { loadCredits(); }, [loadCredits]);

  const paymentRows = paginatedTransactions.filter((t: any) => t.source === "payment");
  const allPaymentsSelected = paymentRows.length > 0 && paymentRows.every((t: any) => selectedPaymentIds.has(String(t.id)));
  const toggleAllPayments = () => {
    setSelectedPaymentIds(allPaymentsSelected ? new Set() : new Set(paymentRows.map((t: any) => String(t.id))));
  };
  const togglePayment = (paymentId: string) => {
    setSelectedPaymentIds(prev => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  };
  const downloadSelectedPaymentsPdf = () => {
    const selected = paymentRows.filter((t: any) => selectedPaymentIds.has(String(t.id)));
    if (selected.length === 0) {
      toast({ title: "Zgjidh të paktën një pagesë.", variant: "destructive" });
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("Raporti i Pagesave", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Agjenti: ${(agent as any)?.name ?? `#${id}`}  |  Pagesa: ${selected.length}  |  Gjeneruar: ${format(new Date(), "dd MMM yyyy h:mm a")}`, 14, 23);
    autoTable(doc, {
      startY: 29,
      head: [["Data", "Burimi", "Rezervimi", "Klient / Faturë", "Statusi", "Referenca / Shënime", "Shuma"]],
      body: selected.map((t: any) => [
        format(new Date(t.createdAt), "dd MMM yyyy h:mm a"),
        t.method ?? "Direkte",
        t.bookingRef ?? "—",
        t.payerType === "invoice" ? "FATURË" : t.payerType === "client" ? "KLIENT" : "—",
        t.confirmed ? "KONFIRMUAR" : "PENDING",
        [t.invoiceCode, t.reference, t.notes].filter(Boolean).join(" · ") || "—",
        `-€${fmtM(Math.abs(Number(t.amount)))}`,
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 5: { cellWidth: 75 }, 6: { halign: "right", fontStyle: "bold" } },
    });
    doc.save(`pagesat-${String((agent as any)?.name ?? id).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const handleDeposit = async () => {
    const amt = Number(depositAmount);
    if (depositSaving || !Number.isFinite(amt) || Math.round(amt * 100) === 0 || !depositMethod.trim() || !paymentMethods.some(method => method.name === depositMethod)) return;
    setDepositSaving(true);
    try {
      const fd = new FormData();
      fd.append("amount", String(amt));
      fd.append("paymentMethod", depositMethod);
      if (depositRef) fd.append("reference", depositRef);
      if (depositNotes) fd.append("notes", depositNotes);
      if (depositDoc) fd.append("document", depositDoc);
      const resp = await fetch(`${API_BASE}/agents/${id}/credits/deposit`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast({ title: `${amt < 0 ? "Kredit u zbritën" : "Kredit u shtuan"}: €${fmtM(Math.abs(amt))}` });
      setIsDepositOpen(false);
      setDepositAmount(""); setDepositMethod(""); setDepositRef(""); setDepositNotes(""); setDepositDoc(null);
      loadCredits();
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    } catch (e: any) {
      toast({ title: "Gabim", description: e.message, variant: "destructive" });
    } finally {
      setDepositSaving(false);
    }
  };

  const handleDiscountSave = () => {
    const val = parseFloat(discountValue);
    if (isNaN(val) || val < 0) {
      toast({ title: "Vlerë e pavlefshme", variant: "destructive" });
      return;
    }
    if (discountType === "percent" && val > 100) {
      toast({ title: "Zbritja % nuk mund të kalojë 100", variant: "destructive" });
      return;
    }
    setDiscountSaving(true);
    const updateData: any = { discountType };
    if (discountType === "percent") { updateData.discountPercent = val; updateData.discountFixed = 0; }
    else { updateData.discountFixed = val; updateData.discountPercent = 0; }
    updateAgent.mutate({ id, data: updateData }, {
      onSuccess: () => {
        const label = discountType === "percent" ? `${val}%` : `€${fmtM(val)}`;
        toast({ title: `Zbritja u ruajt: ${label}` });
        queryClient.invalidateQueries({ queryKey: ["getAgent", id] });
      },
      onError: (e: any) => {
        toast({ title: "Gabim", description: e.message, variant: "destructive" });
      },
      onSettled: () => setDiscountSaving(false),
    });
  };

  if (isAgentLoading) return <div className="p-8 text-center">Duke ngarkuar...</div>;
  if (!agent) return <div className="p-8 text-center text-destructive">Agjenti nuk u gjet</div>;

  const balance = credits?.balance ?? Number(agent.walletBalance ?? 0);
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const activePeriodBookings = filteredBookings.filter((booking: any) => booking.status !== "cancelled");
  const periodSales = activePeriodBookings.reduce((sum: number, booking: any) => sum + Number(booking.totalAmount ?? 0), 0);
  const periodPaid = activePeriodBookings.reduce(
    (sum: number, booking: any) =>
      sum + Math.min(Number(booking.paidAmount ?? 0), Number(booking.totalAmount ?? 0)),
    0,
  );
  const periodCommission = activePeriodBookings.reduce(
    (sum: number, booking: any) =>
      sum + Number(booking.commissionAmount ?? booking.commission ?? 0),
    0,
  );
  const periodWalletBalance = filteredTransactions
    .filter((transaction: any) => transaction.source === "wallet")
    .reduce((sum: number, transaction: any) => {
      const amount = Math.abs(Number(transaction.amount ?? 0));
      return sum + (transaction.type === "payment" || Number(transaction.amount) < 0 ? -amount : amount);
    }, 0);
  const shownBalance = hasDateFilter ? periodWalletBalance : balance;
  const totalSales = hasDateFilter ? periodSales : Number((agent as any).totalSales ?? 0);
  const totalPaid = hasDateFilter ? periodPaid : Number((agent as any).totalPaid ?? 0);
  const totalBookings = hasDateFilter ? activePeriodBookings.length : Number(agent.totalBookings ?? 0);
  const totalCommission = hasDateFilter ? periodCommission : Number((agent as any).totalCommission ?? 0);
  const grossDebt = hasDateFilter
    ? dueEuro(totalSales - totalPaid)
    : Number((agent as any).grossDebt ?? (agent as any).totalDebt ?? 0);
  const totalDebt = Math.max(0, grossDebt - shownBalance);
  const netCredit = Math.max(0, shownBalance - grossDebt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
          <p className="text-muted-foreground">{agent.company || "Agjent i pavarur"}{agent.email ? ` · ${agent.email}` : ""}</p>
          <p className="text-sm text-muted-foreground">Grupi: {(agent as any).groupName || "Pa grup – asnjë fluturim i dukshëm ose i rezervueshëm në Booking Engine"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(isAdmin || ((agent as any).managerCanEdit !== false && (agent as any).groupId != null)) && (
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="h-4 w-4 mr-1" />
              Modifiko
            </Button>
          )}
          {!isAdmin && (agent as any).groupId == null && <span className="text-xs text-amber-700">Administratori duhet t'i caktojë një grup përpara ndryshimit të profilit.</span>}
          <Button variant="outline" size="sm" onClick={() => handleGenerateReport()} disabled={reportLoading}>
            {reportLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Gjenero Raport
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGenerateReport(true)} disabled={reportLoading}>
            {reportLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Shkarko Detyrimet
          </Button>
          {isAdmin ? (
            <button
              onClick={handleToggleActive}
              title={agent.status === "active" ? "Kliko për ta çaktivizuar këtë agjent" : "Kliko për ta aktivizuar këtë agjent"}
              className="cursor-pointer"
            >
              <Badge variant={agent.status === "active" ? "default" : "secondary"} className="capitalize hover:opacity-80 transition-opacity">
                {agent.status === "active" ? "Aktiv" : "Joaktiv"}
              </Badge>
            </button>
          ) : (
            <Badge variant={agent.status === "active" ? "default" : "secondary"} className="capitalize">
              {agent.status === "active" ? "Aktiv" : "Joaktiv"}
            </Badge>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="show-in-reports" className="text-sm font-medium">
              Shfaq këtë agjent te lista e agjentëve për userat jo-admin?
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kur është i çaktivizuar, ky agjent nuk shfaqet fare te lista e agjentëve për userat jo-admin. Adminët e shohin gjithmonë.
            </p>
          </div>
          <Switch
            id="show-in-reports"
            checked={(agent as any).showInReports !== false}
            onCheckedChange={handleToggleShowInReports}
          />
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="show-contact" className="text-sm font-medium">
              Lejo userat jo-admin të shohin kontaktin (email/telefon) e këtij agjenti?
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kur është i çaktivizuar, email-i dhe telefoni i këtij agjenti nuk shfaqen për userat jo-admin. Adminët e shohin gjithmonë.
            </p>
          </div>
          <Switch
            id="show-contact"
            checked={(agent as any).showContactToUsers !== false}
            onCheckedChange={handleToggleShowContact}
          />
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="manager-can-edit" className="text-sm font-medium">
              Lejo menaxherët të editojnë të dhënat e këtij agjenti?
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kur është i çaktivizuar, menaxherët (dhe userat jo-admin) nuk mund ta përdorin butonin "Modifiko" për këtë agjent. Adminët e editojnë gjithmonë.
            </p>
          </div>
          <Switch
            id="manager-can-edit"
            checked={(agent as any).managerCanEdit !== false}
            onCheckedChange={handleToggleManagerCanEdit}
          />
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="sees-hidden-flights" className="text-sm font-medium">
              Lejo këtë agjent të shohë fluturimet e fshehura?
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vlen vetëm kur agjenti nuk ka rregulla të posaçme aksesi. Me rregulla, agjenti sheh vetëm fluturimet që përputhen me to.
            </p>
          </div>
          <Switch
            id="sees-hidden-flights"
            checked={(agent as any).seesHiddenFlights === true}
            onCheckedChange={handleToggleSeesHiddenFlights}
          />
        </div>
      )}

      {isAdmin && <AgentFlightVisibility agentId={id} groupId={(agent as any).groupId ?? null} />}

      {isAdmin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="weekly-debt-report" className="text-sm font-medium">
              Dërgo raportin javor të detyrimeve?
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kur është aktiv, agjenti merr me email çdo të hënë në 07:00 raportin e detyrimeve të tij (lista e rezervimeve me pagesë të mangët + totali). Dërgohet vetëm nëse agjenti është realisht debitor atë moment.
            </p>
          </div>
          <Switch
            id="weekly-debt-report"
            checked={toggleValue("weeklyDebtReport", (agent as any).weeklyDebtReport === true)}
            onCheckedChange={handleToggleWeeklyDebtReport}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <Label htmlFor="notify-by-email" className="text-sm font-medium">
            Njofto këtë agjent me email për çdo rezervim/biletë?
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kur është aktiv, agjenti merr në email-in e tij çdo rezervim/biletë (me PDF) sa herë ndryshon statusi. Kur është i çaktivizuar, nuk i dërgohet asnjë email.
          </p>
        </div>
        <Switch
          id="notify-by-email"
          checked={toggleValue("notifyByEmail", (agent as any).notifyByEmail !== false)}
          onCheckedChange={handleToggleNotifyByEmail}
        />
      </div>

      {/* Lista e statuseve: cilat email-e (me PDF) merr ky agjent. E kushtëzuar nga
          çelësi kryesor "Njofto me email" më sipër. */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-3">
        <div>
          <Label className="text-sm font-medium">Cilat email-e statusi t'i dërgohen këtij agjenti?</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Zgjidh për cilat statuse të rezervimit agjenti merr email me PDF. Funksionon vetëm kur çelësi kryesor "Njofto me email" më sipër është aktiv.
          </p>
        </div>
        {([
          { field: "notifyCreated", en: "Created", sq: "Krijuar (draft)" },
          { field: "notifyProcessing", en: "Booking is Processing", sq: "Në pritje" },
          { field: "notifyConfirmed", en: "Confirmed", sq: "Konfirmuar" },
          { field: "notifyTicketed", en: "Ticketed", sq: "Biletë e lëshuar" },
          { field: "notifyCancelled", en: "Canceled", sq: "Anuluar" },
        ] as const).map((row) => (
          <div key={row.field} className="flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium">{row.en}</span>
              <span className="text-xs text-muted-foreground ml-2">({row.sq})</span>
            </div>
            <Switch
              id={`status-email-${row.field}`}
              checked={toggleValue(row.field, (agent as any)[row.field] !== false)}
              disabled={toggleValue("notifyByEmail", (agent as any).notifyByEmail !== false) === false}
              onCheckedChange={(val) => handleToggleStatusEmail(row.field, val)}
            />
          </div>
        ))}
      </div>

      <Card className="border-blue-100 bg-blue-50/30">
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2 self-start pb-1 text-sm font-semibold text-blue-900 sm:mr-2">
            <CalendarRange className="h-4 w-4" />
            Filtro gjithë faqen
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="agent-date-from" className="text-xs">Nga data</Label>
              <Input id="agent-date-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agent-date-to" className="text-xs">Deri më datë</Label>
              <Input id="agent-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!hasDateFilter}
            onClick={() => { setDateFrom(""); setDateTo(""); }}
          >
            Pastro filtrin
          </Button>
        </CardContent>
      </Card>

      {/* Financial Summary Banner */}
      <div className="grid grid-cols-4 gap-0 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white overflow-hidden">
        <div className="text-center px-4 py-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Shitje Totale</p>
          <p className="text-2xl font-bold">€{fmtM(totalSales)}</p>
          <p className="text-slate-500 text-[10px] mt-0.5">{totalBookings} rezervime</p>
        </div>
        <div className="text-center border-x border-slate-700 px-4 py-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Paguar Direkt</p>
          <p className="text-2xl font-bold text-green-400">€{fmtM(totalPaid)}</p>
          <p className="text-slate-500 text-[10px] mt-0.5">cash / bankë / kartë</p>
        </div>
        <div className="text-center border-r border-slate-700 px-4 py-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Wallet Kredit</p>
          <p className={`text-2xl font-bold ${shownBalance > 0 ? "text-blue-300" : shownBalance < 0 ? "text-red-400" : "text-slate-400"}`}>
            €{fmtM(shownBalance)}
          </p>
          <p className="text-slate-500 text-[10px] mt-0.5">depozita / teprica</p>
        </div>
        <div className="text-center px-4 py-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Borxh Neto</p>
          {netCredit > 0 ? (
            <>
              <p className="text-2xl font-bold text-emerald-300">+€{fmtM(netCredit)}</p>
              <p className="text-slate-500 text-[10px] mt-0.5">ne i kemi borxh</p>
            </>
          ) : totalDebt > 0 ? (
            <>
              <p className="text-2xl font-bold text-red-400">€{fmtM(totalDebt)}</p>
              <p className="text-slate-500 text-[10px] mt-0.5">duhet të paguajë</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-green-400">—</p>
              <p className="text-slate-500 text-[10px] mt-0.5">i shlyer plotësisht</p>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rezervime</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalBookings}</div></CardContent>
        </Card>
        <Card className={`border-2 ${shownBalance > 0 ? "border-green-200 bg-green-50/30" : shownBalance < 0 ? "border-red-200 bg-red-50/30" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Balanca Krediteve</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${shownBalance > 0 ? "text-green-600" : shownBalance < 0 ? "text-destructive" : ""}`}>
              €{fmtM(shownBalance)}
            </div>
            <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setIsDepositOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Shto Kredit
            </Button>
          </CardContent>
        </Card>
        {showAgentCommission && (
        <Card className="border-2 border-emerald-100 bg-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Komisioni i Fituar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {totalCommission < 0
                ? `-€${fmtM(Math.abs(totalCommission))}`
                : totalCommission > 0
                  ? `€${fmtM(totalCommission)}`
                  : "€0"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Shitje − Neto (bilete me çmim neto)</p>
          </CardContent>
        </Card>
        )}
        <Card className="border-2 border-blue-100 bg-blue-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Zbritja e Çmimeve</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percent" | "fixed")}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Përqindje (%)</SelectItem>
                <SelectItem value="fixed">Shumë Fikse (€)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Input
                type="number" min="0" step="0.5"
                max={discountType === "percent" ? 100 : undefined}
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                className="h-7 text-sm"
              />
              <span className="text-xs text-muted-foreground shrink-0">{discountType === "percent" ? "%" : "€"}</span>
              <Button size="sm" className="h-7 w-7 p-0 shrink-0" onClick={handleDiscountSave} disabled={discountSaving}>
                {discountSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Transactions */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Historia e Krediteve
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={downloadSelectedPaymentsPdf} disabled={selectedPaymentIds.size === 0}>
              <FileText className="h-4 w-4 mr-1" /> Shkarko PDF ({selectedPaymentIds.size})
            </Button>
            <Button size="sm" onClick={() => setIsDepositOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Shto Kredit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCredits ? (
            <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground text-sm">Nuk ka transaksione krediti</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[38px]">
                    <input
                      type="checkbox"
                      checked={allPaymentsSelected}
                      onChange={toggleAllPayments}
                      aria-label="Zgjidh të gjitha pagesat"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipi</TableHead>
                  <TableHead>Burimi</TableHead>
                  <TableHead>Rezervimi</TableHead>
                  <TableHead>Klient / Faturë</TableHead>
                  <TableHead>Statusi</TableHead>
                  <TableHead>Shënime / Faturë</TableHead>
                  <TableHead className="text-right">Shuma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.map((t: any) => {
                  const isExpanded = t._batch && expandedBatches.has(t.batchId);
                  const toggleExpand = () => setExpandedBatches(prev => { const n = new Set(prev); n.has(t.batchId) ? n.delete(t.batchId) : n.add(t.batchId); return n; });
                  return (
                  <Fragment key={t.id}>
                  <TableRow className={t._batch ? "bg-indigo-50/50 border-y border-indigo-200" : undefined}>
                    <TableCell>
                      {t.source === "payment" ? (
                        <input
                          type="checkbox"
                          checked={selectedPaymentIds.has(String(t.id))}
                          onChange={() => togglePayment(String(t.id))}
                          aria-label={`Zgjidh pagesën ${t.invoiceCode ?? t.bookingRef ?? t.id}`}
                          className="h-4 w-4 cursor-pointer"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(t.createdAt), "dd MMM yyyy h:mm a")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {t.type === "deposit" && Number(t.amount) < 0 ? (
                          <><ArrowUpCircle className="h-4 w-4 text-orange-500" /><span className="text-orange-700 font-medium text-sm">Zbritje krediti</span></>
                        ) : t.type === "deposit" ? (
                          <><ArrowDownCircle className="h-4 w-4 text-green-500" /><span className="text-green-700 font-medium text-sm">Depozitë</span></>
                        ) : t.type === "refund" ? (
                          <><ArrowDownCircle className="h-4 w-4 text-blue-500" /><span className="text-blue-700 font-medium text-sm">Rimbursim</span></>
                        ) : (
                          <><ArrowUpCircle className="h-4 w-4 text-orange-500" /><span className="text-orange-700 font-medium text-sm">Pagesë</span></>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.source === "payment" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium capitalize">
                          {t.method === "cash" ? "💵 Cash" : t.method === "bank" ? "🏦 Bankë" : t.method === "card" ? "💳 Kartë" : t.method ?? "Direkte"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">💼 Wallet</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t._batch ? (
                        <button onClick={toggleExpand} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 rounded px-1 py-0.5" title={isExpanded ? "Mbyll biletat" : "Shfaq biletat"}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <Layers className="h-3.5 w-3.5" /> {t.bookingRef}
                        </button>
                      ) : t.bookingRef ? (
                        <Link href={`/bookings/${t.bookingId}`} className="text-primary hover:underline font-mono font-medium">{t.bookingRef}</Link>
                      ) : "-"}
                    </TableCell>
                     <TableCell>
                       {t.source === "payment" ? (
                         t.payerType === "invoice" ? (
                           <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700 border-blue-300">📄 FATURË</Badge>
                         ) : t.payerType === "client" ? (
                           <Badge variant="outline" className="text-[10px] font-bold bg-green-50 text-green-700 border-green-300">👤 KLIENT</Badge>
                         ) : <span className="text-muted-foreground/40">—</span>
                       ) : <span className="text-muted-foreground/40">—</span>}
                     </TableCell>
                     <TableCell>
                       {t.source === "payment" ? (
                         t.confirmed ? (
                           <Badge variant="outline" className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border-emerald-300">✓ KONFIRMUAR</Badge>
                         ) : (
                           <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-300">PENDING</Badge>
                         )
                       ) : <span className="text-muted-foreground/40">—</span>}
                     </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[260px]">
                      {t.invoiceCode && (
                        <div className="font-mono text-[10px] font-semibold text-slate-600" title="Kodi i faturës">{t.invoiceCode}</div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="truncate" title={t.notes || ""}>{t.notes || "-"}</span>
                        {t.documentUrl && (
                          <a
                            href={t.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 shrink-0 text-xs text-primary hover:underline"
                            title="Shiko dokumentin e pagesës"
                          >
                            <Paperclip className="h-3.5 w-3.5" /> Dokument
                          </a>
                        )}
                        {t._batch && t.batchId && (
                          <a
                            href={`${API_BASE}/payments/batch/${t.batchId}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-slate-700 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100"
                            title={t.invoiceCode ? `Shkarko Faturën Masive ${t.invoiceCode}` : "Shkarko Faturën Masive"}
                          >
                            <Download className="h-3.5 w-3.5" /> Faturë
                          </a>
                        )}
                         {t.source === "payment" && !t._batch && String(t.id).startsWith("pay_") && (
                           <a
                             href={`${API_BASE}/payments/${String(t.id).slice(4)}/invoice`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-slate-700 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100"
                             title={t.invoiceCode ? `Shkarko Faturën ${t.invoiceCode}` : "Shkarko Faturën"}
                           >
                             <Download className="h-3.5 w-3.5" /> Faturë
                           </a>
                         )}
                        {t.source === "wallet" && (t.type === "deposit" || t.type === "credit") && t.invoiceCode && (
                          <a
                            href={`${API_BASE}/agents/credits/${t.id}/invoice`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-slate-700 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100"
                            title={`Shkarko Faturën e Kreditit ${t.invoiceCode}`}
                          >
                            <Download className="h-3.5 w-3.5" /> Faturë
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${t.type === "payment" || Number(t.amount) < 0 ? "text-orange-600" : "text-green-600"}`}>
                      {t.type === "payment" || Number(t.amount) < 0 ? "-" : "+"}€{fmtM(Math.abs(Number(t.amount)))}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (t._members ?? []).map((m: any) => (
                    <TableRow key={m.id} className="bg-indigo-50/20 text-xs">
                      <TableCell />
                      <TableCell className="text-xs text-muted-foreground pl-8">{format(new Date(m.createdAt), "dd MMM yyyy h:mm a")}</TableCell>
                      <TableCell><span className="text-orange-700 text-xs">Pagesë</span></TableCell>
                      <TableCell className="text-xs capitalize">{m.method === "cash" ? "💵 Cash" : m.method === "bank" ? "🏦 Bankë" : m.method === "card" ? "💳 Kartë" : m.method ?? "Direkte"}</TableCell>
                      <TableCell className="text-xs">
                        {m.bookingRef ? (
                          <Link href={`/bookings/${m.bookingId}`} className="text-primary hover:underline font-mono font-medium">{m.bookingRef}</Link>
                        ) : "-"}
                      </TableCell>
                       <TableCell>
                         {m.payerType === "invoice" ? (
                           <Badge variant="outline" className="text-[9px] font-bold bg-blue-50 text-blue-700 border-blue-300">📄 FATURË</Badge>
                         ) : m.payerType === "client" ? (
                           <Badge variant="outline" className="text-[9px] font-bold bg-green-50 text-green-700 border-green-300">👤 KLIENT</Badge>
                         ) : <span className="text-muted-foreground/40">—</span>}
                       </TableCell>
                       <TableCell>
                         {m.confirmed ? (
                           <Badge variant="outline" className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border-emerald-300">✓ KONFIRMUAR</Badge>
                         ) : (
                           <Badge variant="outline" className="text-[9px] font-bold bg-amber-50 text-amber-700 border-amber-300">PENDING</Badge>
                         )}
                       </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                         <div className="flex items-center gap-2">
                           <span className="truncate" title={m._rawNotes || m.notes || ""}>{m._rawNotes || m.notes || "-"}</span>
                           {String(m.id).startsWith("pay_") && (
                             <a
                               href={`${API_BASE}/payments/${String(m.id).slice(4)}/invoice`}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold text-slate-700 border border-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100"
                             >
                               <Download className="h-3 w-3" /> Faturë
                             </a>
                           )}
                         </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-orange-600 text-xs">-€{fmtM(m.amount)}</TableCell>
                    </TableRow>
                  ))}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <TablePagination
            page={safeCreditPage}
            pageSize={creditPageSize}
            totalItems={filteredTransactions.length}
            onPageChange={setCreditPage}
            onPageSizeChange={(size) => { setCreditPageSize(size); setCreditPage(1); }}
          />
        </CardContent>
      </Card>

      {/* Bulk Payment — embedded shared component */}
      <BulkPayment initialAgentId={String(id)} onPaymentSuccess={handlePaymentSuccess} />

      {/* Bookings */}
      <Card>
        <CardHeader>
          <CardTitle>Rezervimet e Agjentit</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referenca</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Klienti</TableHead>
                <TableHead>Fluturimi</TableHead>
                <TableHead className="text-center">Pax</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Statusi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isBookingsLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-4">Duke ngarkuar...</TableCell></TableRow>
               ) : filteredBookings.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Nuk ka rezervime</TableCell></TableRow>
              ) : (
                 paginatedBookings.map((booking: any) => (
                  <TableRow key={booking.id} className={`cursor-pointer hover:bg-muted/50 ${booking.status === "cancelled" ? "!bg-red-50/70 line-through text-red-700/70 [&_*]:line-through [&_*]:!text-red-700/70" : ""}`} onClick={() => setSelectedBookingId(booking.id)}>
                    <TableCell>
                      <span className="text-primary font-medium font-mono hover:underline">
                        {booking.bookingRef}
                      </span>
                    </TableCell>
                    <TableCell>{format(new Date(booking.createdAt), "dd MMM yyyy")}</TableCell>
                    <TableCell>{booking.customerName}</TableCell>
                    <TableCell className="text-sm">{booking.fromCity} → {booking.toCity}</TableCell>
                    <TableCell className="text-center font-medium">
                      {(() => {
                        const pax = (booking.passengers || []).filter((p: any) => p.type !== "infant" && !p.cancelled).length;
                        const inf = (booking.passengers || []).filter((p: any) => p.type === "infant" && !p.cancelled).length;
                        return inf > 0 ? `${pax}+${inf}b` : pax;
                      })()}
                    </TableCell>
                    <TableCell className="font-medium">€{fmtM(booking.totalAmount)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge className={`text-white text-xs ${statusColors[booking.status] ?? "bg-gray-400"}`}>
                          {statusLabels[booking.status] ?? booking.status}
                        </Badge>
                        {(() => {
                          const total = Number(booking.totalAmount ?? 0);
                          const paid = Number(booking.paidAmount ?? 0);
                          const due = dueEuro(booking.dueAmount ?? Math.max(0, total - paid));
                          if (booking.status === "cancelled") return null;
                          if (total > 0 && due <= 0.001) return <Badge className="text-white text-[10px] bg-emerald-600">Paid</Badge>;
                          if (paid > 0 && due > 0.001) return <Badge className="text-white text-[10px] bg-amber-500">Partially paid</Badge>;
                          if (paid <= 0.001 && total > 0) return <Badge className="text-white text-[10px] bg-red-500">Not paid</Badge>;
                          return null;
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
           </Table>
           <TablePagination
             page={safeBookingPage}
             pageSize={bookingPageSize}
             totalItems={filteredBookings.length}
             onPageChange={setBookingPage}
             onPageSizeChange={(size) => { setBookingPageSize(size); setBookingPage(1); }}
           />
        </CardContent>
      </Card>

      {/* Booking Detail Modal — full functionality */}
      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); queryClient.invalidateQueries({ queryKey: ["/api/bookings"] }); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle>
          </DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifiko Agjentin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Emri i Plotë <span className="text-destructive">*</span></Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
            </div>
            <AgentColorPicker value={editDisplayColor} onChange={setEditDisplayColor} />
            <div>
              <Label className="text-sm font-medium mb-1.5 block">NIPT</Label>
              <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder="p.sh. L91234567A" />
            </div>
            {isAdmin && <GroupSelector value={editGroupId} onChange={setEditGroupId} required />}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email për Financat</Label>
              <Input type="email" value={editFinanceEmail} onChange={e => setEditFinanceEmail(e.target.value)} placeholder="email për raportet financiare" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Telefon</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Komisioni (%)</Label>
                <Input type="number" min="0" step="0.1" value={editCommission} onChange={e => setEditCommission(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Markup (€)</Label>
                <Input type="number" min="0" step="0.5" value={editMarkup} onChange={e => setEditMarkup(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Markup (%)</Label>
                <Input type="number" min="0" step="0.5" value={editMarkupPercent} onChange={e => setEditMarkupPercent(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-800">
              Ndryshimi i emrit/NIPT-it do të reflektohet automatikisht në të gjitha rezervimet, faturat dhe raportet ekzistuese. Markup-i i ri do të aplikohet vetëm te rezervimet e reja.
            </div>
            <Button className="w-full" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Duke ruajtur...</> : "Ruaj Ndryshimet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={isDepositOpen} onOpenChange={open => { setIsDepositOpen(open); if (!open) setDepositMethod(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shto Kredit — {agent.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 rounded-md bg-green-50 border border-green-200">
              <span className="text-sm font-medium text-green-800">Balanca aktuale</span>
              <span className="text-lg font-bold text-green-700">€{fmtM(balance)}</span>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Shuma (€)</Label>
              <Input
                type="text" inputMode="numeric"
                className="no-number-spin"
                value={depositAmount}
                onChange={e => setDepositAmount(wholeMoneyInput(e.target.value))}
                placeholder="p.sh. 1000"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Shuma pozitive shton kredit; shuma negative e zbret nga balanca.</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Mënyra e Pagesës <span className="text-destructive">*</span>
              </Label>
              <Select value={depositMethod} onValueChange={setDepositMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Zgjidh mënyrën e pagesës" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(method => (
                    <SelectItem key={method.id} value={method.name}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Regjistrimi i depozitës tregon se pagesa është marrë; ndryshimi i kreditit nuk është marrje parash fizike.</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Referenca (opsionale)</Label>
              <Input value={depositRef} onChange={e => setDepositRef(e.target.value)} placeholder="Nr. transferte, faturë..." />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Shënime</Label>
              <Input value={depositNotes} onChange={e => setDepositNotes(e.target.value)} placeholder="Shënime shtesë..." />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Dokumenti i pagesës (opsionale)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setDepositDoc(e.target.files?.[0] ?? null)}
              />
              {depositDoc && (
                <p className="mt-1.5 text-xs text-muted-foreground truncate">📎 {depositDoc.name}</p>
              )}
            </div>
            {depositAmount && Number.isFinite(Number(depositAmount)) && Number(depositAmount) !== 0 && (
              <div className="p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-800">
                Balanca e re: <strong>€{fmtM(balance + parseFloat(depositAmount))}</strong>
              </div>
            )}
            <Button className="w-full" onClick={handleDeposit} disabled={depositSaving || !depositMethod || !paymentMethods.some(method => method.name === depositMethod) || !Number.isFinite(Number(depositAmount)) || Math.round(Number(depositAmount) * 100) === 0}>
              {depositSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Duke ruajtur...</> : Number(depositAmount) < 0 ? "Zbrit Kredit" : "Shto Kredit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
