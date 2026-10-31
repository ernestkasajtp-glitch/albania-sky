import { ArrowRight, FileText, Info, Plane, Ticket } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import "@/styles/partner-welcome.css";

export function PartnerInvitation() {
  const { i18n } = useTranslation();
  const en = i18n.language === "en";
  return <section className="partner-invitation" aria-label={en ? "Agency sign-in information" : "Informacion për hyrjen"}>
    <Info aria-hidden="true" />
    <div role="status">
      <h2>{en ? "Flight search for travel partners" : "Kërkim fluturimesh vetëm për agjencitë e udhëtimit"}</h2>
      <p>{en ? "Sign in with your agency account to view airports, availability and fares." : "Hyni me llogarinë e agjencisë për të parë aeroportet, vendet e lira dhe çmimet."}</p>
    </div>
    <Link href="/login?redirect=%2F">{en ? "Agent sign in" : "Hyrja e agjentit"} <ArrowRight size={15} /></Link>
  </section>;
}

export function PartnerWorkspace({ signedIn }: { signedIn: boolean }) {
  const { i18n } = useTranslation();
  const en = i18n.language === "en";
  return <div className="partner-workspace">
    <section className="partner-tools">
      <span>{en ? "YOUR AGENCY WORKSPACE" : "HAPËSIRA E AGJENCISË TUAJ"}</span>
      <div><Plane />{en ? "Flight availability" : "Vendet e lira"}</div>
      <div><Ticket />{en ? "Client bookings" : "Rezervimet e klientëve"}</div>
      <div><FileText />{en ? "Booking documents" : "Dokumentet e rezervimeve"}</div>
    </section>
    <section className="partner-footnote">
      <div><h2>{en ? "A dedicated space for your agency." : "Një hapësirë e dedikuar për agjencinë tuaj."}</h2>
        <p>{en ? "Already a partner? Sign in above. New to Albania Sky? Request access for your agency." : "Jeni partner? Hyni më sipër. Jeni të rinj në Albania Sky? Kërkoni akses për agjencinë tuaj."}</p></div>
      <Link href={signedIn ? "/my-bookings" : "/register?role=agent"}>{signedIn ? (en ? "Your bookings" : "Rezervimet tuaja") : (en ? "Become a travel partner" : "Bëhuni partner udhëtimi")} <ArrowRight size={15} /></Link>
    </section>
  </div>;
}
