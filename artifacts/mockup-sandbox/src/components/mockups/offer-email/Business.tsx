import { useState } from "react";
import "./Business.css";

export function Business() {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <main className="as-business-preview">
      <p className="as-business-label">Parapamje · Ofertë shembull</p>
      <article className="as-business-email" aria-label="Ofertë shembull për agjencitë e udhëtimit" lang="sq">
        <header className="as-business-masthead">
          <div className="as-business-logo-cell">
            <img
              className="as-business-logo"
              src="/__mockup/images/air-home/albania-sky-logo.png"
              alt="Albania Sky"
              width="152"
              height="85"
            />
          </div>
          <div className="as-business-brand-caption">PËR PARTNERËT TANË<br />AGJENCI UDHËTIMI</div>
        </header>

        <section className="as-business-intro">
          <p className="as-business-kicker">Informacion për agjencinë tuaj</p>
          <h1>Oferta e nëntorit</h1>
          <p>Të nderuar partnerë,<br />më poshtë gjeni përmbledhjen e ofertës, periudhën e udhëtimit dhe afatin e rezervimit.</p>
        </section>

        <img
          className="as-business-photo"
          src="/__mockup/images/air-home/wing-sky.webp"
          alt="Krahu i një avioni mbi re"
          width="600"
          height="185"
        />

        <section className="as-business-offer" aria-label="Përmbledhja dhe kushtet e ofertës">
          <div className="as-business-savings">
            <strong>10% ulje</strong>
            <span>Për fluturime të zgjedhura</span>
          </div>

          <table className="as-business-terms" aria-label="Periudha e udhëtimit dhe afati i rezervimit">
            <tbody>
              <tr>
                <th scope="row">Datat e udhëtimit</th>
                <td>1–30 nëntor 2026</td>
              </tr>
              <tr>
                <th scope="row">Rezervoni deri më</th>
                <td>31 tetor 2026, ora 23:59</td>
              </tr>
            </tbody>
          </table>

          <p className="as-business-note">Ulja zbatohet vetëm mbi çmimin e biletës. Shtesat nuk përfshihen.</p>

          <button className="as-business-button" type="button" onClick={() => setShowFeedback(true)}>
            Shiko ofertën <span aria-hidden="true" style={{ marginLeft: 17 }}>→</span>
          </button>
          {showFeedback && <p className="as-business-feedback" role="status">Parapamje — dërgimi nuk është aktiv</p>}
        </section>

        <footer className="as-business-footer">
          <strong>Albania Sky · Portali B2B</strong>
          <p>Komunikim për agjencitë e udhëtimit.</p>
        </footer>
      </article>
    </main>
  );
}
