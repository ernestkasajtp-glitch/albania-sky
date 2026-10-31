import { PageLayoutGate } from "@/components/PageLayoutGate";
import { useInternalPageLayout } from "@/hooks/usePageLayout";
import BookingNewClassic from "./booking-new-classic";
import BookingNewNeoGlass from "./booking-new-neo-glass";
import BookingNewPremium from "./booking-new-premium";

export default function BookingNew() {
  const layout = useInternalPageLayout("booking_new");
  return (
    <PageLayoutGate
      state={layout}
      render={v => v === "neoGlass" ? <BookingNewNeoGlass /> : v === "premium" ? <BookingNewPremium /> : <BookingNewClassic />}
    />
  );
}
