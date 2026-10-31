export const BOOKING_COLUMNS = [
  { k: "date", label: "Data Rez.", align: "text-left" },
  { k: "ref", label: "REF", align: "text-left" },
  { k: "pnr", label: "PNR", align: "text-left" },
  { k: "klienti", label: "Klienti", align: "text-left" },
  { k: "agjencia", label: "Agjencia", align: "text-left" },
  { k: "fluturimi", label: "Fluturimi", align: "text-left" },
  { k: "flightDate", label: "Data", align: "text-left" },
  { k: "flightTime", label: "Ora", align: "text-left" },
  { k: "pax", label: "PAX", align: "text-left" },
  { k: "financa", label: "Totali", align: "text-right" },
  { k: "neto", label: "Neto", align: "text-right" },
  { k: "commission", label: "Komisioni", align: "text-right" },
  { k: "paid", label: "Paguar", align: "text-right" },
  { k: "due", label: "Detyrimi", align: "text-right" },
  { k: "credit", label: "Kredit", align: "text-right" },
  { k: "statusi", label: "Statusi", align: "text-left" },
] as const;

export type BookingColumnId = typeof BOOKING_COLUMNS[number]["k"];
// Inter font metrics: four digits plus currency/sign, cell/badge padding,
// and the larger of the amount or header + sort icon. These are not minima
// for distributing spare table width.
export const BOOKING_FINANCIAL_WIDTHS: Partial<Record<BookingColumnId, number>> = {
  financa: 80,
  neto: 64,
  commission: 92,
  paid: 80,
  due: 84,
  credit: 76,
};
export const DEFAULT_BOOKING_COLUMNS: BookingColumnId[] = BOOKING_COLUMNS.map(column => column.k);

export function visibleBookingColumns(selected: readonly string[] | null, canCommission: boolean) {
  const columns = BOOKING_COLUMNS.filter(column =>
    (column.k !== "commission" || canCommission) &&
    (selected === null || selected.includes(column.k)),
  );
  // A permission can be revoked after a default was saved. Always keep one
  // safe column and never let a saved preference grant field access.
  return columns.length ? columns : BOOKING_COLUMNS.filter(column => column.k === "ref");
}