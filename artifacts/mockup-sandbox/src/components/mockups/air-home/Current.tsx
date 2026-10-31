import Home from "./_Home";
import { Navbar } from "./_Navbar";
import { language } from "./_local";
import "./_group.css";

export default function Current() {
  return <>
    <aside className="ah-prototype">Current source / isolated preview — guest, no live data, account actions or bookings. Empty API stubs; no destination fixtures.</aside>
    <div className="ah-home ah-current" lang={language()}><Navbar/><Home/></div>
  </>;
}
