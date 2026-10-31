import { useMemo, useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtM, fmtDateTimeAmPm } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList, PieChart, Pie, Cell } from "recharts";
import { useGetSalesReport, useGetRoutePerformance, useGetAirlinePerformance, useGetAgentSales } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useGetDetailedFlightsReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileSpreadsheet, FileText, Loader2, ArrowUpDown, ChevronUp, ChevronDown, Search } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { AgentRankBadge } from "@/components/AgentRankBadge";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";
const AGENT_CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#0891b2", "#ea580c", "#4f46e5"];

type AgentMetric = {
  agentId: number;
  agentName: string;
  company: string | null;
  totalBookings: number;
  totalPassengers: number;
  totalSales: number;
  totalCommission: number;
};

type RouteMetric = {
  route: string;
  totalFlights: number;
  totalBookings: number;
  totalRevenue: number;
  occupancyRate: number;
};

function AgentDonut({
  title,
  subtitle,
  data,
  centerLabel,
  centerValue,
  valueFormatter,
}: {
  title: string;
  subtitle: string;
  data: Array<{ agentName: string; value: number; percentage: number; color: string; rank: number; totalPassengers: number }>;
  centerLabel: string;
  centerValue: string;
  valueFormatter: (value: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1fr)] items-center">
        <div className="h-[250px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="agentName" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="transparent">
                {data.map((entry) => <Cell key={entry.agentName} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(value: number, _name: string, item: any) => [
                  `${valueFormatter(Number(value))} · ${item?.payload?.percentage ?? 0}%`,
                  item?.payload?.agentName ?? "Agjent",
                ]}
              />
              <text x="50%" y="47%" textAnchor="middle" className="fill-muted-foreground text-[11px]">{centerLabel}</text>
              <text x="50%" y="57%" textAnchor="middle" className="fill-foreground text-[18px] font-bold">{centerValue}</text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {data.map((entry) => (
            <div key={entry.agentName} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 w-5 text-center text-[10px] font-bold text-muted-foreground/70 tabular-nums">#{entry.rank}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="truncate font-medium">{entry.agentName}</span>
              </div>
              <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-blue-600 font-medium">{entry.totalPassengers} pax</span>
                <span>{valueFormatter(entry.value)} · {entry.percentage}%</span>
              </div>
            </div>
          ))}
          {!data.length && <p className="py-8 text-center text-sm text-muted-foreground">Nuk ka të dhëna për këtë periudhë.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function downloadExport(type: string) {
  const url = `${API_BASE}/reports/export?type=${type}`;
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

function DetailedFlightsTab({
  dateFrom,
  dateTo,
  canProfit,
  canCommission,
  canExport,
}: {
  dateFrom: string;
  dateTo: string;
  canProfit: boolean;
  canCommission: boolean;
  canExport: boolean;
}) {
  const { data, isLoading } = useGetDetailedFlightsReport({ dateFrom, dateTo });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const groups = data?.groups || [];

  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    const s = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.key.toLowerCase().includes(s) ||
        g.route.toLowerCase().includes(s) ||
        g.airline.toLowerCase().includes(s) ||
        g.flightNumber.toLowerCase().includes(s)
    );
  }, [groups, search]);

  const selectedGroups = useMemo(
    () => groups.filter((g) => selectedKeys.has(g.key)),
    [groups, selectedKeys]
  );

  const aggregates = useMemo(() => {
    if (selectedGroups.length === 0) return null;
    const agg = {
      totalBookings: 0,
      totalPassengers: 0,
      totalSeats: 0,
      occupiedSeats: 0,
      totalRevenue: 0,
      totalPaid: 0,
      totalDue: 0,
      totalNet: 0,
      netComplete: true,
      totalCommission: 0,
      statuses: { draft: 0, pending: 0, confirmed: 0, ticketed: 0, cancelled: 0 },
    };
    for (const g of selectedGroups) {
      agg.totalBookings += g.totalBookings;
      agg.totalPassengers += g.totalPassengers;
      agg.totalSeats += g.totalSeats;
      agg.occupiedSeats += g.occupiedSeats;
      agg.totalRevenue += g.totalRevenue;
      agg.totalPaid += g.totalPaid;
      agg.totalDue += g.totalDue;
      agg.totalNet += g.totalNet;
      agg.netComplete = agg.netComplete && g.netComplete;
      agg.totalCommission += g.totalCommission;
      agg.statuses.draft += g.statuses.draft;
      agg.statuses.pending += g.statuses.pending;
      agg.statuses.confirmed += g.statuses.confirmed;
      agg.statuses.ticketed += g.statuses.ticketed;
      agg.statuses.cancelled += g.statuses.cancelled;
    }
    return agg;
  }, [selectedGroups]);

  const chartData = useMemo(() => {
    if (selectedGroups.length === 0) return [];
    const dateMap = new Map<string, number>();
    for (const g of selectedGroups) {
      for (const d of g.dates) {
        const dateKey = d.departureDate.split("T")[0];
        const current = dateMap.get(dateKey) || 0;
        dateMap.set(dateKey, current + d.totalPassengers);
      }
    }
    const sorted = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([date, passengers]) => ({
      date: format(new Date(date), "dd MMM"),
      passengers,
    }));
  }, [selectedGroups]);

  function toggleSelection(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        filteredGroups.forEach((g) => next.add(g.key));
      } else {
        filteredGroups.forEach((g) => next.delete(g.key));
      }
      return next;
    });
  }

  function downloadPdf() {
    if (!selectedGroups.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(16);
    doc.text("Raporti i Detajuar i Fluturimeve", 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Periudha: ${dateFrom} - ${dateTo} | Gjeneruar: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    let currentY = 28;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Permbledhja", 14, currentY);
    currentY += 6;

    const summaryHeaders = ["Rezervime", "Pasagjere", "Zenie", "Te Ardhurat", "Te Paguara", "Mbetje"];
    if (canProfit) summaryHeaders.push("Neto", "Fitimi");

    const occPct = aggregates!.totalSeats > 0 ? ((aggregates!.occupiedSeats / aggregates!.totalSeats) * 100).toFixed(1) : "0.0";
    const summaryRow: string[] = [
      aggregates!.totalBookings.toString(),
      aggregates!.totalPassengers.toString(),
      `${occPct}% (${aggregates!.occupiedSeats}/${aggregates!.totalSeats})`,
      `EUR ${fmtM(aggregates!.totalRevenue)}`,
      `EUR ${fmtM(aggregates!.totalPaid)}`,
      `EUR ${fmtM(aggregates!.totalDue)}`,
    ];
    if (canProfit) {
      summaryRow.push(
        aggregates!.netComplete ? `EUR ${fmtM(aggregates!.totalNet)}` : "E paplote",
        `EUR ${fmtM(aggregates!.totalCommission)}`,
      );
    }

    autoTable(doc, {
      startY: currentY,
      head: [summaryHeaders],
      body: [summaryRow],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;

    const pipelineTotal = Object.values(aggregates!.statuses).reduce((sum, value) => sum + value, 0) || 1;
    autoTable(doc, {
      startY: currentY,
      head: [["Draft", "Pritje", "Konfirmuar", "Ticketed", "Anuluar"]],
      body: [[
        `${aggregates!.statuses.draft} (${((aggregates!.statuses.draft / pipelineTotal) * 100).toFixed(1)}%)`,
        `${aggregates!.statuses.pending} (${((aggregates!.statuses.pending / pipelineTotal) * 100).toFixed(1)}%)`,
        `${aggregates!.statuses.confirmed} (${((aggregates!.statuses.confirmed / pipelineTotal) * 100).toFixed(1)}%)`,
        `${aggregates!.statuses.ticketed} (${((aggregates!.statuses.ticketed / pipelineTotal) * 100).toFixed(1)}%)`,
        `${aggregates!.statuses.cancelled} (${((aggregates!.statuses.cancelled / pipelineTotal) * 100).toFixed(1)}%)`,
      ]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;

    selectedGroups.forEach(g => {
      if (currentY > 170) { doc.addPage(); currentY = 20; }

      doc.setFontSize(11);
      doc.setTextColor(30, 64, 175);
      doc.text(`Grupi: ${g.airline} ${g.flightNumber} | ${g.route}`, 14, currentY);
      currentY += 6;

      doc.setFontSize(9);
      doc.setTextColor(50);
      const gOccPct = g.totalSeats > 0 ? ((g.occupiedSeats / g.totalSeats) * 100).toFixed(1) : "0.0";
      const groupFinancials = [
        `Rezervime: ${g.totalBookings}`,
        `Pasagjere: ${g.totalPassengers}`,
        `Zenie: ${gOccPct}%`,
        `Shitje: EUR ${fmtM(g.totalRevenue)}`,
        `Paguar: EUR ${fmtM(g.totalPaid)}`,
        `Mbetje: EUR ${fmtM(g.totalDue)}`,
      ];
      if (canProfit) {
        groupFinancials.push(
          `Neto: ${g.netComplete ? `EUR ${fmtM(g.totalNet)}` : "E paplote"}`,
          `Fitimi: EUR ${fmtM(g.totalCommission)}`,
        );
      }
      doc.text(groupFinancials.join(" | "), 14, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [["Nisja", "Kthimi", "Status", "Zenie", "Rezervime", "Pasagjere", "Shitje", "Paguar", "Mbetje"]],
        body: g.dates.map(d => {
          const dOccPct = d.totalSeats > 0 ? ((d.occupiedSeats / d.totalSeats) * 100).toFixed(1) : "0.0";
          return [
            `${format(new Date(d.departureDate), "dd MMM")} ${d.departureTime.slice(0, 5)}`,
            `${format(new Date(d.arrivalDate), "dd MMM")} ${d.arrivalTime.slice(0, 5)}`,
            d.flightStatus,
            `${dOccPct}%`,
            d.totalBookings,
            d.totalPassengers,
            `EUR ${fmtM(d.totalRevenue)}`,
            `EUR ${fmtM(d.totalPaid)}`,
            `EUR ${fmtM(d.totalDue)}`,
          ];
        }),
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 220, 220], lineWidth: 0.1 },
        headStyles: { textColor: 0, fontStyle: "bold" },
      });
      currentY = (doc as any).lastAutoTable.finalY + 6;

      if (g.agents.length > 0) {
        const agentHeaders = ["Agjenti", "Rezervime", "Pasagjere", "Shitje", "Paguar", "Mbetje", "Pesha"];
        if (canCommission) agentHeaders.push("Komisioni");

        autoTable(doc, {
          startY: currentY,
          head: [agentHeaders],
          body: g.agents.map(a => {
            const row = [
              a.agentName,
              a.totalBookings,
              a.totalPassengers,
              `EUR ${fmtM(a.totalSales)}`,
              `EUR ${fmtM(a.totalPaid)}`,
              `EUR ${fmtM(a.totalDue)}`,
              `${a.salesShare.toFixed(1)}%`,
            ];
            if (canCommission) row.push(`EUR ${fmtM(a.totalCommission)}`);
            return row;
          }),
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 1.5, lineColor: [220, 220, 220], lineWidth: 0.1 },
          headStyles: { textColor: 0, fontStyle: "bold" },
        });
        currentY = (doc as any).lastAutoTable.finalY + 12;
      } else {
        currentY += 6;
      }
    });

    doc.save(`Raporti_Detajuar_${dateFrom}_${dateTo}.pdf`);
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
      <Card className="flex flex-col h-[600px] lg:sticky top-4">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Grupet e Fluturimeve</h3>
            {selectedKeys.size > 0 && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-selected-count">
                {selectedKeys.size} zgjedhur
              </Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kerko..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-detailed"
            />
          </div>
          <div className="flex items-center gap-2 pt-1 pb-1">
            <Checkbox
              id="select-all-detailed"
              checked={filteredGroups.length > 0 && filteredGroups.every(g => selectedKeys.has(g.key))}
              onCheckedChange={(c) => toggleAll(c as boolean)}
              data-testid="checkbox-select-all"
            />
            <label htmlFor="select-all-detailed" className="text-xs font-medium cursor-pointer">
              Zgjidh te gjitha ({filteredGroups.length})
            </label>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Nuk u gjet asnje grup.</div>
          ) : (
            filteredGroups.map(g => (
              <label
                key={g.key}
                htmlFor={`detailed-flight-${g.key}`}
                className="flex items-start gap-2 p-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                data-testid={`row-detailed-flight-${g.key}`}
              >
                <Checkbox
                  id={`detailed-flight-${g.key}`}
                  className="mt-1"
                  checked={selectedKeys.has(g.key)}
                  onCheckedChange={c => toggleSelection(g.key, c as boolean)}
                  data-testid={`checkbox-group-${g.key}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={`${g.airline} ${g.flightNumber}`}>
                    {g.airline} {g.flightNumber}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{g.route}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium">{g.totalBookings} rez</p>
                  <p className="text-[10px] text-muted-foreground">{g.totalPassengers} pax</p>
                </div>
              </label>
            ))
          )}
        </div>
      </Card>

      <div className="min-w-0 space-y-6">
        {selectedGroups.length === 0 ? (
          <Card className="py-24 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-dashed">
            <FileText className="h-10 w-10 mb-4 opacity-20" />
            <p>Zgjidhni nje ose me shume fluturime nga lista per te pare detajet.</p>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Performanca e Perbashket</h2>
              {canExport && (
                <Button size="sm" onClick={downloadPdf} className="gap-2" data-testid="button-download-detailed-pdf">
                  <FileText className="h-4 w-4" /> Shkarko PDF
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium">Rezervime Totale</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-aggregate-bookings">{aggregates!.totalBookings}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium">Pasagjere</p>
                  <p className="text-2xl font-bold mt-1" data-testid="text-aggregate-passengers">{aggregates!.totalPassengers}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium">Zenia Mesatare</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-2xl font-bold">
                      {aggregates!.totalSeats > 0 ? ((aggregates!.occupiedSeats / aggregates!.totalSeats) * 100).toFixed(1) : 0}%
                    </p>
                    <span className="text-xs text-muted-foreground">{aggregates!.occupiedSeats} / {aggregates!.totalSeats}</span>
                  </div>
                  <Progress value={aggregates!.totalSeats > 0 ? (aggregates!.occupiedSeats / aggregates!.totalSeats) * 100 : 0} className="h-1.5 mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium">Te Ardhurat</p>
                  <p className="text-2xl font-bold mt-1">€{fmtM(aggregates!.totalRevenue)}</p>
                  {canProfit && (
                    <p className="text-xs text-emerald-600 font-medium mt-1">
                      Neto: {aggregates!.netComplete ? `€${fmtM(aggregates!.totalNet)}` : "E paplotë"}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-semibold">Statusi i Rezervimeve</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex divide-x">
                  {Object.entries(aggregates!.statuses).map(([status, count]) => {
                    const total = Object.values(aggregates!.statuses).reduce((sum, value) => sum + value, 0) || 1;
                    const pct = ((count / total) * 100).toFixed(1);
                    return (
                      <div key={status} className="flex-1 p-4 text-center">
                        <p className="text-xs text-muted-foreground capitalize">{status}</p>
                        <p className="text-lg font-semibold mt-1">{count}</p>
                        <p className="text-[10px] text-muted-foreground">{pct}%</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="pt-6 pb-2 px-2" data-testid="chart-passenger-trends">
              <div className="flex justify-between items-center mb-6 px-4">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Ecuria e Pasagjerëve</h3>
                <div className="text-[13px] font-semibold text-blue-600">
                  {aggregates!.totalPassengers} pasagjerë gjithsej
                </div>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                    <XAxis
                       dataKey="date"
                       axisLine={{ stroke: "#e5e7eb" }}
                       tickLine={false}
                       tick={{ fontSize: 10, fill: "#9ca3af" }}
                       minTickGap={20}
                    />
                    <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ fontSize: '12px', borderRadius: '6px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="passengers" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-6">
              {selectedGroups.map(g => (
                <Card key={g.key} className="overflow-hidden border shadow-sm" data-testid={`card-detail-${g.key}`}>
                  <div className="px-6 py-4 border-b bg-white dark:bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide text-sm">{g.airline} {g.flightNumber}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{g.route}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-[13px]">
                        <div><span className="text-muted-foreground mr-1.5">Zenia:</span><span className="font-semibold text-gray-900 dark:text-gray-100">{g.totalSeats > 0 ? ((g.occupiedSeats / g.totalSeats) * 100).toFixed(1) : 0}%</span></div>
                        <div><span className="text-muted-foreground mr-1.5">Shitje:</span><span className="font-semibold text-gray-900 dark:text-gray-100">€{fmtM(g.totalRevenue)}</span></div>
                        {canProfit && <div><span className="text-muted-foreground mr-1.5">Fitimi:</span><span className="font-semibold text-emerald-600">€{fmtM(g.totalCommission)}</span></div>}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-3 border-b bg-gray-50/50 dark:bg-muted/10">
                    <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Datat e Fluturimeve ({g.dates.length})
                    </h5>
                  </div>

                  <div className="px-6 flex flex-col">
                    {g.dates.map(d => {
                      const occPct = d.totalSeats > 0 ? (d.occupiedSeats / d.totalSeats) * 100 : 0;
                      return (
                        <div key={d.flightId} className="flex flex-col sm:flex-row sm:items-center text-sm py-3 border-b last:border-b-0 gap-3 sm:gap-0">
                          <div className="w-[100px] shrink-0">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{format(new Date(d.departureDate), "dd MMM")}</p>
                            <p className="text-[11px] text-muted-foreground">{d.departureTime.slice(0,5)} - {d.arrivalTime.slice(0,5)}</p>
                          </div>
                          <div className="w-[80px] shrink-0 text-left sm:text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                              {d.flightStatus.toLowerCase()}
                            </span>
                          </div>

                          <div className="flex-1 sm:px-6 flex flex-col justify-center min-w-[200px]">
                            <div className="flex justify-between text-[11px] mb-1.5">
                              <span className="text-muted-foreground">{d.totalPassengers} pax · {d.occupiedSeats} / {d.totalSeats} vende</span>
                              <span className="font-medium text-foreground">{occPct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(occPct, 100)}%` }} />
                            </div>
                          </div>

                          <div className="sm:w-[80px] shrink-0 sm:text-right flex justify-between sm:block">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">€{fmtM(d.totalRevenue)}</p>
                            <p className="text-[11px] text-muted-foreground">{d.totalBookings} rez</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {g.agents.length > 0 && (
                    <div className="p-6 pt-3 space-y-3 bg-gray-50/30 dark:bg-muted/5 border-t">
                      <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Shitjet sipas Agjenteve ({g.agents.length})</h5>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs h-8">Agjenti</TableHead>
                            <TableHead className="text-xs h-8 text-right">Rezervime</TableHead>
                            <TableHead className="text-xs h-8 text-right">Pasagjere</TableHead>
                            <TableHead className="text-xs h-8 text-right">Shitje</TableHead>
                            {canCommission && <TableHead className="text-xs h-8 text-right">Komisioni</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.agents.map((a, i) => (
                            <TableRow key={a.agentId || `none-${i}`}>
                              <TableCell className="font-medium">{a.agentName}</TableCell>
                              <TableCell className="text-right">{a.totalBookings}</TableCell>
                              <TableCell className="text-right">{a.totalPassengers}</TableCell>
                              <TableCell className="text-right font-semibold">€{fmtM(a.totalSales)}</TableCell>
                              {canCommission && <TableCell className="text-right text-emerald-600 font-medium">€{fmtM(a.totalCommission)}</TableCell>}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Reports() {
  const { hasPermission } = useAdminAuth();
  const canSales      = hasPermission("can_view_sales_report");
  const canRoutes     = hasPermission("can_view_route_report");
  const canAirlines   = hasPermission("can_view_airline_report");
  const canAgents     = hasPermission("can_view_agent_report");
  const canProfit     = hasPermission("can_view_profit_in_reports");
  const canCommission = hasPermission("can_view_commission_in_reports");
  const canExport     = hasPermission("can_export_reports");
  const tabs = [
    canSales    && { value: "sales",    label: "Sales Overview" },
    canRoutes   && { value: "routes",   label: "Route Performance" },
    canAirlines && { value: "airlines", label: "Airlines" },
    canAgents   && { value: "agents",   label: "Agent Sales" },
    canRoutes   && { value: "detailed_flights", label: "Fluturimet e Detajuara" },
  ].filter(Boolean) as { value: string; label: string }[];
  const defaultTab = tabs[0]?.value ?? "sales";
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [xlsLoading, setXlsLoading] = useState(false);
  const [liveXlsLoading, setLiveXlsLoading] = useState(false);
  const [liveInfo, setLiveInfo] = useState<{ updatedAt?: string; sizeKb?: number } | null>(null);
  const [showPct, setShowPct] = useState(false);
  const [selectedRouteKeys, setSelectedRouteKeys] = useState<Set<string>>(new Set());
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<number>>(new Set());
  const [routeSortCol, setRouteSortCol] = useState<keyof RouteMetric>("route");
  const [routeSortDir, setRouteSortDir] = useState<"asc" | "desc">("asc");

  async function downloadExcel() {
    setXlsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports/export/excel`, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FMS_Pro_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setXlsLoading(false);
    }
  }

  async function downloadLiveExcel() {
    setLiveXlsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports/export/excel/live`, { credentials: "include" });
      if (res.status === 401) { alert("Sesioni ka skaduar. Dil dhe kyçu sërisht."); return; }
      if (res.status === 403) { alert("Nuk ke leje për të shkarkuar Excel."); return; }
      if (!res.ok) { alert(`Gabim gjatë shkarkimit (${res.status}). Provo përsëri.`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FMS_Pro_Live_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      // Refresh status
      fetch(`${API_BASE}/reports/export/excel/status`, { credentials: "include" })
        .then(r => r.json()).then(d => setLiveInfo(d)).catch(() => {});
    } finally {
      setLiveXlsLoading(false);
    }
  }

  // Load live Excel status on mount
  useEffect(() => {
    fetch(`${API_BASE}/reports/export/excel/status`, { credentials: "include" })
      .then(r => r.json()).then(d => setLiveInfo(d)).catch(() => {});
  }, []);

  const [agentSortCol, setAgentSortCol] = useState<
    "agentName" | "company" | "shitjePct" | "totalBookings" | "totalPassengers" | "totalSales" | "mesatare" | "totalCommission" | "komisionPct"
  >("totalSales");
  const [agentSortDir, setAgentSortDir] = useState<"asc" | "desc">("desc");

  function toggleAgentSort(col: typeof agentSortCol) {
    if (col === agentSortCol) setAgentSortDir(d => d === "asc" ? "desc" : "asc");
    else { setAgentSortCol(col); setAgentSortDir("desc"); }
  }

  const { data: salesData } = useGetSalesReport({ dateFrom, dateTo, groupBy: "day" });
  const { data: routesData } = useGetRoutePerformance({ dateFrom, dateTo });
  const { data: airlinesData } = useGetAirlinePerformance({ dateFrom, dateTo });
  const { data: agentsData } = useGetAgentSales({ dateFrom, dateTo });
  const routeMetrics = useMemo<RouteMetric[]>(() => (
    (routesData ?? []).map((route: any) => ({
      route: String(route.route ?? ""),
      totalFlights: Number(route.totalFlights ?? 0),
      totalBookings: Number(route.totalBookings ?? 0),
      totalRevenue: Number(route.totalRevenue ?? 0),
      occupancyRate: Number(route.occupancyRate ?? 0),
    }))
  ), [routesData]);
  const sortedRouteMetrics = useMemo(() => (
    [...routeMetrics].sort((a, b) => {
      const av = a[routeSortCol];
      const bv = b[routeSortCol];
      const comparison = typeof av === "string"
        ? av.localeCompare(String(bv))
        : Number(av) - Number(bv);
      return routeSortDir === "asc" ? comparison : -comparison;
    })
  ), [routeMetrics, routeSortCol, routeSortDir]);
  const agentMetrics = useMemo<AgentMetric[]>(() => (
    (agentsData?.agents ?? []).map((agent) => ({
      ...agent,
      totalPassengers: Number(agent.totalPassengers ?? 0),
      totalSales: Number(agent.totalSales ?? 0),
      totalCommission: Number(agent.totalCommission ?? 0),
    })).filter((agent) => agent.totalBookings > 0)
  ), [agentsData]);
  const agentTotals = useMemo(() => agentMetrics.reduce((totals, agent) => ({
    sales: totals.sales + agent.totalSales,
    bookings: totals.bookings + agent.totalBookings,
    passengers: totals.passengers + agent.totalPassengers,
    commission: totals.commission + agent.totalCommission,
  }), { sales: 0, bookings: 0, passengers: 0, commission: 0 }), [agentMetrics]);

  const sortedAgentMetrics = useMemo(() => {
    const totalSales = agentTotals.sales || 1;
    const totalCommission = agentTotals.commission || 1;
    return [...agentMetrics].sort((a, b) => {
      let av = 0, bv = 0;
      switch (agentSortCol) {
        case "agentName":    av = a.agentName.localeCompare(b.agentName); return agentSortDir === "asc" ? av : -av;
        case "company":      av = (a.company ?? "").localeCompare(b.company ?? ""); return agentSortDir === "asc" ? av : -av;
        case "shitjePct":    av = a.totalSales / totalSales; bv = b.totalSales / totalSales; break;
        case "totalBookings": av = a.totalBookings; bv = b.totalBookings; break;
        case "totalPassengers": av = a.totalPassengers; bv = b.totalPassengers; break;
        case "totalSales":   av = a.totalSales; bv = b.totalSales; break;
        case "mesatare":     av = a.totalBookings ? a.totalSales / a.totalBookings : 0; bv = b.totalBookings ? b.totalSales / b.totalBookings : 0; break;
        case "totalCommission": av = a.totalCommission; bv = b.totalCommission; break;
        case "komisionPct":  av = a.totalCommission / totalCommission; bv = b.totalCommission / totalCommission; break;
      }
      return agentSortDir === "asc" ? av - bv : bv - av;
    });
  }, [agentMetrics, agentTotals, agentSortCol, agentSortDir]);

  useEffect(() => {
    const available = new Set(routeMetrics.map(route => route.route));
    setSelectedRouteKeys(current => {
      const next = new Set([...current].filter(key => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [routeMetrics]);

  useEffect(() => {
    const available = new Set(agentMetrics.map(agent => agent.agentId));
    setSelectedAgentIds(current => {
      const next = new Set([...current].filter(id => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [agentMetrics]);

  function toggleRouteSort(col: keyof RouteMetric) {
    if (col === routeSortCol) setRouteSortDir(direction => direction === "asc" ? "desc" : "asc");
    else {
      setRouteSortCol(col);
      setRouteSortDir(col === "route" ? "asc" : "desc");
    }
  }

  function toggleSelection<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, key: T, checked: boolean) {
    setter(current => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function saveReportPdf(title: string, headers: string[], rows: Array<Array<string | number>>, filename: string) {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text(title, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Periudha: ${dateFrom} - ${dateTo} | Gjeneruar: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [headers],
      body: rows,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    doc.save(filename);
  }

  function downloadSelectedRoutesPdf() {
    const selected = sortedRouteMetrics.filter(route => selectedRouteKeys.has(route.route));
    if (!selected.length) {
      alert("Zgjidh të paktën një rrugë për PDF.");
      return;
    }
    saveReportPdf(
      "Raporti i Performances se Rrugeve",
      ["Rruga", "Fluturime", "Rezervime", "Te ardhura", "Zenie"],
      selected.map(route => [
        route.route,
        route.totalFlights,
        route.totalBookings,
        `EUR ${fmtM(route.totalRevenue)}`,
        `${route.occupancyRate.toFixed(1)}%`,
      ]),
      `Raporti_Rrugeve_${dateFrom}_${dateTo}.pdf`,
    );
  }

  function downloadSelectedAgentsPdf() {
    const selected = sortedAgentMetrics.filter(agent => selectedAgentIds.has(agent.agentId));
    if (!selected.length) {
      alert("Zgjidh të paktën një agjent për PDF.");
      return;
    }
    const headers = ["Agjenti", "Kompania", "Rezervime", "Pasagjere", "Shitje", "Mes. / Rezervim"];
    if (canCommission) headers.push("Komisioni");
    saveReportPdf(
      "Raporti i Shitjeve sipas Agjentit",
      headers,
      selected.map(agent => {
        const row: Array<string | number> = [
          agent.agentName,
          agent.company || "-",
          agent.totalBookings,
          agent.totalPassengers,
          `EUR ${fmtM(agent.totalSales)}`,
          `EUR ${fmtM(agent.totalBookings ? agent.totalSales / agent.totalBookings : 0)}`,
        ];
        if (canCommission) row.push(`EUR ${fmtM(agent.totalCommission)}`);
        return row;
      }),
      `Raporti_Agjenteve_${dateFrom}_${dateTo}.pdf`,
    );
  }
  // salesByAgent është renditur sipas shitjeve totale (desc) — rank = pozicioni i shitjeve
  const salesByAgent = useMemo(() => {
    const sorted = [...agentMetrics].sort((a, b) => b.totalSales - a.totalSales);
    return sorted.map((agent, index) => ({
      agentName: agent.agentName,
      value: agent.totalSales,
      percentage: agentTotals.sales ? Math.round((agent.totalSales / agentTotals.sales) * 1000) / 10 : 0,
      color: AGENT_CHART_COLORS[index % AGENT_CHART_COLORS.length],
      rank: index + 1,
      totalPassengers: agent.totalPassengers,
    }));
  }, [agentMetrics, agentTotals.sales]);
  const commissionByAgent = useMemo(() => {
    const sorted = [...agentMetrics]
      .filter((agent) => agent.totalCommission > 0)
      .sort((a, b) => b.totalCommission - a.totalCommission);
    return sorted.map((agent, index) => ({
      agentName: agent.agentName,
      value: agent.totalCommission,
      percentage: agentTotals.commission > 0 ? Math.round((agent.totalCommission / agentTotals.commission) * 1000) / 10 : 0,
      color: AGENT_CHART_COLORS[index % AGENT_CHART_COLORS.length],
      rank: index + 1,
      totalPassengers: agent.totalPassengers,
    }));
  }, [agentMetrics, agentTotals.commission]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">Performance metrics and financial reporting.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canExport && (
          <div className="flex flex-col items-start gap-0.5">
            <Button
              onClick={downloadLiveExcel}
              disabled={liveXlsLoading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4"
            >
              {liveXlsLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Duke shkarkuar...</>
                : <><FileSpreadsheet className="h-4 w-4" /> Shkarko Excel të Gjallë</>}
            </Button>
            {liveInfo?.updatedAt && (
              <span className="text-[10px] text-muted-foreground pl-1">
                Përditësuar: {fmtDateTimeAmPm(liveInfo.updatedAt)} · {liveInfo.sizeKb} KB
              </span>
            )}
          </div>
          )}
          {canExport && (
          <Button
            onClick={downloadExcel}
            disabled={xlsLoading}
            variant="outline"
            className="gap-2"
          >
            {xlsLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Duke gjeneruar...</>
              : <><FileSpreadsheet className="h-4 w-4" /> Eksporto Tani</>}
          </Button>
          )}
          {canExport && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => downloadExport("sales")} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Shitjet CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadExport("payments")} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Pagesat CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadExport("agents")} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Agjentet CSV
            </Button>
          </div>
          )}
          <div className="flex items-center gap-2">
            <DatePicker value={dateFrom} onChange={v => { setDateFrom(v); if (dateTo && v > dateTo) setDateTo(v); }} className="w-36" />
            <span className="text-muted-foreground text-sm">deri</span>
            <DatePicker value={dateTo} min={dateFrom || undefined} onChange={v => setDateTo(v)} className="w-36" />
          </div>
        </div>
      </div>

      {tabs.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          Nuk keni leje për të parë asnjë seksion të raporteve.
        </CardContent></Card>
      ) : (
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          {tabs.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        {canSales && (
        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Shitjet Totale</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">€{fmtM(salesData?.totalSales || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Shuma e arkëtuar nga klientët</p>
              </CardContent>
            </Card>
            {canProfit && (
            <Card className="border-green-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Komisioni (Fitimi)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">€{fmtM((salesData as { totalCommission?: number } | undefined)?.totalCommission || salesData?.totalProfit || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Shitje − Çmim Neto</p>
              </CardContent>
            </Card>
            )}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rezervimet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesData?.totalBookings || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Rezervime aktive</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pasagjerët</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesData?.totalPassengers || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Pasagjerë total</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Të Ardhurat Ditore</CardTitle>
              {canProfit && (
                <button
                  onClick={() => setShowPct(v => !v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                    showPct
                      ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                      : "bg-white text-green-700 border-green-300 hover:bg-green-50"
                  }`}
                >
                  {showPct ? "Fshih %" : "Shfaq %"}
                </button>
              )}
            </CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesData?.byDay || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "dd MMM")} />
                  <YAxis tickFormatter={(v) => `€${v}`} />
                  <Tooltip
                    labelFormatter={(v) => format(new Date(v), "dd MMM yyyy")}
                    formatter={(v: any, name: string) => [`€${fmtM(v)}`, name]}
                  />
                  <Legend />
                  <Bar dataKey="sales" name="Shitje" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  {canProfit && (
                    <Bar dataKey="profit" name="Komisioni" fill="#16a34a" radius={[4, 4, 0, 0]}>
                      {showPct && (
                        <LabelList
                          dataKey="profit"
                          position="top"
                          content={(props: any) => {
                            const { x, y, width, value, index } = props;
                            const entry = (salesData?.byDay || [])[index];
                            if (!entry || !entry.sales || entry.sales === 0 || !value) return null;
                            const pct = Math.round((value / entry.sales) * 100);
                            return (
                              <text
                                x={Number(x) + Number(width) / 2}
                                y={Number(y) - 4}
                                fill="#15803d"
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight="bold"
                              >
                                {pct}%
                              </text>
                            );
                          }}
                        />
                      )}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {canRoutes && (
        <TabsContent value="routes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle>Performanca e Rrugëve</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Kliko titujt e kolonave për renditje dhe zgjidh rreshtat që dëshiron në PDF.</p>
              </div>
              {canExport && (
                <Button
                  variant="outline"
                  className="shrink-0 gap-2"
                  onClick={downloadSelectedRoutesPdf}
                  disabled={selectedRouteKeys.size === 0}
                >
                  <FileText className="h-4 w-4 text-red-600" />
                  Shkarko PDF ({selectedRouteKeys.size})
                </Button>
              )}
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={routeMetrics.length > 0 && routeMetrics.every(route => selectedRouteKeys.has(route.route))}
                      onCheckedChange={checked => setSelectedRouteKeys(checked === true ? new Set(routeMetrics.map(route => route.route)) : new Set())}
                      aria-label="Zgjidh të gjitha rrugët"
                    />
                  </TableHead>
                  {([
                    ["route", "Route"],
                    ["totalFlights", "Flights"],
                    ["totalBookings", "Bookings"],
                    ["totalRevenue", "Revenue"],
                    ["occupancyRate", "Occupancy"],
                  ] as Array<[keyof RouteMetric, string]>).map(([col, label]) => {
                    const active = routeSortCol === col;
                    const Icon = active ? (routeSortDir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;
                    return (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleRouteSort(col)}>
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRouteMetrics.map((r) => (
                  <TableRow key={r.route}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRouteKeys.has(r.route)}
                        onCheckedChange={checked => toggleSelection(setSelectedRouteKeys, r.route, checked === true)}
                        aria-label={`Zgjidh rrugën ${r.route}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.route}</TableCell>
                    <TableCell>{r.totalFlights}</TableCell>
                    <TableCell>{r.totalBookings}</TableCell>
                    <TableCell>€{fmtM(r.totalRevenue)}</TableCell>
                    <TableCell>{r.occupancyRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {!sortedRouteMetrics.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No data available for this period.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        )}

        {canAirlines && (
        <TabsContent value="airlines">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Airline</TableHead>
                  <TableHead>Flights</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Occupancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {airlinesData?.map((a: any) => (
                  <TableRow key={a.airline}>
                    <TableCell className="font-medium">{a.airline}</TableCell>
                    <TableCell>{a.totalFlights}</TableCell>
                    <TableCell>{a.totalBookings}</TableCell>
                    <TableCell>${a.totalRevenue}</TableCell>
                    <TableCell>{a.occupancyRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {!airlinesData?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data available for this period.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        )}

        {canAgents && (
        <TabsContent value="agents" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Shitjet e Agjentëve</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">€{fmtM(agentTotals.sales)}</div><p className="mt-1 text-xs text-muted-foreground">Rezervimet e anulluara nuk përfshihen</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Rezervime Aktive</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{agentTotals.bookings}</div><p className="mt-1 text-xs text-muted-foreground">Nga të gjithë agjentët</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pasagjerë</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{agentTotals.passengers}</div><p className="mt-1 text-xs text-muted-foreground">Vetëm rezervime aktive</p></CardContent>
            </Card>
            {canCommission && (
              <Card className="border-emerald-500/30">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Komisioni i Agjentëve</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-emerald-600">€{fmtM(agentTotals.commission)}</div><p className="mt-1 text-xs text-muted-foreground">Shitje − çmim neto</p></CardContent>
              </Card>
            )}
          </div>

          <div className={`grid gap-4 ${canCommission ? "xl:grid-cols-2" : ""}`}>
            <AgentDonut
              title="Pesha e Shitjeve sipas Agjentit"
              subtitle="Emri, vlera e shitjeve dhe përqindja e secilit agjent"
              data={salesByAgent}
              centerLabel="Shitje totale"
              centerValue={`€${fmtM(agentTotals.sales)}`}
              valueFormatter={(value) => `€${fmtM(value)}`}
            />
            {canCommission && (
              <AgentDonut
                title="Pesha e Komisionit sipas Agjentit"
                subtitle="Komisioni i gjeneruar nga rezervimet aktive"
                data={commissionByAgent}
                centerLabel="Komisioni"
                centerValue={`€${fmtM(agentTotals.commission)}`}
                valueFormatter={(value) => `€${fmtM(value)}`}
              />
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Të Ardhurat Ditore nga Agjentët</CardTitle>
              <p className="text-xs text-muted-foreground">Shitje dhe komision sipas ditës, si në grafikun krahasues.</p>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentsData?.byDay || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "dd MMM")} />
                  <YAxis tickFormatter={(v) => `€${v}`} />
                  <Tooltip labelFormatter={(v) => format(new Date(v), "dd MMM yyyy")} formatter={(v: any, name: string) => [`€${fmtM(v)}`, name]} />
                  <Legend />
                  <Bar dataKey="sales" name="Shitje" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  {canCommission && <Bar dataKey="profit" name="Komisioni" fill="#16a34a" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <div>
                <CardTitle>Detajet sipas Agjentit</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Të gjithë totalet përdorin vetëm rezervime jo të anulluara në periudhën e zgjedhur.</p>
              </div>
              {canExport && (
                <Button
                  variant="outline"
                  className="shrink-0 gap-2"
                  onClick={downloadSelectedAgentsPdf}
                  disabled={selectedAgentIds.size === 0}
                >
                  <FileText className="h-4 w-4 text-red-600" />
                  Shkarko PDF ({selectedAgentIds.size})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={agentMetrics.length > 0 && agentMetrics.every(agent => selectedAgentIds.has(agent.agentId))}
                      onCheckedChange={checked => setSelectedAgentIds(checked === true ? new Set(agentMetrics.map(agent => agent.agentId)) : new Set())}
                      aria-label="Zgjidh të gjithë agjentët"
                    />
                  </TableHead>
                  {(["agentName", "company", "shitjePct", "totalBookings", "totalPassengers", "totalSales", "mesatare"] as const).map((col, i) => {
                    const labels: Record<string, string> = {
                      agentName: "Agent", company: "Company", shitjePct: "Shitje %",
                      totalBookings: "Bookings", totalPassengers: "Pasagjerë",
                      totalSales: "Shitje Totale", mesatare: "Mes. / Rezervim",
                    };
                    const active = agentSortCol === col;
                    const Icon = active ? (agentSortDir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;
                    return (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleAgentSort(col)}>
                        <span className="inline-flex items-center gap-1">
                          {labels[col]}
                          <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                  {canCommission && (["totalCommission", "komisionPct"] as const).map((col) => {
                    const labels: Record<string, string> = { totalCommission: "Komisioni", komisionPct: "Komision %" };
                    const active = agentSortCol === col;
                    const Icon = active ? (agentSortDir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;
                    return (
                      <TableHead key={col} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleAgentSort(col)}>
                        <span className="inline-flex items-center gap-1">
                          {labels[col]}
                          <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgentMetrics.map((a) => (
                  <TableRow key={a.agentId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAgentIds.has(a.agentId)}
                        onCheckedChange={checked => toggleSelection(setSelectedAgentIds, a.agentId, checked === true)}
                        aria-label={`Zgjidh agjentin ${a.agentName}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <AgentRankBadge agentName={a.agentName} />
                        {a.agentName}
                      </div>
                    </TableCell>
                    <TableCell>{a.company || "-"}</TableCell>
                    <TableCell>{agentTotals.sales ? `${((a.totalSales / agentTotals.sales) * 100).toFixed(1)}%` : "0%"}</TableCell>
                    <TableCell>{a.totalBookings}</TableCell>
                    <TableCell>{a.totalPassengers}</TableCell>
                    <TableCell className="font-semibold">€{fmtM(a.totalSales)}</TableCell>
                    <TableCell>€{fmtM(a.totalBookings ? a.totalSales / a.totalBookings : 0)}</TableCell>
                    {canCommission && <><TableCell className="font-medium text-emerald-600">€{fmtM(a.totalCommission)}</TableCell><TableCell>{agentTotals.commission > 0 ? `${((a.totalCommission / agentTotals.commission) * 100).toFixed(1)}%` : "—"}</TableCell></>}
                  </TableRow>
                ))}
                {!sortedAgentMetrics.length && (
                  <TableRow><TableCell colSpan={canCommission ? 10 : 8} className="text-center py-8 text-muted-foreground">Nuk ka të dhëna për këtë periudhë.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {canRoutes && (
        <TabsContent value="detailed_flights" className="m-0">
          <DetailedFlightsTab
            dateFrom={dateFrom}
            dateTo={dateTo}
            canProfit={canProfit}
            canCommission={canCommission}
            canExport={canExport}
          />
        </TabsContent>
        )}

      </Tabs>
      )}
    </div>
  );
}
