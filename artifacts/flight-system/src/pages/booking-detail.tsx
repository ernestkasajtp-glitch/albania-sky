import { useRoute, useLocation } from "wouter";
import { BookingDetailContent } from "@/components/BookingDetailContent";
import { PageLayoutGate } from "@/components/PageLayoutGate";
import { useInternalPageLayout } from "@/hooks/usePageLayout";
import BookingDetailPremium from "./booking-detail-premium";

export default function BookingDetail() {
  const [, params] = useRoute("/bookings/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;
  const layout = useInternalPageLayout("booking_detail");
  const onClose = () => setLocation("/bookings");
  return (
    <PageLayoutGate
      state={layout}
      render={v => v === "premium"
        ? <BookingDetailPremium bookingId={id} onClose={onClose} />
        : <BookingDetailContent bookingId={id} onClose={onClose} />}
    />
  );
}
