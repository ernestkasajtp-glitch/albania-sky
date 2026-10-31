import { lazy, Suspense, useState } from "react";
import { fmtM, dueEuro } from "@/lib/utils";
import { useListAgents, useCreateAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
import { AgentColorPicker } from "@/components/AgentColorPicker";
import { AgentUsers, useAgentUsers } from "@/components/AgentUsers";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, TrendingDown, ArrowUp, ArrowDown, ArrowUpDown, FileText, Loader2, Printer, Download, CalendarDays, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentRankBadge } from "@/components/AgentRankBadge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { GroupSelector } from "@/components/AgencyGroups";
import { PublicEnrollments } from "@/components/PublicEnrollments";
import { Link, useSearch } from "wouter";

const AgentDetailContent = lazy(() =>
  import("@/pages/agent-detail").then(({ AgentDetailContent }) => ({ default: AgentDetailContent }))
);
const AgentActivityDialog = lazy(() =>
  import("@/components/AgentActivityDialog").then(({ AgentActivityDialog }) => ({ default: AgentActivityDialog }))
);

const agentSchema = z.object({
  displayColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  name: z.string().min(1, "Kërkohet emri"),
  email: z.string().email("Email i pavlefshëm"),
  financeEmail: z.string().email("Email financash i pavlefshëm").or(z.literal("")).optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().min(1, "NIPT është i detyruar"),
  commission: z.coerce.number().min(0).default(5),
  markup: z.coerce.number().min(0).default(0),
  markupPercent: z.coerce.number().min(0).default(0),
  status: z.string().default("active"),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountFixed: z.coerce.number().min(0).default(0),
  notifyByEmail: z.boolean().default(true),
  groupId: z.number({ required_error: "Zgjidhni grupin e agjencisë" }).positive("Zgjidhni grupin e agjencisë"),
});

type AgentFormValues = z.infer<typeof agentSchema>;

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type SortKey = "name" | "company" | "totalCommission" | "avgCommission" | "totalPassengers" | "discount" | "totalBookings" | "totalSales" | "totalPaid" | "totalDebt" | "balance" | "emails" | "status";

// Llojet e email-eve të statusit që mund t'i shkojnë një agjenti.
const EMAIL_KINDS: Array<[key: string, label: string]> = [
  ["notifyCreated", "Krijuar (draft)"],
  ["notifyProcessing", "Në pritje"],
  ["notifyConfirmed", "Konfirmuar"],
  ["notifyTicketed", "Biletë e lëshuar"],
  ["notifyCancelled", "Anuluar"],
];

// Kthen listën e emaileve aktive për agjentin (bosh nëse çelësi kryesor është OFF).
function agentEmailLabels(a: any): string[] {
  if (a?.notifyByEmail === false) return [];
  return EMAIL_KINDS.filter(([k]) => a?.[k] !== false).map(([, l]) => l);
}
type SortDir = "asc" | "desc";

export default function AgentsList() {
  const pendingView = new URLSearchParams(useSearch()).get("pending") === "1";
  const { hasPermission, user } = useAdminAuth();
  const isAdmin = user?.role === "admin";
  const linkedUsers = useAgentUsers(isAdmin);
  const [usersAgent, setUsersAgent] = useState<{ id: number; name: string } | null>(null);
  const showAgentCommission = hasPermission("can_view_commission_in_agents");
  const [search, setSearch] = useState("");
  const [debtorOnly, setDebtorOnly] = useState(false);
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<Set<number>>(new Set());
  const [dateType, setDateType] = useState<"created" | "flight">("created");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [activityAgent, setActivityAgent] = useState<{ id: number; name: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { data: agents, isLoading } = useListAgents({
    search: search || undefined,
    dateType,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "company" || key === "status" ? "asc" : "desc");
    }
  };

  const getSortValue = (agent: any, key: SortKey): number | string => {
    switch (key) {
      case "name": return (agent.name ?? "").toString().toLowerCase();
      case "company": return (agent.company ?? "").toString().toLowerCase();
      case "totalCommission": return Number(agent.totalCommission ?? 0);
      case "totalPassengers": return Number(agent.totalPassengers ?? 0);
      case "avgCommission": {
        const pax = Number(agent.totalPassengers ?? 0);
        return pax > 0 ? Number(agent.totalCommission ?? 0) / pax : 0;
      }
      case "discount": return agent.discountType === "fixed"
        ? Number(agent.discountFixed ?? 0)
        : Number(agent.discountPercent ?? 0);
      case "totalBookings": return Number(agent.totalBookings ?? 0);
      case "totalSales": return Number(agent.totalSales ?? 0);
      case "totalPaid": return Number(agent.totalPaid ?? 0);
      case "totalDebt": return Number(agent.totalDebt ?? 0);
      case "balance": return Number(agent.netCredit ?? 0) > 0
        ? Number(agent.netCredit ?? 0)
        : Number(agent.walletBalance ?? 0);
      case "emails": return agentEmailLabels(agent).length;
      case "status": return (agent.status ?? "").toString().toLowerCase();
    }
  };

  const sortedAgents = (agents as any[] | undefined)
    ?.filter((a) => isAdmin || a.showInReports !== false)
    .filter((a) => (debtorOnly ? Number(a.totalDebt ?? 0) > 0 : true))
    .slice().sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });
  const selectedDebtors = (sortedAgents ?? []).filter((agent) => selectedDebtorIds.has(agent.id));
  const allVisibleDebtorsSelected = debtorOnly
    && (sortedAgents?.length ?? 0) > 0
    && (sortedAgents ?? []).every((agent) => selectedDebtorIds.has(agent.id));

  const SortHeader = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors select-none">
        {children}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createAgent = useCreateAgent();

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "", email: "", financeEmail: "", phone: "", company: "",
      displayColor: null,
      commission: 5, markup: 0, markupPercent: 0, status: "active",
      discountType: "percent", discountPercent: 0, discountFixed: 0,
      notifyByEmail: true,
      groupId: undefined,
    },
  });

  const discountType = form.watch("discountType");

  const [reportLoadingId, setReportLoadingId] = useState<number | null>(null);
  const handleDownloadSelectedDebtors = async () => {
    if (selectedDebtors.length === 0) {
      toast({ title: "Zgjidh agjentët", description: "Zgjidh të paktën një agjent debitor për PDF." });
      return;
    }
    let report: typeof import("@/lib/reportDetailed");
    try {
      report = await import("@/lib/reportDetailed");
    } catch {
      toast({ title: "Raporti nuk u ngarkua", description: "Provo përsëri.", variant: "destructive" });
      return;
    }
    const esc = (value: unknown) => String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const sum = (field: string) => selectedDebtors.reduce((total, agent) => total + Number(agent[field] ?? 0), 0);
    const totalSales = sum("totalSales");
    const totalPaid = sum("totalPaid");
    const totalDebt = sum("totalDebt");
    const rows = selectedDebtors.map((agent, index) => {
      const credit = Number(agent.netCredit ?? 0) > 0
        ? Number(agent.netCredit)
        : Math.max(0, Number(agent.walletBalance ?? 0));
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${esc(agent.name)}</strong></td>
        <td>${esc(agent.company || "—")}</td>
        <td class="num">${Number(agent.totalBookings ?? 0)}</td>
        <td class="num">${Number(agent.totalPassengers ?? 0)}</td>
        <td class="num">€${fmtM(agent.totalSales ?? 0)}</td>
        <td class="num">€${fmtM(agent.totalPaid ?? 0)}</td>
        <td class="num debt">€${fmtM(agent.totalDebt ?? 0)}</td>
        <td class="num">${credit > 0 ? `€${fmtM(credit)}` : "—"}</td>
      </tr>`;
    }).join("");
    const dateLabel = [dateFrom, dateTo].filter(Boolean).join(" – ") || "Gjithë periudha";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lista e Debitorëve</title>
      <style>
        @page { size: A4 landscape; margin: 9mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color:#172033; margin:20px; font-size:11px; }
        h1 { margin:0 0 4px; color:#1e3a5f; font-size:22px; }
        .meta { color:#64748b; margin-bottom:14px; }
        .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
        .card { border:1px solid #dbe3ee; border-radius:7px; padding:9px; background:#f8fafc; }
        .card span { display:block; color:#64748b; font-size:9px; text-transform:uppercase; }
        .card strong { display:block; margin-top:3px; font-size:16px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#1e3a5f; color:white; padding:7px 6px; text-align:left; font-size:9px; text-transform:uppercase; }
        td { border-bottom:1px solid #e2e8f0; padding:7px 6px; }
        tbody tr:nth-child(even) { background:#f8fafc; }
        .num { text-align:right; white-space:nowrap; }
        .debt { color:#dc2626; font-weight:700; }
        tfoot td { background:#eef2f7; font-weight:700; border-top:2px solid #94a3b8; }
      </style>${report.reportToolbarHTML({ filename: `Lista e Debitoreve ${new Date().toISOString().slice(0, 10)}`, orientation: "landscape", autoAction: "download" })}
      </head><body>
      <h1>Lista e Debitorëve</h1>
      <div class="meta">Periudha: ${esc(dateLabel)} · Gjeneruar më ${new Date().toLocaleDateString("sq-AL")}</div>
      <div class="cards">
        <div class="card"><span>Agjentë të zgjedhur</span><strong>${selectedDebtors.length}</strong></div>
        <div class="card"><span>Shitje totale</span><strong>€${fmtM(totalSales)}</strong></div>
        <div class="card"><span>Paguar</span><strong>€${fmtM(totalPaid)}</strong></div>
        <div class="card"><span>Detyrim total</span><strong class="debt">€${fmtM(totalDebt)}</strong></div>
      </div>
      <table><thead><tr><th>#</th><th>Agjenti</th><th>NIPT</th><th class="num">Rezervime</th><th class="num">Klientë</th><th class="num">Shitje</th><th class="num">Paguar</th><th class="num">Detyrim</th><th class="num">Kredit</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">TOTALI (${selectedDebtors.length})</td><td class="num">€${fmtM(totalSales)}</td><td class="num">€${fmtM(totalPaid)}</td><td class="num debt">€${fmtM(totalDebt)}</td><td></td></tr></tfoot>
      </table></body></html>`;
    report.downloadReportPDF(html);
  };

  const handleGenerateReport = async (agent: any, autoAction?: "print" | "download", debtOnly = false) => {
    setReportLoadingId(agent.id);
    try {
      const [{ generateDebtReportHTML, downloadReportPDF }, resp, creditsResp] = await Promise.all([
        import("@/lib/reportDetailed"),
        fetch(`${API_BASE}/payments/report?agentId=${agent.id}${debtOnly ? "&debtFilter=debt" : ""}`, { credentials: "include" }),
        fetch(`${API_BASE}/agents/${agent.id}/credits`, { credentials: "include" }),
      ]);
      if (!resp.ok) throw new Error("Gabim gjatë marrjes së të dhënave");
      const data = await resp.json();
      if (debtOnly && (!Array.isArray(data) || data.length === 0)) {
        toast({ title: "S'ka detyrime", description: `${agent.name} nuk ka asnjë rezervim me pagesë të mangët.` });
        return;
      }
      // Full credit/wallet ledger (deposits, payments, refunds) — includes ALL
      // historical operations, so the report reflects past credit movements too.
      let creditTransactions: any[] = [];
      if (creditsResp.ok) {
        const creditsData = await creditsResp.json();
        creditTransactions = Array.isArray(creditsData?.transactions) ? creditsData.transactions : [];
      }
      const debtAmt = Number(agent.totalDebt ?? 0);
      // Same "Balanca Kredit" the table shows: net credit (we owe the agent) or
      // wallet balance. Surfaced in the report when positive.
      const creditAmt = Number(agent.netCredit ?? 0) > 0
        ? Number(agent.netCredit)
        : Number(agent.walletBalance ?? 0) > 0
          ? Number(agent.walletBalance)
          : 0;
      const pdfName = debtOnly
        ? `RAPORT DETYRIMET ${agent.name} DETYRIMI=${fmtM(debtAmt)}€`
        : `RAPORT I DETAJUAR ${agent.name} DETYRIMI=${fmtM(debtAmt)}€`;
      // Të dy raportet përdorin dizajnin kompakt landscape (një rresht për rezervim).
      // Krediti i portofolit shfaqet si gjendje informuese — NUK zbritet nga detyrimi.
      const html = generateDebtReportHTML(data, agent, {
        autoAction, filename: pdfName, agentCredit: creditAmt,
        hideTotals: !isAdmin && agent.showInReports === false,
        reportLabel: debtOnly ? "Raport Detyrimet" : "Raport i Detajuar",
        creditLabel: debtOnly ? "Kredit Gjendje (Info)" : "Balanca Kredit",
        // Raporti i detyrimeve fokusohet vetëm te borxhet — pa historikun e krediteve.
        creditTransactions: debtOnly ? [] : creditTransactions,
      });
      if (autoAction === "download") {
        // Download the PDF directly via a hidden iframe — no visible page/tab.
        downloadReportPDF(html);
      } else {
        const win = window.open("", "_blank");
        if (win) { win.document.write(html); win.document.close(); }
      }
    } catch (e: any) {
      toast({ title: "Gabim", description: e.message, variant: "destructive" });
    } finally {
      setReportLoadingId(null);
    }
  };

  // Eksport Excel (CSV me BOM, i lexueshëm nga Excel) — vetëm rezervimet me detyrim.
  const handleDebtExcel = async (agent: any) => {
    setReportLoadingId(agent.id);
    try {
      const [resp, { cpCodeOf, debtPaymentsSummary }] = await Promise.all([
        fetch(`${API_BASE}/payments/report?agentId=${agent.id}&debtFilter=debt`, { credentials: "include" }),
        import("@/lib/reportDetailed"),
      ]);
      if (!resp.ok) throw new Error("Gabim gjatë marrjes së të dhënave");
      const data: any[] = await resp.json();
      if (!Array.isArray(data) || data.length === 0) {
        toast({ title: "S'ka detyrime", description: `${agent.name} nuk ka asnjë rezervim me pagesë të mangët.` });
        return;
      }
      const esc = (v: any) => {
        const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").trim();
        return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      // Kolona "Kodi CP" — vetëm kur agjencia është ONLINE TRAVEL dhe ka kode CP.
      const showCp = data.some(b => cpCodeOf(b, agent.name));
      const header = ["Rezervimi", "PNR", ...(showCp ? ["Kodi CP"] : []), "Klienti", "Telefoni", "Nisja", "Mbërritja", "Linja", "Data e Fluturimit", "Krijuar", "Statusi", "Total (EUR)", "Paguar (EUR)", "Pagesa", "Detyrim (EUR)"].join(",");
      const rows = data.map(b => [
        esc(b.bookingRef),
        esc(b.pnr || ""),
        ...(showCp ? [esc(cpCodeOf(b, agent.name))] : []),
        esc(b.customerName),
        esc(b.customerPhone || ""),
        esc(b.flight?.fromCity || ""),
        esc(b.flight?.toCity || ""),
        esc(b.flight ? `${b.flight.airline} ${b.flight.flightNumber}` : ""),
        esc(b.flight?.departureDate || ""),
        esc(b.createdAt ? new Date(b.createdAt).toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""),
        esc(b.status),
        fmtM(b.totalAmount),
        fmtM(b.paidAmount),
        esc(debtPaymentsSummary(b)),
        fmtM(dueEuro(b.dueAmount)),
      ].join(","));
      const totalDue = data.reduce((s, b) => s + dueEuro(b.dueAmount), 0);
      const totalAll = data.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);
      const totalPaid = data.reduce((s, b) => s + Number(b.paidAmount ?? 0), 0);
      rows.push(["TOTALI", "", ...(showCp ? [""] : []), "", "", "", "", "", "", "", "", fmtM(totalAll), fmtM(totalPaid), "", fmtM(totalDue)].join(","));
      // Krediti në portofol — shfaqet si gjendje informuese, NUK zbritet nga detyrimi.
      const creditAmt = Number(agent.netCredit ?? 0) > 0
        ? Number(agent.netCredit)
        : Number(agent.walletBalance ?? 0) > 0
          ? Number(agent.walletBalance)
          : 0;
      if (creditAmt > 0) {
      rows.push(["KREDIT GJENDJE (PORTOFOLI)", "", ...(showCp ? [""] : []), "", "", "", "", "", "", "", "", "", "", "", fmtM(creditAmt)].join(","));
      }
      const csv = "\uFEFF" + header + "\n" + rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Detyrimet ${agent.name} ${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Gabim", description: e.message, variant: "destructive" });
    } finally {
      setReportLoadingId(null);
    }
  };

  const onSubmit = (values: AgentFormValues) => {
    if (!isAdmin) return;
    const payload = { ...values, financeEmail: values.financeEmail?.trim() || null };
    createAgent.mutate({ data: payload as any }, {
      onSuccess: () => {
        toast({ title: "Agjenti u krijua me sukses" });
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["agency-groups"] });
        setIsAddOpen(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Gabim gjatë krijimit", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      {isAdmin && <Link href={pendingView ? "/agents" : "/agents?pending=1"} className="text-sm font-medium text-primary underline">{pendingView ? "Kthehu te agjentët" : "Regjistrimet në pritje dhe email-et"}</Link>}
      {isAdmin && pendingView && <PublicEnrollments />}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agjentet</h1>
          <p className="text-muted-foreground">Menaxho rrjetin e agjentëve, komisionet dhe balacat.</p>
        </div>
        {isAdmin && <Button onClick={() => setIsAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Shto Agjent</Button>}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Shto Agjent të Ri</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Emri i Plotë</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="displayColor" render={({ field }) => (
                <FormItem><AgentColorPicker value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="company" render={({ field }) => (
                <FormItem><FormLabel>NIPT <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value || ""} placeholder="p.sh. L91234567A" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="groupId" render={({ field }) => (
                <FormItem><GroupSelector value={field.value ?? null} onChange={field.onChange} required /><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Telefon</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="financeEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email për Financat</FormLabel>
                  <FormControl><Input type="email" {...field} value={field.value || ""} placeholder="email për raportet financiare" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="commission" render={({ field }) => (
                  <FormItem><FormLabel>Komisioni (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="markup" render={({ field }) => (
                  <FormItem><FormLabel>Markup (€)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="markupPercent" render={({ field }) => (
                  <FormItem><FormLabel>Markup (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              {/* Discount section */}
              <div className="border rounded-lg p-4 space-y-3 bg-blue-50/50">
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4" /> Zbritja e Çmimeve
                </p>
                <FormField control={form.control} name="discountType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lloji i Zbritjes</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percent">Përqindje (%)</SelectItem>
                        <SelectItem value="fixed">Shumë Fikse (€)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {discountType === "percent" ? (
                  <FormField control={form.control} name="discountPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zbritja (%)</FormLabel>
                      <FormControl><Input type="number" min="0" max="100" step="0.5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ) : (
                  <FormField control={form.control} name="discountFixed" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zbritja (€ fikse)</FormLabel>
                      <FormControl><Input type="number" min="0" step="0.5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>

              <FormField control={form.control} name="notifyByEmail" render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 space-y-0">
                  <div>
                    <FormLabel>Njofto me email</FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">Agjenti merr me email çdo rezervim/biletë (me PDF) sa herë ndryshon statusi.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />

              <Button type="submit" className="w-full" disabled={createAgent.isPending}>
                {createAgent.isPending ? "Duke ruajtur..." : "Ruaj Agentin"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kërko</label>
          <Search className="absolute left-2.5 top-8 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kërko agjentë..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filtro sipas</label>
          <Select value={dateType} onValueChange={(value) => setDateType(value as "created" | "flight")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Datës së krijimit</SelectItem>
              <SelectItem value="flight">Datës së fluturimit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[calc(50%-0.25rem)] sm:w-[155px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nga data</label>
          <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="w-[calc(50%-0.25rem)] sm:w-[155px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deri më datë</label>
          <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="default"
          aria-pressed={debtorOnly}
          onClick={() => {
            setDebtorOnly((value) => {
              if (value) setSelectedDebtorIds(new Set());
              return !value;
            });
          }}
          className={`group gap-2 rounded-xl border px-4 font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md focus-visible:ring-red-500 focus-visible:ring-offset-2 motion-reduce:transition-none ${
            debtorOnly
              ? "border-red-800 bg-gradient-to-b from-red-700 to-red-900 shadow-red-900/25 ring-2 ring-red-300 ring-offset-2 hover:from-red-800 hover:to-red-950"
              : "border-red-600 bg-gradient-to-b from-red-500 to-red-700 shadow-red-600/20 hover:from-red-600 hover:to-red-800"
          }`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 ring-1 ring-inset ring-white/20">
            <TrendingDown className="h-4 w-4" />
          </span>
          Debitorë
        </Button>
        {debtorOnly && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedDebtorIds(allVisibleDebtorsSelected
                ? new Set()
                : new Set((sortedAgents ?? []).map((agent) => agent.id)))}
              disabled={(sortedAgents?.length ?? 0) === 0}
            >
              {allVisibleDebtorsSelected ? "Çzgjidh të gjitha" : "Zgjidh të gjitha"}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadSelectedDebtors}
              disabled={selectedDebtors.length === 0}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Shkarko PDF ({selectedDebtors.length})
            </Button>
          </>
        )}
        {(dateFrom || dateTo) && (
          <Button type="button" variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }} className="gap-1.5">
            <X className="h-4 w-4" />
            Pastro datat
          </Button>
        )}
        <div className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <CalendarDays className="h-4 w-4" />
          {dateFrom || dateTo
            ? `${dateType === "created" ? "Krijuar" : "Fluturimi"}: ${dateFrom || "fillimi"} – ${dateTo || "sot"}`
            : "Gjithë periudha"}
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              {debtorOnly && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleDebtorsSelected}
                    onCheckedChange={(checked) => setSelectedDebtorIds(checked
                      ? new Set((sortedAgents ?? []).map((agent) => agent.id))
                      : new Set())}
                    aria-label="Zgjidh të gjithë agjentët debitorë"
                  />
                </TableHead>
              )}
              <SortHeader k="name">Emri</SortHeader>
              <SortHeader k="company">NIPT</SortHeader>
              {showAgentCommission && <SortHeader k="totalCommission">Komisioni i Fituar</SortHeader>}
              {showAgentCommission && <SortHeader k="avgCommission">Komisioni Mesatar</SortHeader>}
              <SortHeader k="discount">Zbritja</SortHeader>
              <SortHeader k="totalBookings">Rezervime</SortHeader>
              <SortHeader k="totalPassengers">Klientë</SortHeader>
              <SortHeader k="totalSales">Shitje Totale</SortHeader>
              <SortHeader k="totalPaid">Paguar</SortHeader>
              <SortHeader k="totalDebt">Detyrim</SortHeader>
              <SortHeader k="balance">Balanca Kredit</SortHeader>
              {isAdmin && <SortHeader k="emails">Emailet</SortHeader>}
              <TableHead>Raport</TableHead>
              <SortHeader k="status">Statusi</SortHeader>
              {isAdmin && <TableHead>Vizita</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={(showAgentCommission ? 13 : 11) + (isAdmin ? 2 : 0) + (debtorOnly ? 1 : 0)} className="text-center py-8">Duke ngarkuar...</TableCell></TableRow>
            ) : sortedAgents?.length === 0 ? (
              <TableRow><TableCell colSpan={(showAgentCommission ? 13 : 11) + (isAdmin ? 2 : 0) + (debtorOnly ? 1 : 0)} className="text-center py-8 text-muted-foreground">Nuk u gjetën agjentë.</TableCell></TableRow>
            ) : (
              <>
              {(() => {
                // ── Rreshti i TOTALEVE në krye të kolonave (mbi listën e filtruar) ──
                const list = sortedAgents ?? [];
                const sum = (f: (a: any) => number) => list.reduce((s, a) => s + (Number(f(a)) || 0), 0);
                const tCommission = sum(a => a.totalCommission);
                const tPax = sum(a => a.totalPassengers);
                const tBookings = sum(a => a.totalBookings);
                const tSales = sum(a => a.totalSales);
                const tPaid = sum(a => a.totalPaid);
                const tDebt = sum(a => a.totalDebt);
                // Njësoj si kolona: kredit neto kur ka, ndryshe balanca e wallet-it
                const tCredit = sum(a => (a.netCredit > 0 ? a.netCredit : a.walletBalance > 0 ? a.walletBalance : 0));
                const avg = tPax > 0 ? tCommission / tPax : 0;
                return (
                  <TableRow className="bg-slate-100 hover:bg-slate-100 border-b-2 border-slate-300">
                    {debtorOnly && <TableCell />}
                    <TableCell className="font-bold text-slate-800">TOTALI ({list.length})</TableCell>
                    <TableCell />
                    {showAgentCommission && (
                      <TableCell className={`font-bold ${tCommission < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {tCommission < 0 ? `-€${fmtM(Math.abs(tCommission))}` : `€${fmtM(tCommission)}`}
                      </TableCell>
                    )}
                    {showAgentCommission && (
                      <TableCell className={`font-bold ${avg < 0 ? "text-red-600" : avg > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {avg < 0 ? `-€${fmtM(Math.abs(avg))}` : avg > 0 ? `€${fmtM(avg)}` : "—"}
                      </TableCell>
                    )}
                    <TableCell />
                    <TableCell className="font-bold">{tBookings}</TableCell>
                    <TableCell className="font-bold">{tPax}</TableCell>
                    <TableCell className="font-bold">€{fmtM(tSales)}</TableCell>
                    <TableCell className="font-bold text-emerald-700">€{fmtM(tPaid)}</TableCell>
                    <TableCell className="font-bold text-red-600">€{fmtM(tDebt)}</TableCell>
                    <TableCell className="font-bold text-emerald-600">{tCredit > 0 ? `+€${fmtM(tCredit)}` : "—"}</TableCell>
                    {isAdmin && <TableCell />}
                    <TableCell />
                    <TableCell />
                    {isAdmin && <TableCell />}
                  </TableRow>
                );
              })()}
              {sortedAgents?.map((agent) => {
                const debtAmt = agent.totalDebt ?? 0;
                const discLabel = agent.discountType === "fixed"
                  ? `€${fmtM(agent.discountFixed ?? 0)}`
                  : `${agent.discountPercent}%`;
                return (
                  <TableRow key={agent.id}>
                    {debtorOnly && (
                      <TableCell>
                        <Checkbox
                          checked={selectedDebtorIds.has(agent.id)}
                          onCheckedChange={(checked) => setSelectedDebtorIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(agent.id);
                            else next.delete(agent.id);
                            return next;
                          })}
                          aria-label={`Zgjidh ${agent.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentId(agent.id)}
                        className="font-medium text-primary hover:underline text-left inline-flex items-center gap-1.5"
                      >
                        <AgentRankBadge agentName={agent.name} />
                        <span>{agent.name}{agent.groupName && <span className="block text-xs text-muted-foreground">Grupi: {agent.groupName}</span>}</span>
                      </button>
                    </TableCell>
                    <TableCell>{agent.company || "-"}
                      {isAdmin && <button className="block text-xs text-primary hover:underline mt-1 text-left" onClick={() => setUsersAgent({ id: agent.id, name: agent.name })}>
                        Përdoruesit: {linkedUsers.isPending ? "…" : linkedUsers.isError ? "Hap listën" : (linkedUsers.data?.filter(u => u.agentId === agent.id).map(u => u.name).join(", ") || "Pa përdorues")} · Menaxho
                      </button>}
                    </TableCell>
                    {showAgentCommission && (
                    <TableCell className={agent.totalCommission < 0 ? "text-red-600 font-semibold" : agent.totalCommission > 0 ? "text-emerald-700 font-semibold" : "text-muted-foreground"}>
                      {agent.totalCommission < 0
                        ? `-€${fmtM(Math.abs(agent.totalCommission))}`
                        : agent.totalCommission > 0
                          ? `€${fmtM(agent.totalCommission)}`
                          : "—"}
                    </TableCell>
                    )}
                    {showAgentCommission && (() => {
                      const pax = Number(agent.totalPassengers ?? 0);
                      const avg = pax > 0 ? Number(agent.totalCommission ?? 0) / pax : 0;
                      return (
                        <TableCell className={avg < 0 ? "text-red-600 font-medium" : avg > 0 ? "text-emerald-700 font-medium" : "text-muted-foreground"}>
                          {avg < 0 ? `-€${fmtM(Math.abs(avg))}` : avg > 0 ? `€${fmtM(avg)}` : "—"}
                        </TableCell>
                      );
                    })()}
                    <TableCell>
                      <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">
                        {discLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>{agent.totalBookings}</TableCell>
                    <TableCell>{agent.totalPassengers ?? 0}</TableCell>
                    <TableCell className="font-medium">€{fmtM(agent.totalSales ?? 0)}</TableCell>
                    <TableCell className={agent.totalPaid > 0 ? "text-emerald-700 font-medium" : "text-muted-foreground"}>
                      {agent.totalPaid > 0 ? `€${fmtM(agent.totalPaid)}` : "—"}
                    </TableCell>
                    <TableCell className={debtAmt > 0 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                      {debtAmt > 0 ? (
                        <span title={`Borxh neto pas zbritjes së kredive të wallet-it`}>
                          €{fmtM(debtAmt)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {agent.netCredit > 0 ? (
                        <span className="text-emerald-600 font-bold" title="Kredit neto (ne i kemi borxh agjentit)">
                          +€{fmtM(agent.netCredit)}
                        </span>
                      ) : agent.walletBalance > 0 ? (
                        <span className="text-blue-600 font-medium">€{fmtM(agent.walletBalance)}</span>
                      ) : (
                        <span className="text-muted-foreground">€0.00</span>
                      )}
                    </TableCell>
                    {isAdmin && (() => {
                      const labels = agentEmailLabels(agent);
                      const masterOff = (agent as any).notifyByEmail === false;
                      const title = masterOff
                        ? "Njoftimi me email është i FIKUR për këtë agjent"
                        : labels.length > 0
                          ? `Emailet aktive:\n• ${labels.join("\n• ")}`
                          : "Asnjë email statusi aktiv";
                      return (
                        <TableCell>
                          <span title={title} className="cursor-help">
                            <Badge
                              variant="outline"
                              className={labels.length > 0
                                ? "text-emerald-700 border-emerald-300 bg-emerald-50 text-xs"
                                : "text-red-600 border-red-300 bg-red-50 text-xs"}
                            >
                              {labels.length}/{EMAIL_KINDS.length}
                            </Badge>
                          </span>
                        </TableCell>
                      );
                    })()}
                    <TableCell>
                      <div className="relative inline-block group">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={reportLoadingId === agent.id}
                          onClick={() => handleGenerateReport(agent)}
                        >
                          {reportLoadingId === agent.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <FileText className="h-3.5 w-3.5" />}
                          Gjenero Raport
                        </Button>
                        {reportLoadingId !== agent.id && (
                          <div className="absolute right-0 top-full z-30 hidden min-w-[150px] pt-1 group-hover:block">
                            <div className="rounded-md border bg-popover p-1 shadow-md">
                              <button
                                type="button"
                                onClick={() => handleGenerateReport(agent, "print")}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Printo
                              </button>
                              <button
                                type="button"
                                onClick={() => handleGenerateReport(agent, "download")}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Shkarko
                              </button>
                              <div className="my-1 border-t" />
                              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-600">Raport Detyrimet</div>
                              <button
                                type="button"
                                onClick={() => handleGenerateReport(agent, "print", true)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Printo
                              </button>
                              <button
                                type="button"
                                onClick={() => handleGenerateReport(agent, "download", true)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Shkarko PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDebtExcel(agent)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Shkarko Excel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.status === "active" ? "default" : "secondary"}>{agent.status === "active" ? "Aktiv" : "Joaktiv"}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActivityAgent({ id: agent.id, name: agent.company || agent.name }); }}
                          title="Shiko aktivitetin e plotë / shkarko raport"
                          className="flex flex-col leading-tight text-left hover:text-primary transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-muted"
                        >
                          {Number(agent.loginCount ?? 0) > 0 ? (
                            <>
                              <span className="font-semibold tabular-nums underline decoration-dotted underline-offset-2">{agent.loginCount}</span>
                              {agent.lastLoginAt && (
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(agent.lastLoginAt).toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground underline decoration-dotted underline-offset-2">Shiko</span>
                          )}
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedAgentId} onOpenChange={open => { if (!open) setSelectedAgentId(null); }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[92vh] overflow-y-auto p-6">
          <DialogHeader className="sr-only"><DialogTitle>Detajet e Agjentit</DialogTitle></DialogHeader>
          {selectedAgentId && (
            <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Duke ngarkuar detajet...</div>}>
              <AgentDetailContent id={selectedAgentId} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>

      {isAdmin && usersAgent && <AgentUsers key={usersAgent.id} agent={usersAgent} onClose={() => setUsersAgent(null)} />}
      {activityAgent && (
        <Suspense fallback={<div role="status" className="sr-only">Duke ngarkuar aktivitetin...</div>}>
          <AgentActivityDialog
            agentId={activityAgent.id}
            agentName={activityAgent.name}
            open
            onOpenChange={(o) => { if (!o) setActivityAgent(null); }}
          />
        </Suspense>
      )}
    </div>
  );
}
