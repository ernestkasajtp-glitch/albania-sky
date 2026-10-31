export const demoBooking = {
  id: 3, bookingRef: "KTF7455", status: "confirmed",
  customerName: "Dritan Leka", customerEmail: "agjencia@example.test",
  createdAt: "2026-10-09T10:30:00", pnr: "JKLM56",
  totalAmount: 540, paidAmount: 340, dueAmount: 200, notes: "",
  flight: {
    airline: "Wizz Air", flightNumber: "W45027", fromCity: "TIA", toCity: "MXP",
    departureDate: "2026-10-15", arrivalDate: "2026-10-15",
    departureTime: "11:30", arrivalTime: "13:45", isConfirmed: false,
    adultPrice: 250, childPrice: 250, infantPrice: 40, checkedBaggageKg: 20,
  },
  passengers: [
    { id: 1, firstName: "Dritan", lastName: "Leka", type: "adult", pnr: "JKLM56", ticketPrice: 250, extraCost: 20, baggageOption: "checked", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, cancelled: false },
    { id: 2, firstName: "Mira", lastName: "Leka", type: "adult", pnr: "JKLM56", ticketPrice: 250, extraCost: 20, baggageOption: "checked", hasSeatSelection: false, hasPriorityBoarding: false, hasInsurance: false, cancelled: false },
  ],
  payments: [
    { id: 1, amount: 340, method: "CASH", isRefund: false, createdAt: "2026-10-09T10:30:00", reference: "", notes: "" },
  ],
};
const user = { role: "agent", name: "AB TRAVEL", agentId: 1 };
export const useAuth = () => ({ user, loading: false });
export const useRoute = (_path: string): [boolean, { ref: string }] => [true, { ref: "KTF7455" }];
export const useLocation = (): [string, (path: string) => void] => ["/my-bookings/KTF7455", () => {}];
export const useTranslation = () => ({
  t: (s: string, values?: Record<string, unknown>) => s.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values?.[key] ?? "")),
  i18n: { language: "sq" },
});
export const fmtAmPm = (value: string) => value;
export const fmtM = (value: number) => Math.round(value).toLocaleString("de-DE");
export const api = {
  getBookingDetail: async (_ref: string) => demoBooking,
  initPokPayment: async (_ref: string): Promise<{ confirmUrl?: string }> => { throw new Error("Propozim vizual — pagesa nuk kryhet."); },
  downloadBookingPdf: async (_ref: string): Promise<Blob> => { throw new Error("Propozim vizual — dokumenti nuk shkarkohet."); },
};
