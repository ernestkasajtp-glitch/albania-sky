/** Both legs are present in new alerts, including unchanged clocks/date-only changes. */
export function parseGoogleScheduleAlert(detail: string) {
  const dep = detail.match(/Nisja\s+\S+\s+\d{1,2}:\d{2}\s*(?:→|->)\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/i);
  const arr = detail.match(/Mbërritja\s+\S+\s+\d{1,2}:\d{2}\s*(?:→|->)\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/i);
  if (!dep || !arr) return null;
  return { departureDate: dep[1], departureTime: dep[2], arrivalDate: arr[1], arrivalTime: arr[2] };
}
