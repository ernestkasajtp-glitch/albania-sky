// Kanal live (SSE) për panelin: rifreskon të dhënat e rezervimeve në moment
// dhe luan një zile + njoftim kur vjen NJË REZERVIM I RI.
// Pa polling — lidhje e vetme me /api/live/events (heartbeat çdo 25s nga serveri).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { matchesLiveTopics } from "@/lib/liveQueryScope";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

// ── Zilja (Web Audio, pa asnjë file) ────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Shfletuesit e bllokojnë audion pa ndërveprim — e zhbllokojmë në klikimin e parë.
if (typeof window !== "undefined") {
  const unlock = () => { ensureAudio(); window.removeEventListener("pointerdown", unlock); };
  window.addEventListener("pointerdown", unlock);
}

// Një notë e vetme: freq, kur nis (s), sa zgjat (s), vol, forma e valës
function tone(ctx: AudioContext, freq: number, at: number, dur = 0.6, vol = 0.25, type: OscillatorType = "sine") {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, now + at);
  gain.gain.linearRampToValueAtTime(vol, now + at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now + at);
  osc.stop(now + at + dur + 0.05);
}

// ── Llojet e zileve ─────────────────────────────────────────────────────────
export const BOOKING_CHIMES: Array<{ id: string; name: string; play: (ctx: AudioContext) => void }> = [
  {
    id: "dingdong", name: "Ding-Dong",
    play: ctx => { tone(ctx, 880, 0); tone(ctx, 1174.66, 0.18); },
  },
  {
    id: "bell", name: "Zile klasike",
    play: ctx => { for (let i = 0; i < 3; i++) tone(ctx, 1567.98, i * 0.22, 0.5, 0.22, "triangle"); },
  },
  {
    id: "trill", name: "Melodi ngjitëse",
    play: ctx => { tone(ctx, 659.25, 0, 0.3); tone(ctx, 783.99, 0.12, 0.3); tone(ctx, 987.77, 0.24, 0.35); tone(ctx, 1318.51, 0.36, 0.6); },
  },
  {
    id: "doorbell", name: "Zile dere",
    play: ctx => { tone(ctx, 987.77, 0, 0.9, 0.22); tone(ctx, 659.25, 0.35, 1.1, 0.22); },
  },
  {
    id: "alert", name: "Sinjal i fortë",
    play: ctx => { for (let i = 0; i < 2; i++) { tone(ctx, 1046.5, i * 0.3, 0.15, 0.3, "square"); tone(ctx, 1318.51, i * 0.3 + 0.12, 0.18, 0.3, "square"); } },
  },
  {
    id: "soft", name: "E butë",
    play: ctx => { tone(ctx, 523.25, 0, 1.2, 0.18); tone(ctx, 659.25, 0.05, 1.2, 0.14); tone(ctx, 783.99, 0.1, 1.2, 0.12); },
  },
  {
    id: "airport", name: "Porta e aeroportit",
    play: ctx => {
      // Two descending, softly resonant PA chimes; no speech or harsh alarm.
      for (const [frequency, start] of [[783.99, 0], [523.25, 0.48]]) {
        tone(ctx, frequency, start, 1.35, 0.18);
        tone(ctx, frequency * 2, start, 0.75, 0.035);
        tone(ctx, frequency * 3, start, 0.4, 0.012);
      }
    },
  },
];

const CHIME_LS_KEY = "booking_chime";

export function getBookingChimeId(): string {
  try {
    const v = localStorage.getItem(CHIME_LS_KEY);
    if (v && BOOKING_CHIMES.some(c => c.id === v)) return v;
  } catch { /* ignore */ }
  return "dingdong";
}

export function setBookingChimeId(id: string): void {
  try { localStorage.setItem(CHIME_LS_KEY, id); } catch { /* ignore */ }
}

// ── Zilja e njoftimeve të fluturimeve (ndryshe nga ajo e rezervimeve) ───────
// New default also applies to devices with a previously saved flight chime.
// Subsequent choices in Settings remain respected.
const FLIGHT_CHIME_LS_KEY = "flight_alert_chime_airport";

// Njoftimi me email "NEW BOOKING" — ndezur/fikur nga Settings (ruhet në pajisje)
const EMAIL_NOTIFY_KEY = "email_booking_notify";
export function getEmailNotifyEnabled(): boolean {
  try { return localStorage.getItem(EMAIL_NOTIFY_KEY) !== "off"; } catch { return true; }
}
export function setEmailNotifyEnabled(on: boolean): void {
  try { localStorage.setItem(EMAIL_NOTIFY_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

// Kërkimi automatik i çmimit live të Google kur hapet fluturimi/rezervimi (default: FIKUR)
const GOOGLE_LIVE_AUTO_KEY = "google_live_autofetch";
export function getGoogleLiveAutoEnabled(): boolean {
  try { return localStorage.getItem(GOOGLE_LIVE_AUTO_KEY) === "on"; } catch { return false; }
}
export function setGoogleLiveAutoEnabled(on: boolean): void {
  try { localStorage.setItem(GOOGLE_LIVE_AUTO_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

export function getFlightChimeId(): string {
  try {
    const v = localStorage.getItem(FLIGHT_CHIME_LS_KEY);
    if (v && BOOKING_CHIMES.some(c => c.id === v)) return v;
  } catch { /* ignore */ }
  return "airport";
}

export function setFlightChimeId(id: string): void {
  try { localStorage.setItem(FLIGHT_CHIME_LS_KEY, id); } catch { /* ignore */ }
}

export function playFlightAlertChime(id?: string): void {
  const ctx = ensureAudio();
  if (!ctx || ctx.state !== "running") return;
  const chime = BOOKING_CHIMES.find(c => c.id === (id || getFlightChimeId())) || BOOKING_CHIMES.find(c => c.id === "airport")!;
  chime.play(ctx);
}

// Luaj një zile specifike (për parapamje te cilësimet) ose atë të zgjedhurën.
export function playBookingChime(id?: string): void {
  const ctx = ensureAudio();
  if (!ctx || ctx.state !== "running") return;
  const chime = BOOKING_CHIMES.find(c => c.id === (id || getBookingChimeId())) || BOOKING_CHIMES[0];
  chime.play(ctx);
}

// ── Hook-u ──────────────────────────────────────────────────────────────────
export function useLiveUpdates(enabled: boolean): void {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let retryMs = 2000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let hadConnection = false;

    const invalidateTopics = (topics: string[]) => {
      const uniqueTopics = new Set(topics);
      queryClient.invalidateQueries({
        predicate: q => matchesLiveTopics(q.queryKey, uniqueTopics),
      });
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${API_BASE}/live/events`, { withCredentials: true });

      es.onopen = () => {
        retryMs = 2000;
        // Pas rikonektimit mund të kenë humbur ngjarje — rifresko një herë.
        if (hadConnection) {
          invalidateTopics(["enrollments", "booking_columns", "bookings", "flights", "discounts", "banners", "agents", "claims", "modules", "page_layouts", "newprice_progress", "tasks"]);
        } else invalidateTopics(["enrollments"]);
        hadConnection = true;
      };

      es.addEventListener("changed", (ev: MessageEvent) => {
        let topics: string[] = [];
        try {
          const value = JSON.parse(ev.data)?.topics;
          if (!Array.isArray(value)) return;
          topics = value.filter((topic): topic is string => typeof topic === "string");
        } catch { return; }
        invalidateTopics(topics);
        if (topics.includes("booking_new")) {
          playBookingChime();
          toastRef.current({
            title: "🔔 Rezervim i ri!",
            description: "Sapo erdhi një rezervim i ri.",
          });
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [queryClient, enabled]);
}
