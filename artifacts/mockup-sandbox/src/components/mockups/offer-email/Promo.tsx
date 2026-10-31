import { useState } from "react";
import "./Promo.css";

export function Promo() {
  const [showPreviewMessage, setShowPreviewMessage] = useState(false);

  return (
    <main className="offer-promo-preview">
      <p className="promo-preview-label">Parapamje · Oferta aktive më 27 tetor 2026 · Pa dërgim</p>
      <article className="promo-email" lang="sq" aria-label="Parapamje emaili për agjencitë e udhëtimit">
        <header className="promo-brand">
          <table role="presentation" className="promo-brand-table">
            <tbody>
              <tr>
                <td>
                  <img className="promo-logo" src="/__mockup/images/air-home/albania-sky-logo.png" alt="Albania Sky" width="160" height="90" />
                </td>
                <td className="promo-brand-caption">Për agjencitë<br />e udhëtimit</td>
              </tr>
            </tbody>
          </table>
        </header>

        <section className="promo-announcement">
          <p className="promo-eyebrow">Oferta: 5%</p>
          <h1 className="promo-title">5% <span>ulje</span></h1>
        </section>

        <img className="promo-photo" src="/__mockup/images/offer-email-colorful-flight.jpg" alt="Pamje ilustruese e krahut të një avioni mbi detin e kaltër, në dritën e perëndimit" width="600" height="191" />

        <section className="promo-body">
          <table className="promo-details" role="presentation">
            <tbody>
              <tr>
                <td>
                  <span className="promo-detail-label">Periudha e udhëtimit</span>
                  <strong className="promo-detail-value">27 tetor 2026 – 31 janar 2027</strong>
                </td>
                <td>
                  <span className="promo-detail-label">Afati i rezervimit</span>
                  <strong className="promo-detail-value promo-deadline">27 tetor 2026, ora 23:59</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <button className="promo-cta" type="button" onClick={() => setShowPreviewMessage(true)}>Shiko ofertën</button>
          {showPreviewMessage && <p className="promo-message" role="status">Parapamje — dërgimi nuk është aktiv</p>}
        </section>

        <footer className="promo-footer">
          <strong>Albania Sky</strong>
        </footer>
      </article>
    </main>
  );
}
