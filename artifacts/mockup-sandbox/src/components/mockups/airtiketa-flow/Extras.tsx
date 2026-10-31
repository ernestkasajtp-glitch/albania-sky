import { useEffect } from "react";
import { Payment } from "./Payment";
import { route } from "./_shared";

// Keep old preview links safe without restoring the removed step.
export function Extras(){
 useEffect(()=>{window.location.replace(route("Payment"))},[]);
 return <Payment/>;
}
