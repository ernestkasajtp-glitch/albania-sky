import { activityPath } from "./agentActivityEvent";

export function activityPage(raw: string): string {
  const path = activityPath(raw).split("?")[0].replace(/^\/booking-engine/, "") || "/";
  const ref = path.match(/\/my-bookings\/(KTF\d+)/)?.[1];
  if (ref) return `Detajet e rezervimit ${ref}`;
  if (/^\/(?:book|flights)\/\d+/.test(path)) return `Formulari i rezervimit · fluturimi #${path.split("/")[2]}`;
  const pages: Record<string, string> = {
    "/": "Faqja kryesore", "/flights": "Kërkimi i fluturimeve",
    "/my-bookings": "Rezervimet e mia", "/login": "Hyrja në llogari",
    "/register": "Regjistrimi", "/payment-return": "Kthimi nga pagesa",
  };
  return pages[path] ?? path;
}

// Strictly allowlisted response facts; never keep the response body/payer data.
export function activityResponse(path: string, body: any): string {
  if (/^\/public\/flights$/.test(path) && Array.isArray(body)) return `${body.length} fluturime në përgjigje`;
  if (/\/pok-initiate$/.test(path) && typeof body?.confirmUrl === "string")
    return body.reused === true ? "U kthye linku ekzistues i pagesës (jo konfirmim pagese)" : "U krijua linku i pagesës (jo konfirmim pagese)";
  if (/\/pok-initiate$/.test(path) && typeof body?.error === "string") {
    if (/rezultat të panjohur|nuk u verifikua|nuk konfirmoi/.test(body.error)) return "Statusi i porosisë te POK është i paqartë; riprovimi u bllokua për siguri";
    if (/kryer tashmë|already paid/i.test(body.error)) return "Rezervimi është paguar tashmë";
    if (/kontroll manual|shqyrtim manual|verifikim manual/.test(body.error)) return "Kërkohet kontroll manual i porosisë së mëparshme";
    if (/nuk është konfiguruar/.test(body.error)) return "Ofruesi i pagesës nuk është konfiguruar";
  }
  if (path === "/public/bookings" && /^KTF\d+$/.test(body?.bookingRef ?? ""))
    return `Rezervimi ${body.bookingRef}`;
  return "";
}

export function activityApiDescription(method: string, raw: string, status: number, detail = ""): string {
  const safe = activityPath(raw);
  const path = safe.split("?")[0];
  const query = new URL(safe, "https://activity.invalid").searchParams;
  const ref = path.match(/\/(?:my-bookings|bookings)\/(KTF\d+)/)?.[1];
  const booking = ref ? ` · ${ref}` : "";
  let operation = "Kërkesë e sistemit";
  if (/\/pok-initiate$/.test(path)) operation = `Hapja e pagesës me kartë${booking}`;
  else if (/\/pok-verify$/.test(path)) operation = `Verifikimi i pagesës${booking}`;
  else if (/\/invoices\/.*\/pdf$/.test(path)) operation = `Shkarkimi i faturës${booking}`;
  else if (/\/(?:pdf|ticket)$/.test(path)) operation = `Shkarkimi i biletës${booking}`;
  else if (/\/invoices$/.test(path)) operation = `Ngarkimi i faturave${booking}`;
  else if (path === "/public/bookings" && method === "POST") operation = "Krijimi i rezervimit";
  else if (ref) operation = `Ngarkimi i rezervimit${booking}`;
  else if (path === "/public/my-bookings") operation = "Ngarkimi i listës së rezervimeve";
  else if (path === "/public/flight-dates") operation = "Ngarkimi automatik i kalendarit";
  else if (path === "/public/flights") operation = "Ngarkimi i rezultateve të fluturimeve";
  else if (/^\/public\/flights\/\d+$/.test(path)) operation = `Ngarkimi i fluturimit #${path.split("/").pop()}`;
  else if (path === "/public/airports") operation = "Ngarkimi i aeroporteve";
  else if (path === "/public/routes") operation = "Ngarkimi i destinacioneve";
  else if (path === "/auth/logout") operation = "Dalja nga llogaria";
  else operation += ` · ${method} ${path}`;
  const from = query.get("from"), to = query.get("to"), date = query.get("date");
  if (from || to) operation += ` · ${from || "Të gjitha nisjet"} → ${to || "Të gjitha mbërritjet"}`;
  if (date) operation += ` · ${date}`;
  const outcome = status < 400 ? (status === 304 ? "Pa ndryshime në të dhëna" : "Kërkesa përfundoi") :
    status === 401 ? "Sesioni ka skaduar / kërkohet hyrje" :
    status === 403 ? "Aksesi u refuzua" :
    status === 404 ? "Nuk u gjet" :
    status === 409 ? "Veprimi u bllokua nga kontrolli i sigurisë" :
    status === 429 ? "Shumë kërkesa; provoni më vonë" :
    status >= 500 ? "Kërkesa dështoi në server ose te ofruesi" : "Kërkesa nuk u pranua";
  return `Sistemi (jo klikim): ${operation} · ${outcome} [${status}]${detail ? ` · ${detail}` : ""}`;
}
