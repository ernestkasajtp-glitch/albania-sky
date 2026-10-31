import Home from "./_Home";
import { Navbar } from "./_Navbar";
import { language } from "./_local";
import "./_group.css";

export default function Proposed() {
  return <>
    <aside className="ah-prototype">Design proposal / isolated preview — guest, no live data, account actions or bookings. Empty API stubs; no destination fixtures.</aside>
    <div className="ah-home ah-proposed" lang={language()}><Navbar/><Home/></div>
  </>;
}
