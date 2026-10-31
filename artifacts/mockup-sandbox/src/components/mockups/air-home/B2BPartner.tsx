import { useEffect, useRef, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronDown, CircleHelp, FileText, Info, LogIn, Plane, Search, Ticket, Users, X } from "lucide-react";
import "./B2BPartner.css";

export default function B2BPartner() {
  const [notice, setNotice] = useState(true);
  const [dialog, setDialog] = useState<"signin" | "access" | "help" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
      if (event.key === "Tab") {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".b2b-dialog button");
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => { window.removeEventListener("keydown", dismiss); previous?.focus(); };
  }, [dialog]);
  const requestSearch = () => setNotice(true);
  return (
    <div className="ah-home ah-proposed ah-sky b2b-preview" lang="en">
      <header className="b2b-header">
        <div className="b2b-brand"><img src="/__mockup/images/air-home/albania-sky-logo.png" alt="Albania Sky" /><span>PARTNER PORTAL</span></div>
        <button className="b2b-navlink" onClick={() => setDialog("help")}>Partner support</button>
        <button className="b2b-access" onClick={() => setDialog("access")}>Request agency access</button>
        <button className="b2b-signin" onClick={() => setDialog("signin")}><LogIn size={15} />Agent sign in</button>
      </header>
      <main>
        {/* Retains the extracted homepage's hero image, photo treatment and search-card geometry. */}
        <section className="ah-hero relative flex items-center">
          <div className="ah-hero-inner relative mx-auto w-full px-6">
            <div className="b2b-eyebrow"><BriefcaseBusiness size={13} />FOR TRAVEL PROFESSIONALS</div>
            <h1>Your agency’s<br />flight booking <span>portal.</span></h1>
            <p>Search flights, check availability and manage your clients’ bookings in one place.</p>
            <form className="b2b-search" onSubmit={event => { event.preventDefault(); requestSearch(); }}>
              <div className="b2b-search-fields">
                <div><label id="b2b-from">From</label><button type="button" className="b2b-field" aria-labelledby="b2b-from" onClick={requestSearch}><span>Airport / City</span><ChevronDown /></button></div>
                <div><label id="b2b-to">To</label><button type="button" className="b2b-field" aria-labelledby="b2b-to" onClick={requestSearch}><span>Airport / City</span><ChevronDown /></button></div>
                <div><label id="b2b-date">Departure date</label><button type="button" className="b2b-field" aria-labelledby="b2b-date" onClick={requestSearch}><CalendarDays /><span>Select date</span><ChevronDown /></button></div>
                <div><label id="b2b-pax">Passengers</label><button type="button" className="b2b-field" aria-labelledby="b2b-pax" onClick={requestSearch}><Users /><span>1 Adult</span><ChevronDown /></button></div>
              </div>
              {notice && <section className="b2b-invitation" aria-label="Agency sign-in information">
                <Info aria-hidden="true" />
                <div className="b2b-invitation-copy" role="status"><h2>Flight search for travel partners</h2><p>Sign in with your agency account to view airports, availability and fares.</p></div>
                <button type="button" onClick={() => setDialog("signin")}>Agent sign in <ArrowRight size={15} /></button>
              </section>}
              <div className="b2b-search-bottom"><p>For agency accounts · Not signed in</p><button type="submit" className="b2b-search-submit"><Search size={16} />Search flights</button></div>
            </form>
          </div>
        </section>
        <section className="b2b-tools" aria-label="Partner workspace">
          <span>YOUR AGENCY WORKSPACE</span>
          <div><Plane />Flight availability</div><div><Ticket />Client bookings</div><div><FileText />Booking documents</div>
        </section>
        <section className="b2b-footnote">
          <div><h2>A dedicated space for your agency.</h2><p>Already a partner? Sign in above. New to Albania Sky? Request access for your agency.</p></div>
          <button onClick={() => setDialog("access")}>Become a travel partner <ArrowRight size={15} /></button>
        </section>
      </main>
      {dialog && <div className="b2b-overlay" onClick={() => setDialog(null)}>
        <section className="b2b-dialog" role="dialog" aria-modal="true" aria-labelledby="b2b-dialog-title" onClick={event => event.stopPropagation()}>
          <button ref={closeRef} aria-label="Close preview" onClick={() => setDialog(null)}><X size={19} /></button>
          <small>INTERACTIVE DESIGN PREVIEW</small>
          {dialog === "signin" ? <><LogIn size={24} /><h2 id="b2b-dialog-title">Agent sign in</h2><p>This action will open your existing sign-in page when implemented. Authentication is not connected in this preview.</p></> :
            dialog === "access" ? <><BriefcaseBusiness size={24} /><h2 id="b2b-dialog-title">Request agency access</h2><p>This entry point is for new travel partners. A request does not grant immediate access. No request is sent from this preview.</p></> :
            <><CircleHelp size={24} /><h2 id="b2b-dialog-title">Partner support</h2><p>Your existing agency support options can appear here. This preview does not send messages or contact support.</p></>}
          <button className="b2b-dialog-done" onClick={() => setDialog(null)}>Back to preview</button>
        </section>
      </div>}
    </div>
  );
}
