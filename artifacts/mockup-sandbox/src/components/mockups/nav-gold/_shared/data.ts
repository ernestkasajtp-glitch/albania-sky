// Entirely illustrative fixtures: no production records, auth values or PII.
// Shape matches the fields consumed by bookings-premium.tsx's render.
export const TODAY = "2026-05-19";
export const agents = [
  { id: 1, name: "Demo Agency A" }, { id: 2, name: "Demo Agency B" },
  { id: 3, name: "Demo Agency C" },
];
export const bookings = [
  ["DEMO001", "DEMOA1", 1, "FCO", "2026-06-18", "07:35", 3, 840, 500, 60, "pending"],
  ["DEMO002", "DEMOB2", 2, "MXP", "2026-06-21", "11:10", 2, 620, 620, 65, "ticketed"],
  ["DEMO003", "", 3, "IST", "2026-06-30", "15:45", 4, 1280, 0, 90, "draft"],
  ["DEMO004", "DEMOD4", 1, "BCN", "2026-07-05", "08:20", 2, 740, 740, 72, "confirmed"],
  ["DEMO005", "DEMOE5", 2, "MUC", "2026-07-12", "06:50", 1, 310, 150, -18, "confirmed"],
  ["DEMO006", "DEMOF6", 3, "SAW", "2026-06-09", "19:05", 5, 980, 0, 70, "cancelled"],
  ["DEMO007", "DEMOG7", 1, "ZRH", "2026-07-20", "09:40", 3, 1110, 1110, 86, "ticketed"],
  ["DEMO008", "DEMOH8", 2, "VIE", "2026-06-24", "12:15", 2, 560, 300, 42, "pending"],
].map((r, i) => ({
  id: i + 1, bookingRef: String(r[0]), pnr: String(r[1]), agentId: Number(r[2]),
  agentName: agents.find(a => a.id === Number(r[2]))!.name,
  customerName: `Pasagjer Demo ${String(i + 1).padStart(2, "0")}`,
  createdAt: `${TODAY}T10:00:00`, status: String(r[10]),
  flight: { fromCity: "TIA", toCity: String(r[3]), departureDate: String(r[4]), departureTime: String(r[5]), isConfirmed: false },
  passengers: Array.from({ length: Number(r[6]) }, () => ({ type: "adult", cancelled: false, baggageOption: "", hasPriorityBoarding: false })),
  totalAmount: Number(r[7]), paidAmount: Number(r[8]), dueAmount: Number(r[7]) - Number(r[8]),
  commissionAmount: Number(r[9]), netPrice: Number(r[7]) - Number(r[9]), creditAmount: 0,
}));
export type Booking = typeof bookings[number];

// lib/bookingColumns.ts: source labels/order and financial widths.
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
export type SortKey = typeof BOOKING_COLUMNS[number]["k"];
export const BOOKING_FINANCIAL_WIDTHS: Partial<Record<SortKey, number>> = {
  financa: 80, neto: 64, commission: 92, paid: 80, due: 84, credit: 76,
};
