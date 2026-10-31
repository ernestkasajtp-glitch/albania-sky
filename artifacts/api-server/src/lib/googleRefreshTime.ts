const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function isRefreshTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function localRefreshParts(date: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function nextDailyRefresh(time: string, now = new Date(), claimedDay?: string): Date {
  if (!isRefreshTime(time)) throw new Error("Invalid refresh time");
  const today = localRefreshParts(now);
  let previous = today;
  // Bounded scan handles both DST transitions without host-timezone dependence.
  for (let t = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
    t <= now.getTime() + 49 * 3600_000; t += 60_000) {
    const local = localRefreshParts(new Date(t));
    const alreadyDueToday = local.day === today.day && today.time >= time;
    const gap = time.startsWith("02:") && local.time === "03:00" && previous.time === "01:59";
    if (local.day !== claimedDay && !alreadyDueToday && (local.time === time || gap)) return new Date(t);
    previous = local;
  }
  throw new Error("Cannot determine next Google refresh");
}
