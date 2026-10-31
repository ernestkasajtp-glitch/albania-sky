import type { DiscountCampaign } from "./discountCampaignMath";

export const OFFER_EMAIL_IMAGE = "https://albaniasky.com/booking-engine/images/offers/flight-offer.jpg";
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function offerDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("sq-AL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
export function offerEmailTemplate(c: DiscountCampaign) {
  const discount = `${c.value}${c.type === "percent" ? "%" : " €"}`;
  const deadline = `${offerDate(c.endsAt)}, ora ${c.endsAt.slice(11, 16)}`;
  const subject = `Albania Sky | ${discount} ulje — rezervoni deri më ${deadline}`.replace(/[\r\n]/g, " ");
  const periods = c.periods.map(p => `${offerDate(p.from)} – ${offerDate(p.to)}`).join("<br>");
  const scope = c.scope === "all" ? "" : c.scope === "route" ? `${c.fromAirport} → ${c.toAirport}` : "Për fluturime të zgjedhura";
  const cells = (label: string, value: string) => `<td style="padding:18px 12px;vertical-align:top;border-bottom:1px solid #dedbd5"><div style="font-size:11px;color:#74726e;margin-bottom:8px">${label}</div><strong style="font-size:15px;line-height:1.6">${value}</strong></td>`;
  const htmlBody = `<!doctype html><html lang="sq"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#ece9e5;font-family:Arial,sans-serif;color:#202932">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fffcf8">
<tr><td style="background:#171c22;padding:4px 32px;color:white"><table role="presentation" width="100%"><tr><td><img src="https://albaniasky.com/booking-engine/images/offers/logo.png" alt="Albania Sky" width="160" height="90" style="display:block;max-width:100%;object-fit:contain"></td><td align="right" style="font-size:10px">Për agjencitë<br>e udhëtimit</td></tr></table></td></tr>
<tr><td style="background:#c51936;padding:30px 32px;color:#fff9f3"><div style="font-size:13px;font-weight:bold">${escape(c.name)}</div><div style="font-size:60px;line-height:1.2;font-weight:bold;margin-top:18px">${escape(discount)} <span style="font-size:32px">ulje</span></div>${scope ? `<p style="margin-bottom:0">${escape(scope)}</p>` : ""}</td></tr>
<tr><td><img src="${OFFER_EMAIL_IMAGE}" alt="Pamje ilustruese udhëtimi mbi det" width="600" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cells("Periudha e udhëtimit", periods)}${cells("Rezervoni deri më", `<span style="color:#c51936">${deadline}</span>`)}</tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td align="center" bgcolor="#c51936" style="padding:18px"><a href="https://albaniasky.com/booking-engine/flights" style="font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">Shiko ofertën</a></td></tr></table></td></tr>
<tr><td style="padding:20px 32px;background:#f1eeea;font-size:12px"><strong>Albania Sky</strong></td></tr></table></td></tr></table></body></html>`;
  return { subject, htmlBody };
}
