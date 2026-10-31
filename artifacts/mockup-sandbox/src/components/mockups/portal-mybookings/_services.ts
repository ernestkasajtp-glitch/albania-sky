export const demoBookings = [
  ["KTF2200", "Arben Dema", "TIA", "BLQ", "2026-10-14", "ticketed", 200, 0],
  ["KTF5889", "Elira Hoxha", "TIA", "MXP", "2026-10-15", "ticketed", 170, 170],
  ["KTF7455", "Dritan Leka", "TIA", "MXP", "2026-10-15", "confirmed", 540, 340],
  ["KTF2735", "Mira Kola", "TIA", "MXP", "2026-10-17", "draft", 170, 0],
  ["KTF5203", "Erion Gega", "TIA", "BGY", "2026-10-18", "cancelled", 150, 0],
  ["KTF7855", "Sara Nika", "TIA", "BGY", "2026-10-19", "ticketed", 240, 240],
  ["KTF9276", "Luan Doda", "TIA", "DTM", "2026-10-20", "ticketed", 180, 180],
  ["KTF3091", "Ina Basha", "PRN", "LTN", "2026-10-22", "confirmed", 320, 120],
].map((r, i) => ({
  id: i + 1, bookingRef: r[0] as string, customerName: r[1] as string,
  fromCity: r[2] as string, toCity: r[3] as string, departureDate: r[4] as string,
  status: r[5] as string, totalAmount: Number(r[6]), paidAmount: Number(r[7]),
  dueAmount: r[5] === "cancelled" ? 0 : Number(r[6]) - Number(r[7]),
  customerEmail: "agjencia@example.test", createdAt: "2026-10-09T10:30:00",
  airline: "Wizz Air", flightNumber: ["W45049", "W45027", "W45027", "W45027", "W45047", "W45047", "W45125", "W95003"][i],
  pnr: ["ABCD12", "EFGH34", "JKLM56", "", "", "NPQR78", "STUV90", "WXYZ12"][i],
  departureTime: "11:30", arrivalTime: "13:45", notes: "",
  payments: Number(r[7]) ? [{ id: i, amount: Number(r[7]), method: "CASH", status: "completed", createdAt: "2026-10-09T10:30:00" }] : [],
}));
export const demoTransactions = demoBookings.filter(b => b.paidAmount > 0).map(b => ({
  id: b.id, type: "payment", sign: 1, amount: b.paidAmount, bookingRef: b.bookingRef,
  customerName: b.customerName, route: `${b.fromCity} → ${b.toCity}`,
  description: "Pagesë rezervimi", method: "CASH", createdAt: b.createdAt, reference: b.bookingRef,
}));
export const useAuth = () => ({ user: { role: "agent", agentId: 1, agencyName: "AB TRAVEL", name: "AB TRAVEL" }, loading: false });
export const useTranslation = () => ({ t: (s: string, values?: Record<string, unknown>) => s.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values?.[key] ?? "")) });
export const useLocation = (): [string, (s: string) => void] => ["/my-bookings", () => {}];
export const api = {
  myBookings: async () => demoBookings,
  myTransactions: async () => demoTransactions,
  downloadBookingPdf: async (_reference: string): Promise<Blob> => { throw new Error("Vetëm demonstrim — PDF dhe email nuk dërgohen."); },
};
