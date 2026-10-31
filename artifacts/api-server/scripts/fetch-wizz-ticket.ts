// Skript një-përdorimësh: kërko biletën Wizz në email për një rezervim të dhënë.
// Përdorimi (në VPS, te /root/artifacts/api-server):
//   node --env-file=./.env dist-scripts/fetch-wizz-ticket.mjs   (BOOKING_ID=1236)
import { fetchWizzTicketForBooking } from "../src/lib/wizzTicket.js";

const id = Number(process.env.BOOKING_ID || process.argv[2]);
if (!id || isNaN(id)) {
  console.error("Jep BOOKING_ID (env ose argument)");
  process.exit(1);
}

const result = await fetchWizzTicketForBooking(id);
console.log(JSON.stringify(result, null, 2));
process.exit(result.found ? 0 : 2);
