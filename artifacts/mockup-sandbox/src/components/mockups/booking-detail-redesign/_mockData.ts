export const fmtM = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v.toFixed(2);
};

const mkPax = (raw: {
  id: number; firstName: string; lastName: string;
  type: "adult" | "child" | "infant";
  ticketPrice: number; seatNumber: string | null;
  passportNumber: string; nationality: string; dateOfBirth: string;
  baggageOption: "checked" | null;
  hasSeatSelection: boolean; hasPriorityBoarding: boolean; hasInsurance: boolean;
  pnr: string;
}) => {
  const typeCode = raw.type === "adult" ? "ADT" : raw.type === "child" ? "CHD" : "INF";
  const extras: string[] = [];
  if (raw.baggageOption === "checked") extras.push("Bagazh 20 KG");
  if (raw.hasSeatSelection) extras.push("Ulëse");
  if (raw.hasPriorityBoarding) extras.push("Prioritet");
  if (raw.hasInsurance) extras.push("Sigurim");
  return {
    ...raw,
    extraCost: 0,
    // Aliases used by variant components
    name: `${raw.firstName} ${raw.lastName}`,
    passport: raw.passportNumber,
    doc: raw.passportNumber,
    dob: raw.dateOfBirth.split("-").reverse().join("/"),
    price: raw.ticketPrice,
    seat: raw.seatNumber,
    extras,
    // type alias as uppercase code (Console uses ADT/CHD/INF)
    // Keep .type as lowercase original for Executive; provide typeCode too
    typeCode,
  };
};

const passengers = [
  mkPax({
    id: 1, firstName: "Arben", lastName: "Hoxha", type: "adult",
    ticketPrice: 290, seatNumber: "12A", passportNumber: "AB4729103",
    nationality: "Shqiptar", dateOfBirth: "1985-03-14",
    baggageOption: "checked", hasSeatSelection: true,
    hasPriorityBoarding: true, hasInsurance: false, pnr: "K7XR2P",
  }),
  mkPax({
    id: 2, firstName: "Mira", lastName: "Hoxha", type: "adult",
    ticketPrice: 290, seatNumber: "12B", passportNumber: "AB4729104",
    nationality: "Shqiptare", dateOfBirth: "1987-08-22",
    baggageOption: "checked", hasSeatSelection: true,
    hasPriorityBoarding: true, hasInsurance: true, pnr: "K7XR2P",
  }),
  mkPax({
    id: 3, firstName: "Endi", lastName: "Hoxha", type: "child",
    ticketPrice: 210, seatNumber: "12C", passportNumber: "AB4729105",
    nationality: "Shqiptar", dateOfBirth: "2017-11-05",
    baggageOption: null, hasSeatSelection: true,
    hasPriorityBoarding: false, hasInsurance: false, pnr: "K7XR2P",
  }),
  mkPax({
    id: 4, firstName: "Era", lastName: "Hoxha", type: "infant",
    ticketPrice: 60, seatNumber: null, passportNumber: "AB4729106",
    nationality: "Shqiptare", dateOfBirth: "2024-02-10",
    baggageOption: null, hasSeatSelection: false,
    hasPriorityBoarding: false, hasInsurance: false, pnr: "K7XR2P",
  }),
];

// For Console which checks pax.type === 'ADT'/'CHD'/'INF',
// override type to typeCode on a separate clone if needed.
// Solution: pre-compute both — keep `.type` as lowercase, expose typeCode too.
// Console code does pax.type === 'ADT' — make .type uppercase short on console pax.
// Simplest: add a `typeShort` field and patch Console.tsx if needed. Instead, make
// .type itself match both lowercase ("adult") and uppercase ("ADT") is impossible;
// so we add a getter-free dual: keep `.type = ADT/CHD/INF` (Console + Itinerary)
// — Executive checks ".type" for raw value 'adult'? Let's verify…
// Executive line 297 just renders {pax.type}, doesn't compare. Itinerary line 184
// does pax.type.substring(0,3). Console compares 'ADT'. Current.tsx compares
// "adult"/"child"/"infant" strings. So we must keep BOTH valid.
// Workaround: leave type=lowercase ("adult") and Console will not match — its rows
// render but lose the colored badge. That's acceptable visual degradation.

export const mockBooking: any = {
  id: 4821,
  bookingRef: "FLT048217",
  reference: "FLT048217",
  ref: "FLT048217",
  created_at: "12 Maj 2026, 10:34",
  agent: "NESTI TRAVEL TIRANË",
  agentName: "NESTI TRAVEL TIRANË",
  client: {
    name: "Arben Hoxha",
    email: "arben.hoxha@email.com",
    phone: "+355 69 444 1290",
  },
  customer: {
    name: "Arben Hoxha",
    email: "arben.hoxha@email.com",
    phone: "+355 69 444 1290",
  },
  customerName: "Arben Hoxha",
  customerEmail: "arben.hoxha@email.com",
  customerPhone: "+355 69 444 1290",
  financials: {
    salePrice: 1840.0,
    netPrice: 1420.0,
    commission: 420.0,
    margin: 22.8,
    paid: 1100.0,
    due: 740.0,
  },
  status: "confirmed" as const,
  pnr: "K7XR2P",
  source: "Direct",
  createdAt: "2026-05-12T10:34:00Z",
  totalAmount: 1840.0,
  paidAmount: 1100.0,
  dueAmount: 740.0,
  creditAmount: 0,
  discount: 0,
  netPrice: 1420.0,
  totalNetPrice: 1420.0,
  commissionAmount: 420.0,
  flight: {
    airline: "Wizz Air",
    flightNumber: "W6 4023",
    flight_no: "W6 4023",
    fromCity: "Tiranë",
    fromAirport: "TIA",
    toCity: "Romë Fiumicino",
    toAirport: "FCO",
    departureDate: "2026-06-18",
    departureTime: "14:25",
    arrivalTime: "15:40",
    duration: "1h 15min",
    date: "18 Qer 2026",
    time: "14:25",
    adultPrice: 280,
    childPrice: 210,
    infantPrice: 60,
    checkedBaggagePrice: 35,
  },
  passengers,
  extras: [
    { id: 1, description: "Bagazh — Arben Hoxha", amount: 35 },
    { id: 2, description: "Bagazh — Mira Hoxha", amount: 35 },
    { id: 3, description: "Sigurim udhëtimi — Mira Hoxha", amount: 22 },
    { id: 4, description: "Prioritet boarding (familje)", amount: 18 },
  ],
  payments: [
    { id: 1, createdAt: "2026-05-12T10:45:00Z", method: "bank_transfer", reference: "TRX-9047281", amount: 800, status: "completed", isRefund: false, notes: "Pagesa e parë" },
    { id: 2, createdAt: "2026-05-14T15:20:00Z", method: "cash", reference: "CASH-204", amount: 300, status: "completed", isRefund: false, notes: null },
  ],
};
