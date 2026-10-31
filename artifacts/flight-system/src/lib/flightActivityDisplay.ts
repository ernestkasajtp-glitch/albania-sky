/** Presentation only: never change stored audit evidence or provider identifiers. */
export const offlineText = (value: string) => value.replace(/citizen[\s_-]*plane|citizen/gi, "Offline");
export const ACTIVITY_FIELDS: Record<string, string> = {
  seat_checked_at: "Koha e kontrollit të vendeve", schedule_checked_at: "Koha e kontrollit të orarit",
  schedule_miss_count: "Kontrolle radhazi pa gjetur fluturimin", seat_miss_count: "Kontrolle radhazi pa vende",
  schedule_alert: "Sinjalizimi i orarit", schedule_alert_detail: "Detajet e kontrollit të orarit",
  seat_alert: "Sinjalizimi i vendeve", seat_miss_last_at: "Kontrolli i fundit pa vende",
  seat_google_price: "Çmimi nga kontrolli i vendeve", alert_dismissed_at: "Koha e mbylljes së njoftimit",
  flight_id: "ID e fluturimit", booking_id: "ID e rezervimit", booking_ref: "Referenca e rezervimit",
  agent_id: "ID e agjencisë", booking_user_id: "ID e klientit të portalit",
  total_amount: "Shuma totale", paid_amount: "Shuma e paguar", markup: "Shtesa mbi çmim",
  commission: "Komisioni", discount: "Zbritja", pnr: "PNR", source: "Burimi", notes: "Shënime",
  ticket_search_excluded: "Përjashtuar nga kërkimi i biletës", ticket_search_note: "Shënimi i kërkimit të biletës",
  ticket_search_note_at: "Koha e shënimit të kërkimit", ticket_email_pending: "Në pritje të email-it të biletës",
  ticket_email_sent_at: "Koha e dërgimit të biletës", customer_name: "Emri i klientit",
  customer_email: "Email-i i klientit", customer_phone: "Telefoni i klientit", airline_ticket_url: "Dokumenti i biletës",
  airline: "Linja ajrore", flight_number: "Numri i fluturimit", from_city: "Nisja", to_city: "Mbërritja",
  departure_date: "Data e nisjes", departure_time: "Ora e nisjes", arrival_date: "Data e mbërritjes",
  arrival_time: "Ora e mbërritjes", adult_price: "Çmimi për të rritur", child_price: "Çmimi për fëmijë",
  infant_price: "Çmimi për foshnjë", citizen_price: "Çmimi Offline", net_price: "Çmimi neto",
  tax: "Taksa", total_seats: "Vendet totale", sold_seats: "Vendet e shitura", status: "Statusi",
  is_confirmed: "Fluturim i konfirmuar", cabin_baggage_kg: "Bagazh kabine (kg)",
  checked_baggage_count: "Numri i bagazheve të dorëzuara", checked_baggage_kg: "Bagazh i dorëzuar (kg)",
  checked_baggage_price: "Çmimi i bagazhit", seat_selection_price: "Çmimi i zgjedhjes së vendit",
  priority_boarding_price: "Çmimi i përparësisë", insurance_price: "Çmimi i sigurimit",
  sell_cutoff_hours: "Afati i mbylljes së shitjes (orë)", show_in_booking_engine: "Shfaqet në portal",
  exclude_from_google_rule: "Përjashtuar nga rregullat Google", external_sales_blocked: "Shitjet e jashtme të bllokuara",
  amount: "Shuma", method: "Mënyra e pagesës", is_refund: "Rimbursim", confirmed: "E konfirmuar",
  confirm_note: "Shënimi i konfirmimit", invoice_code: "Kodi i faturës",
  first_name: "Emri", last_name: "Mbiemri", type: "Lloji", price: "Çmimi", ticket_price: "Çmimi i biletës",
  extras_total: "Totali i shtesave", checked_baggage: "Bagazh i dorëzuar", cabin_baggage: "Bagazh kabine",
  seat_selection: "Zgjedhja e vendit", priority_boarding: "Përparësi në imbarkim", insurance: "Sigurimi",
  description: "Përshkrimi", title: "Titulli", body: "Përmbajtja", message: "Mesazhi", name: "Emri",
  priority: "Prioriteti", assignee_id: "ID e përgjegjësit", creator_id: "ID e krijuesit",
  due_date: "Afati", completed_at: "Koha e përfundimit", parent_id: "ID e elementit prind",
  entity_type: "Lloji i lidhjes", entity_id: "ID e lidhjes", labels: "Etiketat", watchers: "Ndjekësit",
  auto_generated: "Krijuar automatikisht", auto_rule_key: "Rregulli automatik",
  airport: "Aeroporti", direction: "Drejtimi", date_from: "Nga data", date_to: "Deri më",
  group_id: "ID e grupit", claim_id: "ID e çështjes", event_type: "Lloji i ngjarjes",
  seats: "Vendet", old_total: "Totali i mëparshëm", user_id: "ID e përdoruesit",
  user_name: "Përdoruesi", user_role: "Roli", author_name: "Autori", author_role: "Roli i autorit",
  action: "Veprimi", field_name: "Fusha", old_value: "Vlera e mëparshme", new_value: "Vlera e re",
  note: "Shënimi", changes: "Ndryshimet", old_adult_price: "Çmimi i mëparshëm për të rritur",
  new_adult_price: "Çmimi i ri për të rritur", google_price: "Çmimi Google",
  notification_closed_at: "Koha e mbylljes së njoftimit", value: "Vlera", key: "Çelësi",
  seat_number: "Numri i vendit", baggage_option: "Zgjedhja e bagazhit",
  has_seat_selection: "Ka zgjedhje vendi", has_priority_boarding: "Ka përparësi",
  has_insurance: "Ka sigurim", extra_cost: "Kostoja e shtesave", split_group: "Grupi i ndarjes",
  created_at: "Koha e krijimit", updated_at: "Koha e përditësimit",
};
const ENUMS: Record<string, Record<string, string>> = {
  status: { draft: "Draft", pending: "Në pritje", confirmed: "Konfirmuar", ticketed: "Biletuar",
    cancelled: "Anuluar", open: "Hapur", soldout: "Pa vende", sold_out: "Pa vende", completed: "Përfunduar", failed: "Dështuar" },
  schedule_alert: { not_found: "Nuk u gjet në kontroll — nuk konfirmon anulimin", changed: "Ndryshim orari", cancelled: "Sinjalizim anulimi" },
  seat_alert: { not_found: "Nuk u gjet në kontroll", no_seats: "Nuk u gjetën vende" },
  type: { adult: "I rritur", child: "Fëmijë", infant: "Foshnjë" },
  user_role: { admin: "Administrator", manager: "Menaxher", agent: "Agjent", agent_staff: "Staf agjencie" },
};
export function activityLabel(field: string, labels: Record<string, string> = {}) {
  const snake = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  const camel = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return offlineText(ACTIVITY_FIELDS[snake] ?? labels[camel] ?? field.replace(/_/g, " "));
}
export function activityValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (value === "[E mbrojtur]") return "Vlerë e mbrojtur";
  if (value === true || value === "true") return "Po";
  if (value === false || value === "false") return "Jo";
  if (typeof value === "object") return offlineText(JSON.stringify(value));
  const text = String(value);
  return offlineText(ENUMS[field]?.[text] ?? text);
}
export function technicalActivity(entity: string, changes: Array<{field: string}>) {
  if (entity !== "flights" || !changes.length) return null;
  const seats = new Set(["seat_checked_at", "seat_miss_count", "seat_miss_last_at", "seat_alert", "seat_google_price"]);
  const schedule = new Set(["schedule_checked_at", "schedule_miss_count", "schedule_alert", "schedule_alert_detail"]);
  if (changes.every(c => seats.has(c.field))) return "Kontroll teknik i vendeve";
  if (changes.every(c => schedule.has(c.field))) return "Kontroll teknik i orarit";
  return null;
}
