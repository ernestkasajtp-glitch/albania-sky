import { parseFlightDiscountChannels, sameChannelSet, type FlightDiscount, type FlightDiscountInput } from "./flightDiscount.ts";

// Same sibling API routing as FlightSidePanel: /flight-system/ -> /api/.
export function flightDiscountUrl(baseUrl: string, flightId: number) {
  return `${baseUrl.replace(/\/$/, "")}/../api/flights/${flightId}/discount`;
}

export async function readSavedFlightDiscount(
  res: Response, requested: FlightDiscountInput | null,
): Promise<FlightDiscount | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Ruajtja nuk u konfirmua: serveri nuk ktheu përgjigje JSON. Rifresko faqen dhe provo përsëri.");
  }
  let body: any;
  try { body = await res.json(); }
  catch { throw new Error("Ruajtja nuk u konfirmua: përgjigje e pavlefshme nga serveri."); }
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Ruajtja dështoi (${res.status}).`);
  if (!body || typeof body !== "object" || !Object.hasOwn(body, "flightDiscount")) {
    throw new Error("Ruajtja nuk u konfirmua: mungon rezultati i discount-it.");
  }
  const raw = body.flightDiscount;
  if (requested !== null && requested.channels.length === 0) throw new Error("Zgjidh të paktën një kanal");
  let saved: FlightDiscount | null = null;
  if (raw !== null) {
    const channels = raw && typeof raw === "object" ? parseFlightDiscountChannels(raw.channels) : null;
    if (!channels) throw new Error("Ruajtja nuk u konfirmua: kanalet e ruajtura janë të pavlefshme.");
    saved = { type: raw.type, value: raw.value, channels };
  }
  if (requested === null ? raw !== null :
    !saved || saved.type !== requested.type || saved.value !== requested.value ||
    !sameChannelSet(saved.channels, requested.channels)) {
    throw new Error("Ruajtja nuk u konfirmua: rezultati nuk përputhet me uljen e kërkuar.");
  }
  return saved;
}
