import { Passengers } from "./Passengers";

// The current portal has no separate card-entry/review page: Pay and Book
// creates a booking then redirects to POK. Keep this existing Canvas URL
// as the same source form at the inactive external-provider boundary.
export function Payment(){
 return <Passengers providerBoundary/>;
}
