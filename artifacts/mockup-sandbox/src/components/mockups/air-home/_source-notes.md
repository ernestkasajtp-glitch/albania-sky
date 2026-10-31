# Albania Sky homepage: isolated design comparison

- `Current.tsx` and `Proposed.tsx` render the same extracted `_Home.tsx`, `_Navbar.tsx`, and `_Widgets.tsx`. Proposed differs only through scoped `.ah-proposed` styles.
- `_HomeSource.txt` and `_WidgetsSource.txt` are the provided source snapshots. Their JSX is retained, with semantic styling classes, local import boundaries, and one whitespace separator in the CTA.
- Navbar, English locale map and date labels are copied from booking-engine source into this group. The real logo is copied to sandbox public/images/air-home.
- Guest state is fixed. SQ is the default; `?lang=en` uses actual `locales/en.ts` entries. No new marketing copy, baggage, insurance or priority content has been added.
- All existing static hero, badge, validation, statistics, benefits, CTA and footer copy is preserved. Existing statistics and marketing claims come from the supplied source, not from newly asserted live data.
- Airports, routes, flight-date prices and destinations are empty local API stubs. Therefore the source's conditional destination section remains absent; no fake live fares or destination fixtures are displayed.
- Authentication, route links and analytics are stubbed. Passenger controls, calendar navigation and language selection operate locally. No bookings, payments, account calls or production requests can occur.
- The preview annotation is outside homepage content, marking the isolated comparison and inactive boundaries.
- Proposed direction: booking-portal layout, calm airline identity, warm neutral paper, restrained crimson accents, Outfit headings and DM Sans body, flat bordered search and support panels, no ornamental hero image. This follows the approved airtiketa-flow typography and airline-pages.css palette. Current retains source Inter typography and source gradients.
- Only mockup-sandbox files changed. No active booking-engine, backend, VPS or deployment changes.

## Sky: isolated photo preview

- `Sky.tsx` reuses `_Home.tsx` and `_Navbar.tsx` without edits. `_sky.css` imports `_group.css` and scopes every new override under `.ah-sky`. Current and Proposed remain unchanged.
- Direction: the approved booking-portal layout and Outfit / DM Sans typography, with a real panoramic wing photograph, translucent navy overlay, white search card and statistics separator, quiet warm-paper lower sections, retained red controls. No new copy, sections, statistics or fixtures.
- Photo discovered with the image-search skill: Pexels image 3939833, “Airplane wing soaring above fluffy clouds against bright blue sky.”
- Source page: https://www.pexels.com/photo/3939833/
- Downloaded source: https://images.pexels.com/photos/3939833/pexels-photo-3939833.jpeg?auto=compress&cs=tinysrgb&w=1600
- Pexels license: https://www.pexels.com/license/ . Free-use stock photograph; confirm applicable rights before any production rollout.
- Local asset: `public/images/air-home/wing-sky.webp`, served at `/__mockup/images/air-home/wing-sky.webp`. A 1600 × 760 panoramic crop of the real photograph, WebP quality 78, 49,756 bytes. No generated imagery, remote runtime photo requests, video, animation or polling.
- English is the initial language for this variation via the existing `?lang=en` mechanism. The source language switch remains operational; a session preference preserves a deliberate Albanian selection without changing shared local utilities.
- No prototype warning strip is rendered in Sky. This is still a guest-only isolated mockup with the existing empty API stubs and inactive navigation, not a production booking page.
