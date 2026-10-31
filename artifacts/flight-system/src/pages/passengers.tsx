import { useState, useEffect } from "react";
import { useListPassengers } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, X, Filter } from "lucide-react";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { canCloseBookingDetail } from "@/lib/bookingDetailDirty";

const TYPE_LABELS: Record<string, string> = {
  adult: "Madhur",
  child: "Fëmijë",
  infant: "Foshnjë",
};

const TYPE_COLORS: Record<string, string> = {
  adult: "bg-blue-100 text-blue-800",
  child: "bg-purple-100 text-purple-800",
  infant: "bg-pink-100 text-pink-800",
};

const PAGE_SIZE = 100;

export default function PassengersList() {
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [debNat, setDebNat] = useState("");
  const [page, setPage] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  // Kërkimi bëhet NË SERVER me vonesë 400ms — nuk ngarkohen kurrë të gjithë pasagjerët.
  useEffect(() => { const t = setTimeout(() => setDebSearch(search.trim()), 400); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const t = setTimeout(() => setDebNat(nationalityFilter.trim()), 400); return () => clearTimeout(t); }, [nationalityFilter]);
  useEffect(() => { setPage(0); }, [debSearch, debNat, typeFilter]);

  const { data: pageRows = [], isLoading } = useListPassengers({
    ...(debSearch ? { search: debSearch } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(debNat ? { nationality: debNat } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  } as any, { query: { placeholderData: (prev: any) => prev } } as any);

  const passengers = pageRows as any[];
  const hasNext = passengers.length === PAGE_SIZE;

  const hasActiveFilters = search || typeFilter || nationalityFilter;

  const clearFilters = () => {
    setSearch(""); setTypeFilter(""); setNationalityFilter(""); setPage(0);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pasagjerët</h1>
        <p className="text-muted-foreground text-sm">Kërko dhe administro pasagjerët në të gjitha rezervimet.</p>
      </div>

      {/* Filter bar */}
      <div className="page-filter-panel bg-card border rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Main search */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[220px] flex-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Emri, Pasaportë, Ref. Rezervimi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
            {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>

          {/* Nationality */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background min-w-[140px]">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              placeholder="Kombësia..."
              value={nationalityFilter}
              onChange={e => setNationalityFilter(e.target.value)}
              className="bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            />
            {nationalityFilter && <button onClick={() => setNationalityFilter("")}><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>}
          </div>

          {/* Type */}
          <div className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-background text-sm">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-transparent outline-none text-sm text-muted-foreground"
            >
              <option value="">Të gjitha tipet</option>
              <option value="adult">Madhur</option>
              <option value="child">Fëmijë</option>
              <option value="infant">Foshnjë</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground ml-auto">
              <X className="h-3.5 w-3.5" /> Pastro filtrat
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground px-1">
          {isLoading ? "Duke ngarkuar..." : `${passengers.length} pasagjerë në këtë faqe (faqja ${page + 1})`}
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emri</TableHead>
              <TableHead>Tipi</TableHead>
              <TableHead>Kombësia</TableHead>
              <TableHead>Pasaportë / ID</TableHead>
              <TableHead>Data Skadimit</TableHead>
              <TableHead>Ulësja</TableHead>
              <TableHead>Rezervimi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Duke ngarkuar...</TableCell></TableRow>
            ) : passengers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  {hasActiveFilters ? "Nuk ka pasagjerë me këto kritere." : "Nuk ka pasagjerë."}
                </TableCell>
              </TableRow>
            ) : (
              passengers.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[p.type] || "bg-gray-100 text-gray-700"}`}>
                      {TYPE_LABELS[p.type] || p.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{p.nationality || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{p.passportNumber || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.passportExpiry ? new Date(p.passportExpiry).toLocaleDateString("sq-AL") : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.seatNumber || "—"}</TableCell>
                  <TableCell>
                    {p.bookingId ? (
                      <button
                        onClick={() => setSelectedBookingId(p.bookingId)}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {p.bookingRef || `#${p.bookingId}`}
                      </button>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Faqosje — ngarkohen vetëm 100 pasagjerë njëherësh */}
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Mbrapa
        </button>
        <span className="text-xs text-muted-foreground">Faqja {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={!hasNext}
          className="px-3 py-1.5 rounded-lg border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Përpara →
        </button>
      </div>

      <Dialog open={!!selectedBookingId} onOpenChange={open => { if (!open) { if (!canCloseBookingDetail()) return; setSelectedBookingId(null); } }}>
        <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base text-muted-foreground font-normal">Detajet e Rezervimit</DialogTitle></DialogHeader>
          {selectedBookingId && <BookingDetailContent bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
