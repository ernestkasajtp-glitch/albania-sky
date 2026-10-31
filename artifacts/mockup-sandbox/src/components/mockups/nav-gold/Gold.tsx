import "./_group.css";
import "./gold.css";
import { PreviewLayout } from "./_shared/Layout";
import { BookingsPremium } from "./_shared/BookingsPremium";

/** Reference navy/gold skin only; the extracted workspace remains unchanged. */
export function Gold() {
  return (
    <div className="nav-gold-current nav-gold-theme min-h-screen">
      <PreviewLayout>
        <BookingsPremium goldIcons />
      </PreviewLayout>
    </div>
  );
}

export default Gold;
