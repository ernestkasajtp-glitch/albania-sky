import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, rolePermissionsTable, userPermissionsTable, bookingUsersTable } from "@workspace/db";

const router: IRouter = Router();

// ═════════════════════════════════════════════════════════════════════════════
//   PERMISSIONS — SOURCE OF TRUTH
//   Organizuar sipas FAQEVE të sistemit. Çdo faqe ka:
//     • can_access_<page>     — akses te faqja (shfaqet ne sidebar / route guard)
//     • can_view_<field>      — shiko fusha specifike
//     • can_edit_<field>      — edito fusha specifike
//     • can_<action>          — veprime (butona)
//   Default-et per cdo rol jane te perfshira inline (manager / agent_staff).
//   Admin ka GJITHCKA gjithmone (hardcoded).
// ═════════════════════════════════════════════════════════════════════════════

type RoleDefaults = { manager: boolean; agent_staff: boolean };
type PermDef = { key: string; label: string; defaults: RoleDefaults };
type PermGroup = { label: string; icon: string; perms: PermDef[] };

const M = (manager: boolean, agent_staff: boolean): RoleDefaults => ({ manager, agent_staff });

export const PERMISSION_GROUPS: PermGroup[] = [
  // ─── 1. DASHBOARD ─────────────────────────────────────────────────────────
  {
    label: "Dashboard (Faqja Kryesore)",
    icon: "🏠",
    perms: [
      // Akses dhe header
      { key: "can_access_dashboard",                 label: "Akses te Dashboard-i",                                       defaults: M(true,  true)  },
      { key: "can_use_dashboard_new_booking_button", label: "Shiko butonin '+ Rezervim i Ri' (lart djathtas)",            defaults: M(true,  true)  },

      // Filtri i periudhes
      { key: "can_use_dashboard_period_selector",    label: "Përdor filtrin e Periudhës (Sot/Javë/Muaj/3M/Vit)",          defaults: M(true,  false) },
      { key: "can_use_dashboard_custom_period",      label: "Përdor periudhën 'Personalizuar' (date range)",              defaults: M(true,  false) },

      // 6 KPI cards
      { key: "can_view_dashboard_kpi_sales",         label: "Kartela KPI 'Shitjet Totale' (blu)",                         defaults: M(true,  false) },
      { key: "can_view_dashboard_kpi_paid",          label: "Kartela KPI 'Totali i Paguar' (jeshil)",                     defaults: M(true,  false) },
      { key: "can_view_dashboard_kpi_debt",          label: "Kartela KPI 'Borxh Total' (kuq)",                            defaults: M(true,  false) },
      { key: "can_view_dashboard_kpi_commission",    label: "Kartela KPI 'Komisioni' (violet) — komisioni i agjentëve",   defaults: M(false, false) },
      { key: "can_view_dashboard_kpi_bookings",      label: "Kartela KPI 'Rezervime' (portokalli)",                       defaults: M(true,  true)  },
      { key: "can_view_dashboard_kpi_passengers",    label: "Kartela KPI 'Pasagjerë' (qielli)",                           defaults: M(true,  true)  },

      // Panelet
      { key: "can_view_dashboard_revenue_chart",     label: "Shiko grafikun 'Të Ardhurat' (30 Ditë / 12 Muaj)",           defaults: M(true,  false) },
      { key: "can_view_dashboard_top_destinations",  label: "Shiko panelin 'Top Destinacionet'",                          defaults: M(true,  true)  },
      { key: "can_view_dashboard_status_donut",      label: "Shiko 'Statuset' (donut chart)",                             defaults: M(true,  true)  },
      { key: "can_view_dashboard_almost_sold_out",   label: "Shiko 'Gati Sold Out' (fluturime me <10 vende)",             defaults: M(true,  true)  },
      { key: "can_view_dashboard_top_agents",        label: "Shiko 'Top Agjentët'",                                       defaults: M(true,  false) },
      { key: "can_view_dashboard_high_dates",        label: "Shiko 'Datat me Fluturime'",                                 defaults: M(true,  true)  },
      { key: "can_view_dashboard_attention",         label: "Shiko 'Kërkon Vëmendje' (rezervimet pa paguar)",             defaults: M(true,  false) },
    ],
  },

  // ─── 2. FLUTURIMET (lista) ────────────────────────────────────────────────
  {
    label: "Fluturimet (Lista)",
    icon: "✈️",
    perms: [
      { key: "can_access_flights",        label: "Akses te faqja e Fluturimeve",                                 defaults: M(true,  true)  },
      { key: "can_view_flights",          label: "Shiko inventarin e fluturimeve [legacy]",                      defaults: M(true,  true)  },
      { key: "can_create_flights",        label: "Shto fluturime te reja (+ buton)",                             defaults: M(false, false) },
      { key: "can_edit_flights",          label: "Edito fluturimet ekzistuese",                                  defaults: M(false, false) },
      { key: "can_delete_flights",        label: "Fshi fluturimet",                                              defaults: M(false, false) },
      { key: "can_duplicate_flights",     label: "Dyfisho fluturimet",                                           defaults: M(false, false) },
      { key: "can_toggle_flight_sales",   label: "Hap/Mbyll shitjet e fluturimit",                               defaults: M(true,  false) },
      { key: "can_edit_flight_extras",    label: "Edito ekstrat (bagazh, ulëse, prioritet)",                     defaults: M(false, false) },
      { key: "can_import_flights",        label: "Importo fluturime nga Excel",                                  defaults: M(false, false) },
      { key: "can_use_google_price_tools",label: "Përdor butonat e Google (Sinkronizo Çmimet / Kontrollo Çmime + Orare)", defaults: M(false, false) },
      { key: "can_view_flight_net_price", label: "Shiko çmimin neto/kostos te fluturimi",                        defaults: M(true,  false) },
      { key: "can_edit_flight_net_price", label: "Edito çmimin neto/kostos te fluturimi",                        defaults: M(false, false) },
      { key: "can_view_flight_seats_sold",label: "Shiko numrin e ulëseve te shitura per fluturim",               defaults: M(true,  true)  },
      { key: "can_search_flights",        label: "Përdor fushën e kërkimit te fluturimet",                       defaults: M(true,  true)  },
      { key: "can_filter_flights",        label: "Përdor filtrat te fluturimet (status, linjë, etj.)",           defaults: M(true,  true)  },
      { key: "can_manage_flights",        label: "[Legacy] Menaxho fluturimet",                                  defaults: M(false, false) },
    ],
  },

  // ─── 3. FLIGHT DETAIL ────────────────────────────────────────────────────
  {
    label: "Detajet e Fluturimit",
    icon: "🛫",
    perms: [
      { key: "can_access_flight_detail",       label: "Akses te faqja e detajit te fluturimit",                  defaults: M(true,  true)  },
      { key: "can_view_flight_bookings_list",  label: "Shiko listen e rezervimeve per fluturimin",               defaults: M(true,  true)  },
      { key: "can_view_flight_passengers_list",label: "Shiko listen e pasagjerëve per fluturimin",               defaults: M(true,  true)  },
      { key: "can_export_flight_manifest",     label: "Eksporto manifestin e fluturimit (Excel)",                defaults: M(true,  false) },
    ],
  },

  // ─── 4. REZERVIMET (lista) ───────────────────────────────────────────────
  {
    label: "Rezervimet (Lista)",
    icon: "📋",
    perms: [
      { key: "can_access_bookings",             label: "Akses te faqja e Rezervimeve",                           defaults: M(true,  true)  },
      { key: "can_view_all_bookings",           label: "Shiko TË GJITHA rezervimet (jo vetëm të vetat)",         defaults: M(true,  false) },
      { key: "can_use_new_booking_button",      label: "Shiko butonin '+ Rezervim i Ri'",                        defaults: M(true,  true)  },
      { key: "can_search_bookings",             label: "Përdor fushën e kërkimit (klient, REF, PNR, etj.)",      defaults: M(true,  true)  },
      { key: "can_filter_bookings_by_status",   label: "Filtër sipas statusit",                                  defaults: M(true,  true)  },
      { key: "can_filter_bookings_by_agent",    label: "Filtër sipas agjencisë",                                 defaults: M(true,  false) },
      { key: "can_use_advanced_booking_filters",label: "Përdor butonin 'Më shumë' (filtrat e avancuar)",         defaults: M(true,  false) },
      { key: "can_view_bookings_total_count",   label: "Shiko numrin total 'X rezervime gjithsej'",              defaults: M(true,  false) },
      { key: "can_view_commission_in_bookings_list", label: "Shiko kolonën 'Komisioni' te lista e rezervimeve",  defaults: M(true,  false) },
      { key: "can_export_bookings",             label: "Eksporto rezervimet (Excel/PDF)",                        defaults: M(false, false) },
      { key: "can_view_stat_bookings_today",    label: "Kartela 'Rezervime' lart (numri)",                       defaults: M(true,  false) },
      { key: "can_view_stat_sales_today",       label: "Kartela 'Shitje' lart (totali)",                         defaults: M(true,  false) },
      { key: "can_view_stat_profit_today",      label: "Kartela 'Profit' lart (fitimi)",                         defaults: M(true,  false) },
      { key: "can_view_stat_unpaid_total",      label: "Kartela 'Pa paguar' lart",                               defaults: M(true,  false) },
    ],
  },

  // ─── 5. KRIJIMI I REZERVIMIT (/bookings/new) ─────────────────────────────
  {
    label: "Krijimi i Rezervimit",
    icon: "➕",
    perms: [
      { key: "can_create_bookings",            label: "Krijo rezervime te reja",                                 defaults: M(true,  true)  },
      { key: "can_apply_discounts",            label: "Apliko zbritje gjate krijimit",                           defaults: M(true,  false) },
      { key: "can_edit_sell_price_on_create",  label: "Edito direkt çmimin e shitjes gjate krijimit",            defaults: M(false, false) },
      { key: "can_edit_markup_on_create",      label: "Edito markup-in gjate krijimit",                          defaults: M(true,  false) },
      { key: "can_assign_booking_to_agent",    label: "Caktoji rezervimin nje agjenti tjeter",                   defaults: M(true,  false) },
      { key: "can_set_customer_email_on_create",label: "Vendos email-in e klientit gjate krijimit",              defaults: M(true,  true)  },
      { key: "can_set_customer_phone_on_create",label: "Vendos telefonin e klientit gjate krijimit",             defaults: M(true,  true)  },
      { key: "can_use_agent_wallet_on_create", label: "Përdor portofolin e agjentit per pagese",                 defaults: M(true,  false) },
    ],
  },

  // ─── 6. DETAJET E REZERVIMIT (/bookings/:id) ─────────────────────────────
  {
    label: "Detajet e Rezervimit",
    icon: "📄",
    perms: [
      { key: "can_view_booking_detail",        label: "Akses te detaji i rezervimit",                            defaults: M(true,  true)  },
      { key: "can_edit_bookings",              label: "Edito te dhenat baze (klient, shenime)",                  defaults: M(true,  true)  },
      { key: "can_edit_booking_pnr",           label: "Edito PNR-në",                                            defaults: M(true,  false) },
      { key: "can_edit_booking_client_info",   label: "Edito klient/email/telefon",                              defaults: M(true,  true)  },
      { key: "can_edit_booking_notes",         label: "Edito shenimet",                                          defaults: M(true,  true)  },
      { key: "can_edit_booking_passengers",    label: "Edito pasagjerët (emër, pasaportë, ulëse)",               defaults: M(true,  true)  },
      { key: "can_add_booking_passengers",     label: "Shto pasagjerë te ri ne rezervim",                        defaults: M(true,  true)  },
      { key: "can_delete_booking_passengers",  label: "Fshi pasagjerët nga rezervimi",                           defaults: M(true,  false) },
      { key: "can_edit_booking_status",        label: "Ndrysho statusin (draft→confirmed→ticketed)",             defaults: M(true,  false) },
      { key: "can_cancel_bookings",            label: "Anulo rezervimet",                                        defaults: M(true,  false) },
      { key: "can_restore_bookings",           label: "Rikthe rezervimet e anuluara",                            defaults: M(false, false) },
      { key: "can_delete_bookings",            label: "Fshi rezervimet plotesisht",                              defaults: M(false, false) },
      { key: "can_view_booking_net_price",     label: "Shiko çmimin neto te rezervimit",                         defaults: M(true,  false) },
      { key: "can_view_booking_profit",        label: "Shiko fitimin neto te rezervimit",                        defaults: M(true,  false) },
      { key: "can_view_booking_commission",    label: "Shiko komisionin e agjentit",                             defaults: M(true,  false) },
      { key: "can_edit_booking_sell_price",    label: "Edito çmimin total te shitjes",                           defaults: M(false, false) },
      { key: "can_edit_booking_markup",        label: "Edito markup-in",                                         defaults: M(true,  false) },
      { key: "can_edit_passenger_ticket_price",label: "Edito çmimin e biletes per pasagjer",                     defaults: M(false, false) },
      { key: "can_view_booking_history",       label: "Shiko historikun e ndryshimeve",                          defaults: M(true,  false) },
      { key: "can_view_booking_audit_trail",   label: "Shiko audit trail-in (kush dhe kur)",                     defaults: M(false, false) },
      { key: "can_send_booking_whatsapp",      label: "Dergo te dhenat me WhatsApp",                             defaults: M(true,  true)  },
      { key: "can_export_booking_excel",       label: "Eksporto rezervimin ne Excel",                            defaults: M(true,  true)  },
      { key: "can_print_booking_voucher",      label: "Printo voucher-in/biletën",                               defaults: M(true,  true)  },
      { key: "can_suggest_price",              label: "Sugjeron ndryshim çmimi (kerkon aprovim admin)",          defaults: M(true,  false) },
    ],
  },

  // ─── 7. PASAGJERET (/passengers) ─────────────────────────────────────────
  {
    label: "Pasagjerët",
    icon: "👤",
    perms: [
      { key: "can_access_passengers",      label: "Akses te faqja e Pasagjerëve",                                defaults: M(true,  true)  },
      { key: "can_view_passengers",        label: "Shiko listen e pasagjerëve [legacy]",                         defaults: M(true,  true)  },
      { key: "can_edit_passenger_details", label: "Edito të dhënat (emër, DOB, kombësi)",                        defaults: M(true,  true)  },
      { key: "can_view_passport_info",     label: "Shiko numrat e pasaportave",                                  defaults: M(true,  true)  },
      { key: "can_view_passenger_dob",     label: "Shiko datëlindjet",                                           defaults: M(true,  true)  },
      { key: "can_view_passenger_nationality",label: "Shiko kombësinë",                                          defaults: M(true,  true)  },
      { key: "can_export_passengers",      label: "Eksporto listen e pasagjerëve",                               defaults: M(true,  false) },
      { key: "can_search_passengers",      label: "Përdor kërkimin te pasagjerët",                               defaults: M(true,  true)  },
    ],
  },

  // ─── 8. PAGESAT (/payments) ──────────────────────────────────────────────
  {
    label: "Pagesat",
    icon: "💳",
    perms: [
      { key: "can_access_payments",            label: "Akses te faqja e Pagesave",                               defaults: M(true,  false) },
      { key: "can_manage_payments",            label: "Shto / edito pagesat",                                    defaults: M(true,  false) },
      { key: "can_cancel_payments",            label: "Anulo pagesat (strikethrough)",                           defaults: M(true,  false) },
      { key: "can_edit_payments_ledger",       label: "Konfirmo / Anulo / shëno pagesat te 'Regjistri i Pagesave'", defaults: M(false, false) },
      { key: "can_refund_payments",            label: "Bej rimbursime",                                          defaults: M(false, false) },
      { key: "can_use_bulk_payment",           label: "Përdor 'Pagesa Masive'",                                  defaults: M(true,  false) },
      { key: "can_view_payments_ledger",       label: "Shiko 'Regjistri i Pagesave' (te gjitha levizjet)",       defaults: M(true,  false) },
      { key: "can_view_payments_report",       label: "Shiko 'Shkarko Raport' (tab raporti)",                    defaults: M(false, false) },
      { key: "can_view_payments_from_clients", label: "Shiko 'Pagesa nga Klientët'",                             defaults: M(true,  false) },
      { key: "can_export_payment_report_pdf",  label: "Eksporto raportin e pagesave (PDF/Excel)",                defaults: M(false, false) },
      { key: "can_view_payments_total_paid",   label: "Shiko totalin 'Paguar' ne raport",                        defaults: M(true,  false) },
      { key: "can_view_payments_commission",   label: "Shiko 'Komisioni Total' ne raport pagesash",              defaults: M(false, false) },
    ],
  },

  // ─── 9. AGJENTET (/agents) ──────────────────────────────────────────────
  {
    label: "Agjentët (Lista)",
    icon: "🏢",
    perms: [
      { key: "can_access_agents",          label: "Akses te faqja e Agjentëve",                                  defaults: M(true,  false) },
      { key: "can_view_agents",            label: "Shiko listen e agjentëve [legacy]",                           defaults: M(true,  false) },
      { key: "can_create_agents",          label: "Shto agjentë te ri",                                          defaults: M(false, false) },
      { key: "can_edit_agents",            label: "Edito te dhenat e agjentit (emër, kontakt)",                  defaults: M(true,  false) },
      { key: "can_delete_agents",          label: "Fshi agjentët",                                               defaults: M(false, false) },
      { key: "can_edit_agent_commission",  label: "Edito % e komisionit te agjentit",                            defaults: M(false, false) },
      { key: "can_edit_agent_markup",      label: "Edito markup-in e agjentit",                                  defaults: M(true,  false) },
      { key: "can_edit_agent_credit_limit",label: "Edito limitin e kreditit te agjentit",                        defaults: M(false, false) },
      { key: "can_manage_agent_wallet",    label: "Menaxho portofolin (depozita/tërheqje)",                      defaults: M(true,  false) },
      { key: "can_view_agent_wallet_balance",label: "Shiko bilancin e portofolit",                               defaults: M(true,  false) },
      { key: "can_view_agent_total_sales", label: "Shiko shitjet totale per agjent",                             defaults: M(true,  false) },
      { key: "can_view_commission_in_agents", label: "Shiko komisionet te lista/detaji i agjentit",              defaults: M(false, false) },
      { key: "can_search_agents",          label: "Përdor kërkimin te agjentët",                                 defaults: M(true,  false) },
      { key: "can_manage_agents",          label: "[Legacy] Menaxho agjentët",                                   defaults: M(false, false) },
    ],
  },

  // ─── 10. AGENT DETAIL (/agents/:id) ─────────────────────────────────────
  {
    label: "Detajet e Agjentit",
    icon: "👔",
    perms: [
      { key: "can_view_agent_detail",          label: "Akses te detaji i agjentit",                              defaults: M(true,  false) },
      { key: "can_view_agent_bookings_list",   label: "Shiko listen e rezervimeve te agjentit",                  defaults: M(true,  false) },
      { key: "can_view_agent_credit_history",  label: "Shiko historikun e kreditit/portofolit",                  defaults: M(true,  false) },
      { key: "can_export_agent_statement",     label: "Eksporto extrakt agjenti",                                defaults: M(true,  false) },
    ],
  },

  // ─── 11. TIKETAT GRUP (/group-tickets) ──────────────────────────────────
  {
    label: "Tiketat Grup (Charter / Block-Seat)",
    icon: "🎫",
    perms: [
      { key: "can_access_group_tickets",   label: "Akses te faqja e Tiketave Grup",                              defaults: M(true,  false) },
      { key: "can_view_group_tickets",     label: "Shiko grupet [legacy]",                                       defaults: M(true,  true)  },
      { key: "can_search_group_tickets",   label: "Përdor panel-in e kërkimit (from/to/date/persons)",           defaults: M(true,  true)  },
      { key: "can_create_group_tickets",   label: "Krijo grupe te reja",                                         defaults: M(false, false) },
      { key: "can_edit_group_tickets",     label: "Edito grupet ekzistuese",                                     defaults: M(false, false) },
      { key: "can_delete_group_tickets",   label: "Fshi grupet",                                                 defaults: M(false, false) },
      { key: "can_view_group_ticket_prices",label: "Shiko çmimet e grupeve",                                     defaults: M(true,  true)  },
      { key: "can_edit_group_ticket_prices",label: "Edito çmimet e grupeve",                                     defaults: M(false, false) },
      { key: "can_create_group_sales",     label: "Krijo shitje (rezervime) brenda grupit",                      defaults: M(true,  true)  },
      { key: "can_edit_group_sales",       label: "Edito shitjet brenda grupit",                                 defaults: M(true,  true)  },
      { key: "can_delete_group_sales",     label: "Fshi shitjet brenda grupit",                                  defaults: M(true,  false) },
      { key: "can_manage_airport_alternatives",label: "Menaxho aeroportet alternative",                          defaults: M(false, false) },
    ],
  },

  // ─── 12. RAPORTET (/reports) ────────────────────────────────────────────
  {
    label: "Raportet",
    icon: "📊",
    perms: [
      { key: "can_access_reports",          label: "Akses te seksioni i Raporteve",                              defaults: M(true,  false) },
      { key: "can_view_reports",            label: "Shiko raportet [legacy]",                                    defaults: M(true,  false) },
      { key: "can_view_sales_report",       label: "Shiko raportin e shitjeve",                                  defaults: M(true,  false) },
      { key: "can_view_route_report",       label: "Shiko performancën sipas rutës",                             defaults: M(true,  false) },
      { key: "can_view_airline_report",     label: "Shiko performancën sipas linjës ajrore",                     defaults: M(true,  false) },
      { key: "can_view_agent_report",       label: "Shiko shitjet sipas agjentit",                               defaults: M(true,  false) },
      { key: "can_view_profit_in_reports",  label: "Shiko fitimin (profit) ne raporte",                          defaults: M(true,  false) },
      { key: "can_view_commission_in_reports",label: "Shiko komisionet ne raporte",                              defaults: M(false, false) },
      { key: "can_export_reports",          label: "Eksporto raportet (Excel/PDF)",                              defaults: M(true,  false) },
    ],
  },

  // ─── 13. MY REQUESTS (/my-requests) ─────────────────────────────────────
  {
    label: "Kërkesat e Mia (Çmime)",
    icon: "📨",
    perms: [
      { key: "can_access_my_requests",        label: "Akses te faqja 'Kërkesat e Mia'",                          defaults: M(true,  true)  },
      { key: "can_create_net_price_request",  label: "Krijo kerkese per çmim neto",                              defaults: M(true,  false) },
      { key: "can_edit_booking_net_price",    label: "Korrigjo/shto çmimin neto direkt (PA kërkesë aprovimi)",   defaults: M(true,  false) },
    ],
  },

  // ─── 14. PRICE REQUESTS (/price-requests) — admin tipik ─────────────────
  {
    label: "Kërkesat per Çmim (Admin)",
    icon: "✅",
    perms: [
      { key: "can_access_price_requests",  label: "Akses te faqja e kërkesave per çmim",                         defaults: M(false, false) },
      { key: "can_approve_price_requests", label: "Aprovo kërkesat per çmim",                                    defaults: M(false, false) },
      { key: "can_reject_price_requests",  label: "Refuzo kërkesat per çmim",                                    defaults: M(false, false) },
    ],
  },

  // ─── 15. PERDORUESIT (/users) ──────────────────────────────────────────
  {
    label: "Përdoruesit",
    icon: "👥",
    perms: [
      { key: "can_access_users",          label: "Akses te faqja e Përdoruesve",                                 defaults: M(false, false) },
      { key: "can_manage_users",          label: "Krijo / edito / fshi përdoruesit [legacy]",                    defaults: M(false, false) },
      { key: "can_create_users",          label: "Shto përdorues të ri",                                         defaults: M(false, false) },
      { key: "can_edit_users",            label: "Edito përdoruesit ekzistues",                                  defaults: M(false, false) },
      { key: "can_delete_users",          label: "Fshi përdoruesit",                                             defaults: M(false, false) },
      { key: "can_reset_user_password",   label: "Resetoj fjalëkalimin e nje përdoruesi",                        defaults: M(false, false) },
      { key: "can_change_user_role",      label: "Ndrysho rolin e nje përdoruesi",                               defaults: M(false, false) },
    ],
  },

  // ─── 16. CILESIMET (/settings) ─────────────────────────────────────────
  {
    label: "Cilësimet",
    icon: "⚙️",
    perms: [
      { key: "can_access_settings",         label: "Akses te faqja e Cilësimeve",                                defaults: M(true,  true)  },
      { key: "can_change_theme",            label: "Ndrysho temen e ndërfaqes",                                  defaults: M(true,  true)  },
      { key: "can_change_own_password",     label: "Ndrysho fjalëkalimin e vet",                                 defaults: M(true,  true)  },
      { key: "can_manage_user_signature",   label: "Menaxho nënshkrimin (per email/voucher)",                    defaults: M(true,  true)  },
      { key: "can_manage_branding",         label: "Menaxho logo / branding e sistemit",                         defaults: M(false, false) },
      { key: "can_manage_integrations",     label: "Konfiguro integrimet (Offline, SMTP, etj.)",            defaults: M(false, false) },
      { key: "can_view_audit_log",          label: "Shiko log-un e veprimeve te sistemit",                       defaults: M(false, false) },
    ],
  },

  // ─── 17. KONTROLLO ORARET (/schedule-check) ────────────────────────────
  {
    label: "Kontrollo Oraret",
    icon: "🔎",
    perms: [
      { key: "can_access_schedule_check",   label: "Akses te faqja 'Kontrollo Oraret'",                          defaults: M(false, false) },
    ],
  },

  // ─── 18. DESTINACIONE (/destinations) ──────────────────────────────────
  {
    label: "Destinacione",
    icon: "📍",
    perms: [
      { key: "can_access_destinations",     label: "Akses te faqja 'Destinacione'",                              defaults: M(false, false) },
    ],
  },

  // ─── 19. LEJET (/permissions) — vetëm admin, jo permission gate ─────────
  // Faqja /permissions kontrollohet me requireAdmin ne backend dhe nuk ka
  // permission key — admin gjithmone, te tjerët kurrë.
];

// ═════════════════════════════════════════════════════════════════════════════
//   Derived structures — auto-generated nga PERMISSION_GROUPS me lart.
// ═════════════════════════════════════════════════════════════════════════════

export const ALL_PERMISSIONS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const g of PERMISSION_GROUPS) for (const p of g.perms) out[p.key] = p.label;
  return out;
})();

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = (() => {
  const manager: Record<string, boolean> = {};
  const agent_staff: Record<string, boolean> = {};
  for (const g of PERMISSION_GROUPS) for (const p of g.perms) {
    manager[p.key] = p.defaults.manager;
    agent_staff[p.key] = p.defaults.agent_staff;
  }
  return { manager, agent_staff };
})();

// Struktur e thjeshte per frontend-in (vetëm key + label per grup).
const GROUPS_FOR_API = PERMISSION_GROUPS.map(g => ({
  label: g.label,
  icon: g.icon,
  perms: g.perms.map(p => p.key),
}));

const FMS_MANAGED_ROLES = ["manager", "agent_staff"];

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) { res.status(401).json({ error: "Jo i autentikuar" }); return; }
  next();
}
function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  next();
}

export async function getEffectivePermissions(role: string, userId?: number): Promise<Record<string, boolean>> {
  const roleRows = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.role, role));
  const defaults = DEFAULT_PERMISSIONS[role] ?? {};
  const result: Record<string, boolean> = { ...defaults };
  for (const row of roleRows) result[row.permission] = row.enabled;

  if (userId !== undefined) {
    const userRows = await db.select().from(userPermissionsTable).where(eq(userPermissionsTable.userId, userId));
    for (const row of userRows) result[row.permission] = row.enabled;
  }

  return result;
}

router.get("/permissions", requireAdmin, async (req, res): Promise<void> => {
  const result: Record<string, Record<string, boolean>> = {};
  for (const role of FMS_MANAGED_ROLES) {
    result[role] = await getEffectivePermissions(role);
  }
  res.json({ permissions: result, definitions: ALL_PERMISSIONS, groups: GROUPS_FOR_API });
});

router.get("/permissions/my", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role || "";
  const userId = req.session.userId!;
  if (role === "admin") {
    const all: Record<string, boolean> = {};
    for (const k of Object.keys(ALL_PERMISSIONS)) all[k] = true;
    res.json(all); return;
  }
  if (!FMS_MANAGED_ROLES.includes(role)) { res.json({}); return; }
  res.json(await getEffectivePermissions(role, userId));
});

router.get("/permissions/user/:userId", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, targetId));
  if (!user) { res.status(404).json({ error: "Përdoruesi nuk u gjet" }); return; }

  const userRows = await db.select().from(userPermissionsTable).where(eq(userPermissionsTable.userId, targetId));
  const overrides: Record<string, boolean> = {};
  for (const row of userRows) overrides[row.permission] = row.enabled;

  const effective = await getEffectivePermissions(user.role, targetId);

  res.json({ userId: targetId, role: user.role, name: user.name, overrides, effective });
});

router.put("/permissions/user/:userId", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, targetId));
  if (!user) { res.status(404).json({ error: "Përdoruesi nuk u gjet" }); return; }

  const updates: Record<string, boolean | null> = req.body;

  for (const [permission, value] of Object.entries(updates)) {
    if (!ALL_PERMISSIONS[permission]) continue;

    const existing = await db.select().from(userPermissionsTable)
      .where(and(eq(userPermissionsTable.userId, targetId), eq(userPermissionsTable.permission, permission)));

    if (value === null) {
      if (existing.length > 0) {
        await db.delete(userPermissionsTable)
          .where(and(eq(userPermissionsTable.userId, targetId), eq(userPermissionsTable.permission, permission)));
      }
    } else if (existing.length > 0) {
      await db.update(userPermissionsTable).set({ enabled: Boolean(value) })
        .where(and(eq(userPermissionsTable.userId, targetId), eq(userPermissionsTable.permission, permission)));
    } else {
      await db.insert(userPermissionsTable).values({ userId: targetId, permission, enabled: Boolean(value) });
    }
  }

  const effective = await getEffectivePermissions(user.role, targetId);
  res.json({ success: true, effective });
});

router.delete("/permissions/user/:userId", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  await db.delete(userPermissionsTable).where(eq(userPermissionsTable.userId, targetId));
  res.json({ success: true });
});

router.put("/permissions/:role", requireAdmin, async (req, res): Promise<void> => {
  const { role } = req.params;
  if (!FMS_MANAGED_ROLES.includes(role)) { res.status(400).json({ error: "Rol i pavlefshëm" }); return; }
  const updates: Record<string, boolean> = req.body;
  for (const [permission, enabled] of Object.entries(updates)) {
    if (!ALL_PERMISSIONS[permission]) continue;
    const existing = await db.select().from(rolePermissionsTable)
      .where(and(eq(rolePermissionsTable.role, role), eq(rolePermissionsTable.permission, permission)));
    if (existing.length > 0) {
      await db.update(rolePermissionsTable).set({ enabled: Boolean(enabled) })
        .where(and(eq(rolePermissionsTable.role, role), eq(rolePermissionsTable.permission, permission)));
    } else {
      await db.insert(rolePermissionsTable).values({ role, permission, enabled: Boolean(enabled) });
    }
  }
  res.json({ success: true });
});

export default router;
