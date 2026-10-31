import { db, publicEnrollmentsTable, bookingUsersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmailStrict } from "./gmail.js";
import { notifyDataChanged } from "./liveEvents.js";

export async function getPublicEnrollment(userId: number) {
  const [row] = await db.select().from(publicEnrollmentsTable).where(eq(publicEnrollmentsTable.userId, userId));
  return row;
}
export async function pendingApproval(userId: number): Promise<boolean> {
  const row = await getPublicEnrollment(userId);
  return !!row && (!row.approvedAt || !row.groupId);
}
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// A durable compare-and-set claims a send exactly once across workers. Unknown
// SMTP outcomes are NOT automatically retried: delivery may already have happened.
export async function sendEnrollmentEmail(userId: number, kind: "notification" | "activation") {
  const statusColumn = kind === "activation" ? publicEnrollmentsTable.activationStatus : publicEnrollmentsTable.notificationStatus;
  const statusKey = kind === "activation" ? "activationStatus" : "notificationStatus";
  const errorKey = kind === "activation" ? "activationError" : "notificationError";
  const enrollment = await getPublicEnrollment(userId);
  if (!enrollment) throw new Error("Regjistrimi nuk ekziston");
  if (kind === "activation" && !enrollment.approvedAt) throw new Error("Llogaria nuk është miratuar");
  const [claim] = await db.update(publicEnrollmentsTable).set({ [statusKey]: "sending", [errorKey]: null })
    .where(and(eq(publicEnrollmentsTable.userId, userId), inArray(statusColumn, ["pending", "failed"]))).returning();
  if (!claim) {
    const latest = await getPublicEnrollment(userId);
    return { emailStatus: latest![statusKey], emailError: latest![errorKey] };
  }
  let emailStatus = "sent", emailError: string | null = null;
  let attempted = false;
  try {
    const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
    if (!user) throw new Error("Përdoruesi nuk ekziston");
    const to = kind === "notification" ? process.env.NOTIFY_EMAIL : user.email;
    if (!to) throw new Error("NOTIFY_EMAIL nuk është konfiguruar");
    // The existing transport checks SMTP configuration and throws in strict mode.
    const base = process.env.FMS_PUBLIC_BASE_URL;
    if (kind === "notification" && !base) throw new Error("FMS_PUBLIC_BASE_URL nuk është konfiguruar");
    const link = base ? `${base.replace(/\/+$/, "")}/agents?pending=1` : "";
    const html = kind === "notification"
      ? `<p>Regjistrim në pritje të miratimit.</p><p>${esc(user.name)} — ${user.role === "agent" ? "Agjent" : "Klient"}</p><p>${esc(user.email)}</p><p>${esc(user.company || "")}</p><p>${esc(enrollment.createdAt.toISOString())}</p><a href="${esc(link)}">Shiko dhe aprovo</a><p>Kërkohet hyrja si administrator dhe caktimi i grupit.</p>`
      : `<p>Përshëndetje ${esc(user.name)},</p><p>Llogaria juaj u aktivizua. Mund të hyni në Booking Engine.</p>`;
    attempted = true;
    await sendEmailStrict(to, kind === "notification" ? "Regjistrim në pritje të miratimit" : "Llogaria juaj u aktivizua", html);
  } catch (error) {
    // Explicit pre-delivery rejection/config failures can safely be retried.
    const e = error as { code?: string; message?: string };
    const safeRetry = !attempted || ["EAUTH", "ECONNECTION", "ENOTFOUND", "ECONNREFUSED", "EENVELOPE"].includes(e.code || "") || /SMTP.*(not configured|mungon|missing)|not configured/i.test(e.message || "");
    emailStatus = safeRetry ? "failed" : "unknown";
    emailError = safeRetry ? "Emaili nuk u dërgua. Kontrolloni konfigurimin dhe riprovoni." : "Dorëzimi është i pasigurt; kontrolloni serverin e emailit para ridërgimit.";
  }
  await db.update(publicEnrollmentsTable).set({ [statusKey]: emailStatus, [errorKey]: emailError }).where(eq(publicEnrollmentsTable.userId, userId));
  notifyDataChanged("enrollments");
  return { emailStatus, emailError };
}