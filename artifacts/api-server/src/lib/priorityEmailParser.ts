import { convert } from "html-to-text";

/** MIME alternatives are not necessarily equivalent: the text part can omit extras.
 * Never concatenate them (which could attach one booking's fields to another).
 * Conversion is local text extraction only; HTML is never executed or fetched.
 */
export function priorityEmailText(mail: { text?: string; html?: string | false }): string {
  if (typeof mail.html === "string" && mail.html) {
    const htmlText = convert(mail.html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "td", format: "block", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: "th", format: "block", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      ],
      limits: { maxInputLength: 15 * 1024 * 1024 },
    });
    if (parsePriorityEmail(htmlText)) return htmlText;
  }
  return mail.text || "";
}

/** Read only the cabin section, never hold luggage or the dimensions' numbers. */
export function parsePriorityEmail(text: string) {
  const field = (label: string) => text.match(new RegExp(`${label}\\s*\\n+\\s*([^\\n]+)`, "i"))?.[1]?.trim();
  const bookingId = field("Booking ID");
  const reference = field("PNR Reference");
  if (!bookingId || !/^\d+$/.test(bookingId) || !reference) return null;
  const section = text.match(/\bCabin luggage\b([\s\S]*?)(?=\bLuggage in the hold\b|\b\d+\s+passenger|\bBooking details\b|$)/i)?.[1];
  if (!section) return null;
  const items = [...section.matchAll(/(?:€\s*([\d.,]+)|([\d.,]+)\s*€)\s*[–—-]?\s*\(\s*[×x]\s*(\d+)\s*\)/gi)]
    .map(m => ({ price: (m[1] || m[2]).trim(), quantity: Number(m[3]) })).filter(m => m.quantity > 0);
  if (!items.length) return null;
  return { bookingId, reference, flight: field("Flight Number") || "", date: field("Date and schedule") || "",
    from: field("From") || "", to: field("To") || "", items };
}
