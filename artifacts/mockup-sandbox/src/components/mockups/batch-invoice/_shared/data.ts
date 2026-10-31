export interface InvRow {
  ref: string;
  client: string;
  route: string;
  flight: string;
  departure: string;
  total: number;
  prevPaid: number;   // pagesa e mëparshme (mund të jetë 0)
  thisPaid: number;   // pagesa me këtë faturë
}

export const META = {
  brand: "Albania Sky",
  sub: "Flight Management System",
  invoiceNo: "INV-260618-000138",
  date: "18 June 2026 5:44 PM",
  method: "PAYSERA",
  ref: "448/2026",
};

export const ROWS: InvRow[] = [
  { ref: "FLTS63F95", client: "Soni Zenelaj",   route: "TIA → BLQ", flight: "WIZZ AIR W45047", departure: "19.08.2026", total: 240, prevPaid: 100, thisPaid: 140 },
  { ref: "FLTYH3BJY", client: "Bledar Haxhija", route: "TIA → NUE", flight: "WIZZ AIR W45115", departure: "29.08.2026", total: 490, prevPaid:   0, thisPaid: 490 },
  { ref: "FLTG6NAZW", client: "Xhulio Hila",    route: "BLQ → TIA", flight: "WIZZ AIR W45050", departure: "07.08.2026", total: 220, prevPaid:  50, thisPaid: 170 },
  { ref: "FLTK7YGHA", client: "Ilir Dushaj",    route: "TIA → DTM", flight: "WIZZ AIR W45125", departure: "15.08.2026", total: 370, prevPaid:   0, thisPaid: 370 },
  { ref: "KFTTH2N7P", client: "Haxhi Cekaj",    route: "LYS → TIA", flight: "WIZZ AIR W45144", departure: "06.08.2026", total: 160, prevPaid:   0, thisPaid: 160 },
  { ref: "KFT2LXDDM", client: "Haxhi Cekaj",    route: "TIA → LYS", flight: "WIZZ AIR W45143", departure: "24.08.2026", total: 160, prevPaid:  80, thisPaid:  80 },
  { ref: "KFTTNR7XG", client: "Rovena Hila",    route: "BLQ → TIA", flight: "WIZZ AIR W45048", departure: "05.08.2026", total: 225, prevPaid:   0, thisPaid: 225 },
  { ref: "KTF1559",   client: "Flutura Harifi", route: "TIA → CGN", flight: "WIZZ AIR W45121", departure: "13.08.2026", total: 420, prevPaid: 200, thisPaid: 220 },
  { ref: "KTF6882",   client: "Artjan Gjonaj",  route: "TIA → CGN", flight: "WIZZ AIR W45121", departure: "22.08.2026", total: 540, prevPaid:   0, thisPaid: 540 },
];

// Totali i çdo rezervimi (prevPaid + thisPaid = total)
export const TOTAL_BOOKING = ROWS.reduce((s, r) => s + r.total, 0);
export const TOTAL_PREV    = ROWS.reduce((s, r) => s + r.prevPaid, 0);
export const TOTAL_THIS    = ROWS.reduce((s, r) => s + r.thisPaid, 0);

// Simulojmë overpayment: agjensia dërgoi 100€ më shumë se detyrimet
export const PAYMENT_AMOUNT = TOTAL_THIS + 100;
export const CREDIT         = PAYMENT_AMOUNT - TOTAL_THIS; // > 0 → kreditim

export const eur = (n: number) => `${n.toFixed(2)} €`;
