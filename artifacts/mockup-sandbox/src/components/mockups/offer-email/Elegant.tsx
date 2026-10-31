import { useState } from "react";
import "./Elegant.css";

export function Elegant() {
  const [notice, setNotice] = useState(false);

  return (
    <main className="as-elegant-preview" lang="sq">
      <p className="elegant-preview-label">Parapamje · Ofertë shembull</p>
      <article className="elegant-email" aria-label="Ofertë shembull për agjencitë e udhëtimit">
        <header className="elegant-masthead">
          <table role="presentation">
            <tbody>
              <tr>
                <td>
                  <span className="elegant-logo-window">
                    <img src="/__mockup/images/air-home/albania-sky-logo.png" alt="Albania Sky" />
                  </span>
                </td>
                <td className="elegant-partner">Për partnerët tanë<br />Agjenci udhëtimi</td>
              </tr>
            </tbody>
          </table>
        </header>

        <img
          className="elegant-photo"
          src="/__mockup/images/air-home/wing-sky.webp"
          alt="Krahu i avionit mbi re, nën qiellin e hapur"
          width="600"
          height="247"
        />

        <section className="elegant-body">
          <p className="elegant-kicker">Një mundësi për udhëtimet e nëntorit</p>
          <h1>Oferta e nëntorit</h1>
          <p className="elegant-greeting">Të nderuar partnerë,</p>
          <p className="elegant-intro">
            Për planifikimet e radhës të klientëve tuaj, ju ftojmë të shihni ofertën
            për fluturime të zgjedhura në nëntor.
          </p>

          <div className="elegant-offer">
            <p className="elegant-discount">10% ulje</p>
            <p className="elegant-scope">Për fluturime të zgjedhura</p>
          </div>

          <table className="elegant-dates" role="presentation">
            <tbody>
              <tr>
                <td>
                  <span className="elegant-date-label">Periudha e udhëtimit</span>
                  <span className="elegant-date-value">1–30 nëntor 2026</span>
                </td>
                <td>
                  <span className="elegant-date-label">Afati i rezervimit</span>
                  <span className="elegant-date-value">31 tetor 2026, ora 23:59</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="elegant-action">
            <button className="elegant-button" type="button" onClick={() => setNotice(true)}>
              Shiko ofertën
            </button>
          </div>
          <p className="elegant-note">
            Ulja zbatohet vetëm mbi çmimin e biletës. Shtesat nuk përfshihen.
          </p>
        </section>

        <footer className="elegant-footer">
          <strong>Albania Sky</strong><br />
          Partneri juaj për rezervimet e fluturimeve.
        </footer>
      </article>
      {notice && (
        <p className="elegant-feedback" role="status">
          Parapamje — dërgimi nuk është aktiv
        </p>
      )}
    </main>
  );
}

export default Elegant;
