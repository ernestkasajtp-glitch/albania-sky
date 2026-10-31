import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import Flights from "@/pages/Flights";
import Home from "@/pages/Home";
import "@/styles/airline-home.css";
import "@/styles/airline-home-sky.css";
import BookFlight from "@/pages/BookFlight";
import MyBookings from "@/pages/MyBookings";
import BookingDetail from "@/pages/BookingDetail";
import "@/styles/airline-pages.css";

const AirlineFlights = () => <Flights airline />;
const AirlineHome = () => <Home airline />;
const AirlineBooking = () => <BookFlight airline />;
export const EXTERNAL_PAGE_VARIANTS = {
  home: { current: Home, canvas: AirlineHome },
  flights: { current: Flights, canvas: AirlineFlights },
  book_flight: { current: BookFlight, canvas: AirlineBooking },
  my_bookings: { current: MyBookings },
  booking_detail: { current: BookingDetail },
} as const;
export type ExternalPage = keyof typeof EXTERNAL_PAGE_VARIANTS;
type Selection = Partial<Record<ExternalPage, string>>;
const LayoutContext = createContext<{selection:Selection; loading:boolean; error:boolean}>({selection:{},loading:true,error:false});

/** One small public configuration request per app load, shared by navigation and routes. No polling. */
export function ExternalLayoutsProvider({children}:{children:ReactNode}) {
  const [state,setState]=useState({selection:{} as Selection,loading:true,error:false});
  useEffect(()=>{
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 3000);
    let active=true;
    fetch(`${api.base}/page-layouts`, {credentials:"include",signal:controller.signal})
      .then(async response=>{
        if(!response.ok) throw new Error("Layout configuration unavailable");
        const body=await response.json();
        if(!Array.isArray(body.layouts)) throw new Error("Invalid layout configuration");
        const selection:Selection={};
        for(const entry of body.layouts) {
          if(entry.scope==="external" && Object.hasOwn(EXTERNAL_PAGE_VARIANTS,entry.page)) {
            selection[entry.page as ExternalPage]=entry.variant;
          }
        }
        if(active)setState({selection,loading:false,error:false});
      }).catch(()=>{if(active)setState({selection:{},loading:false,error:true});})
      .finally(()=>clearTimeout(timeout));
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[]);
  return <LayoutContext.Provider value={state}>{children}</LayoutContext.Provider>;
}
export function useAirlineLayout(path:string) {
  const {selection}=useContext(LayoutContext);
  const page=path==="/"?"home":path==="/flights"?"flights":/^\/flights\/[^/]+$/.test(path)?"book_flight":null;
  return !!page && selection[page]==="canvas";
}
export function externalPageComponent(page:ExternalPage):ComponentType {
  return function SelectedExternalPage() {
    const {selection,loading,error}=useContext(LayoutContext);
    const {t}=useTranslation();
    if((page==="home"||page==="flights"||page==="book_flight")&&loading) return <p className="p-10 text-center">{t("Duke ngarkuar...")}</p>;
    const variants=EXTERNAL_PAGE_VARIANTS[page] as Record<string,ComponentType>;
    const Page=variants[selection[page]||"current"]||variants.current;
    return <>{error&&(page==="home"||page==="flights"||page==="book_flight")&&<p role="alert" className="p-3 text-center text-sm text-red-700">{t("Konfigurimi i pamjes nuk u ngarkua. Po shfaqet pamja aktuale.")}</p>}<Page/></>;
  };
}
