import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PageLimit = 10 | 20 | 50 | 100 | "all";

export function PaginationControls({
  page,
  total,
  limit,
  onChange,
  onLimitChange,
}: {
  page: number;
  total: number;
  limit: PageLimit;
  onChange: (page: number) => void;
  onLimitChange: (limit: PageLimit) => void;
}) {
  const totalPages = limit === "all" ? 1 : Math.ceil(total / limit);
  const start = total === 0 ? 0 : limit === "all" ? 1 : (page - 1) * limit + 1;
  const end = limit === "all" ? total : Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:px-6">
      <p className="text-xs text-gray-600 whitespace-nowrap">
        Duke shfaqur {start}–{end} nga {total} rezultate
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Rreshta:</span>
        <Select value={String(limit)} onValueChange={value => onLimitChange(value === "all" ? "all" : Number(value) as PageLimit)}>
          <SelectTrigger aria-label="Numri i rreshtave në listë" className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
            <SelectItem value="all">Të gjitha</SelectItem>
          </SelectContent>
        </Select>
        {totalPages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Faqet e listës">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Faqja e mëparshme">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-xs text-gray-600 whitespace-nowrap">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Faqja tjetër">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}