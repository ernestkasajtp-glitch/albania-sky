import { sendEmail } from "./gmail.js";

// Etiketat shqip për rolet e përdoruesve.
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Menaxher",
  agent_staff: "Staf",
  agent: "Agjent (B2B)",
  client: "Klient",
};

export interface LoginNotifyInfo {
  name: string;
  email: string;
  role: string;
  source: "be" | "fms"; // be = faqja e jashtme (booking-engine), fms = menaxhimi i brendshëm
  ip: string;
  userAgent?: string | null;
  company?: string | null;
  isRegistration?: boolean; // true = llogari e re (regjistrim + hyrje automatike)
  verifiedIp?: boolean; // hyrje FMS me kod 60-sekondësh nga IP e bllokuar
}

// Escape HTML — fushat vijnë nga input i përdoruesit (name/company/user-agent),
// prandaj duhen escape-uar që të mos injektohet HTML në email.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Dërgon email njoftimi te NOTIFY_EMAIL për ÇDO hyrje të suksesshme në sistem
// (si nga faqja e jashtme ashtu edhe nga menaxhimi i brendshëm), me IP-në dhe
// të dhënat e përdoruesit. Fire-and-forget — nuk e vonon kurrë përgjigjen e login-it.
export function sendLoginNotifyEmail(info: LoginNotifyInfo): void {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;

  const roleLabel = ROLE_LABELS[info.role] ?? info.role;
  const sourceLabel =
    info.source === "fms"
      ? "Faqja e Brendshme (Menaxhimi)"
      : "Faqja e Jashtme (Booking)";
  // Data si më parë; ora shfaqet 12-orëshe me AM/PM (vetëm paraqitje).
  const nowD = new Date();
  const now = `${nowD.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane" })}, ${nowD.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true })}`;
  const ua = esc((info.userAgent ?? "").slice(0, 300)) || "e panjohur";
  const name = esc(info.name);
  const email = esc(info.email);
  const company = info.company ? esc(info.company) : null;
  const verb = info.isRegistration
    ? "krijoi llogari të re dhe u autentikua"
    : "u autentikua";
  const subjectPrefix = info.isRegistration ? "Regjistrim i ri" : info.verifiedIp ? "Hyrje me verifikim" : "Hyrje në sistem";

  const html = `
    <p>Përdoruesi <strong>${name}</strong> (<code>${email}</code>) ${verb} në FMS Pro.</p>
    <ul>
      <li><strong>Faqja:</strong> ${sourceLabel}</li>
      <li><strong>Roli:</strong> ${roleLabel}</li>
      ${company ? `<li><strong>Kompania/Agjencia:</strong> ${company}</li>` : ""}
      <li><strong>Ora:</strong> ${now}</li>
      <li><strong>IP:</strong> ${esc(info.ip)}</li>
      ${info.verifiedIp ? "<li><strong>Verifikimi:</strong> Kod njëpërdorimësh; IP-ja mbetet e bllokuar</li>" : ""}
      <li><strong>Pajisja:</strong> ${ua}</li>
    </ul>
    <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
  `;

  sendEmail(
    notifyTo,
    `${subjectPrefix}: ${info.name} (${roleLabel}) — ${sourceLabel}`,
    html
  ).catch(() => {});
}
