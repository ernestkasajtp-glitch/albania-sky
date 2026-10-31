import { z } from "zod";
import { FLIGHT_DISCOUNT_CHANNELS } from "@/lib/flightDiscount";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, "Datë e pavlefshme");
const wallTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine(v =>
  date.safeParse(v.slice(0, 10)).success && Number(v.slice(11, 13)) < 24 && Number(v.slice(14)) < 60,
  "Orë e pavlefshme");
export const campaignFields = z.object({
  name: z.string().trim().min(1, "Shkruaj emrin").max(120),
  enabled: z.boolean(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().finite().positive("Vlera duhet të jetë pozitive"),
  channels: z.array(z.enum(FLIGHT_DISCOUNT_CHANNELS)).min(1, "Zgjidh të paktën një kanal").refine(v => new Set(v).size === v.length),
  startsAt: wallTime,
  endsAt: wallTime,
  periods: z.array(z.object({ from: date, to: date })).min(1, "Shto të paktën një periudhë").max(24),
  scope: z.enum(["all", "route", "group", "flights"]),
  fromAirport: z.string().nullable(),
  toAirport: z.string().nullable(),
  groupId: z.number().int().positive().nullable(),
  flightIds: z.array(z.number().int().positive()).max(2000),
  priority: z.number().int().min(0).max(1000),
});
export const campaignSchema = campaignFields.extend({
  id: z.string().uuid(), version: z.number().int().nonnegative(), createdAt: z.string().datetime({ offset: true }),
  emailDelivery: z.object({
    total: z.number(), sent: z.number(), pending: z.number(), failed: z.number(), cancelled: z.number(), reason: z.string().nullable(),
  }).nullable().optional(),
});
export const editableCampaignSchema = campaignFields.superRefine((v, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (v.type === "percent" && v.value > 100) issue("value", "Përqindja nuk mund të kalojë 100");
  if (v.endsAt <= v.startsAt) issue("endsAt", "Mbarimi duhet të jetë pas fillimit");
  if (v.periods.some(p => p.from > p.to)) issue("periods", "Fillimi i periudhës duhet të jetë para ose i barabartë me mbarimin");
  if (v.scope === "route" && (!/^[A-Z]{3}$/.test(v.fromAirport ?? "") || !/^[A-Z]{3}$/.test(v.toAirport ?? ""))) issue("fromAirport", "Vendos të dy kodet IATA me 3 shkronja");
  if (v.scope === "route" && v.fromAirport === v.toAirport) issue("toAirport", "Mbërritja duhet të jetë ndryshe nga nisja");
  if (v.scope === "group" && !v.groupId) issue("groupId", "Zgjidh grupin");
  if (v.scope === "flights" && !v.flightIds.length) issue("flightIds", "Zgjidh të paktën një fluturim");
});
export const campaignListSchema = z.object({
  campaigns: z.array(campaignSchema),
  groups: z.array(z.object({ id: z.number().int(), name: z.string() })),
  flights: z.array(z.object({ id: z.number().int(), fromAirport: z.string(), toAirport: z.string(), flightNumber: z.string().nullable(), departureDate: z.string() })),
});
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignFields = z.infer<typeof campaignFields>;
export type CampaignList = z.infer<typeof campaignListSchema>;
export const discountQueryKey = ["discount-campaigns"] as const;
export function tiranaNow(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function campaignStatus(campaign: Campaign, now: string) {
  if (!campaign.enabled) return "disabled";
  if (now < campaign.startsAt) return "planned";
  if (now >= campaign.endsAt) return "expired";
  return "active";
}
export function editableFields(c: CampaignFields): CampaignFields {
  return { ...campaignFields.parse(c), fromAirport: c.scope === "route" ? c.fromAirport : null,
    toAirport: c.scope === "route" ? c.toAirport : null, groupId: c.scope === "group" ? c.groupId : null,
    flightIds: c.scope === "flights" ? c.flightIds : [] };
}
