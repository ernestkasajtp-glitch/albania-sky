// Kanal live (SSE) për panelin e adminit: kur ndryshon një rezervim/pagesë/
// pasagjer, serveri njofton menjëherë të gjithë klientët e lidhur, që lista
// të rifreskohet në moment — pa polling të vazhdueshëm.
//
// NUK prek API-n e partnerit (/v1/*) as booking-engine — vetëm FMS admin.
import type { Response } from "express";

const clients = new Map<Response, string>();
let bookingReadRevision = 0;
export function getBookingReadRevision(): number { return bookingReadRevision; }

// Debounce 300ms: shumë shkrime brenda një kërkese (booking + pagesa + pax)
// bëhen NJË njoftim i vetëm.
const pendingTopics = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

export function addLiveClient(res: Response, ip: string): void {
  clients.set(res, ip);
  res.on("close", () => {
    clients.delete(res);
  });
}

export function closeLiveClientsByIp(ip: string): void {
  for (const [res, clientIp] of clients) {
    if (clientIp === ip) {
      clients.delete(res);
      res.end();
    }
  }
}

export function liveClientCount(): number {
  return clients.size;
}

function broadcast(payload: string): void {
  for (const res of clients.keys()) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function notifyDataChanged(topic: string): void {
  if (["bookings", "booking_new", "flights", "agents"].includes(topic)) bookingReadRevision++;
  pendingTopics.add(topic);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const topics = [...pendingTopics];
    pendingTopics.clear();
    if (clients.size === 0) return;
    broadcast(`event: changed\ndata: ${JSON.stringify({ topics })}\n\n`);
  }, 300);
}

// Heartbeat çdo 25s që proxy-t (Apache) të mos e mbyllin lidhjen si të vdekur.
setInterval(() => {
  if (clients.size > 0) broadcast(`: hb\n\n`);
}, 25_000).unref();
