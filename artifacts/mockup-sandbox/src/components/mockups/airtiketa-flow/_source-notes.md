# Canvas-only source parity audit

Read-only sources: booking-engine/src/pages/Flights.tsx, pages/BookFlight.tsx,
components/Navbar.tsx, lib/pageLayouts.tsx, lib/nameValidation.ts,
lib/utils.ts, lib/i18n-dates.ts, i18n.ts and locales/en.ts.
No active application files, APIs, registry settings or services were changed.

## Source → prototype

- Results → Flights search, cards and route-grouped table. Separate dated and
  all-route collections both constrain origin/destination; list ignores date.
  Source labels, per-person fare, original-price strike-through, sold-out rule
  (adults + children), remaining-seat text and checked-baggage details retained.
  Table headings and weekday/DD.MM formatting match source; times remain 24-hour.
- Passengers → visible BookFlight fields: type, required gender M/F, required
  name/last name, optional passport/nationality, child/infant DOB and checked
  baggage. Add/remove and conditional DOB remain. Name validation matches the
  actual trimmed A–Z/space/hyphen/apostrophe/dot regex, not the former stricter
  prototype pattern. Age and validation messages match handleSubmit.
- Summary → only Price Summary, Tickets × count, conditional Taxes & Fees,
  Additional Services, Savings and Total as rendered by BookFlight.
  Savings remain informational; total = effective fares + taxes + checked bags.
- Confirm Booking → local fixture confirmation, corresponding to source's
  non-payment action. Pay and Book → existing Payment frame, an inactive provider
  boundary. Source actually creates a booking then redirects to POK; it does
  not render a separate review/card form. Payment therefore repeats the source
  booking form with its submission actions disabled, not an invented checkout.
- Confirmation → source success heading/reference/status, flight/total block,
  passenger names/passport/type and the source's three actions. DEMO–SKY is an
  illustrative identifier, not a generated booking reference. Pending is a
  fixture status, not evidence of any real booking. PDF and My Bookings are
  disabled; Search Flights returns to Results.
- Header → existing local logo, Flights, inactive My Bookings, SQ/EN only.
  It represents the signed-in source branch without inventing an account.
- _copy.ts → 57 EN overrides copied verbatim from active locales/en.ts.
  SQ returns the original source keys, as active i18n.ts does.

## Removed extras

Removed marketing titles/slogans, support promises/links, route-explanation
sidebar, repeated demo notes, footer claims, numbered step navigation, back/next
buttons, flight-details toggle, sample-route reset, fare/subtotal/unit-price
breakdowns, one-way badge, tax multiplication caption, savings explanations,
baggage-summary prose, name/DOB helper text, invented validation messages,
read-only contact/email/phone details, review/change links, demo-payment panel,
acknowledgement checkbox, demo-notes toggle, simulated-payment button, simulation
success text, expandable on-screen receipt and actual-paid-€0 text.
Exactly one prototype/sample-data annotation sits outside product content.

## Intentional exclusions and honest gaps

- No PRIORITY, 32 kg tier, seat selection or insurance. Source contains
  conditional code for some extras; approved scope permits checked baggage only.
- No contact/notes controls: stored/submitted fields and printable-document
  content are not evidence of fields visible in the active booking form.
- No real authentication, account page, live inventory/discount eligibility,
  social-proof network data, booking/PNR creation, provider redirect, payment
  result, ticket/PDF generation or email. Unsupported outbound actions are
  disabled, not given substitute demo functions.
- All seven original fictional flights and original fictional passenger remain.
  Prices are local fixtures, not authoritative API calculations.
- Native selects/date/number controls substitute for source autocomplete,
  fare-calendar and passenger-popover widgets; they expose the same search
  inputs but do not reproduce those widgets or live route/calendar metadata.
  Local fixture session continuity is not production authentication/draft logic.
- Four Canvas URLs are preserved for review, not four claimed production pages.
  There is no four-step navigation or independently invented payment experience.
  Confirmation is a sample of source-rendered success, never proof of issuance.

Verification: pnpm --filter @workspace/mockup-sandbox typecheck
and node artifacts/mockup-sandbox/src/components/mockups/airtiketa-flow/_fixture-test.mjs.
The previous tests/air-flow.mjs expects removed invented labels/payment actions;
its fixture checks are adapted in the scoped test above, leaving outside files
untouched.
