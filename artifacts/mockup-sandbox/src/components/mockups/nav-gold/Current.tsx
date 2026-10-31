import "./_group.css";
import { PreviewLayout } from "./_shared/Layout";
import { BookingsPremium } from "./_shared/BookingsPremium";

/**
 * Engineering extraction, not a redesign.
 * Source: flight-system/src/components/layout.tsx and pages/bookings-premium.tsx.
 * Theme is the current ThemeContext default (graphite), not the proposed gold skin.
 * Authentication, module permissions, requests, polling, persistent preferences,
 * navigation, detail dialogs and exports stop at the local _shared boundary.
 * All displayed records, identity, branding and notification counts are illustrative.
 * bookings-juniper/Current was checked: it is a classic-table approximation, not
 * the current premium page, so none of its JSX/styles or customer data is reused.
 */
export function Current() {
  return <div className="nav-gold-current min-h-screen">
    <PreviewLayout><BookingsPremium /></PreviewLayout>
  </div>;
}

export default Current;
