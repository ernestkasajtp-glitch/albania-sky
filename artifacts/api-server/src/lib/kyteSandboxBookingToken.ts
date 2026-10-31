import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const TOKEN_VERSION = 1;
const TOKEN_AAD = Buffer.from("kyte-sandbox-booking-token-v1");
const TOKEN_SECRET_MIN_LENGTH = 32;

export type KyteSandboxBookingPassengerBinding = {
  id: string;
  type: string;
};

export type KyteSandboxBookingTokenPayload = {
  version: 1;
  userId: number;
  sessionFingerprint: string;
  offerId: string;
  transactionId: string;
  passengers: KyteSandboxBookingPassengerBinding[];
  priceMinor: number;
  currencyCode: string;
  currencyDecimals: number;
  expiresAt: string;
};

function tokenKey(secret: string): Buffer {
  return createHash("sha256")
    .update("kyte-sandbox-booking-key-v1\0")
    .update(secret, "utf8")
    .digest();
}

function validPayload(value: unknown): value is KyteSandboxBookingTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (payload.version !== TOKEN_VERSION ||
      !Number.isSafeInteger(payload.userId) || (payload.userId as number) <= 0 ||
      typeof payload.sessionFingerprint !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(payload.sessionFingerprint) ||
      typeof payload.offerId !== "string" || payload.offerId.length === 0 || payload.offerId.length > 256 ||
      typeof payload.transactionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.transactionId) ||
      !Array.isArray(payload.passengers) || payload.passengers.length < 1 || payload.passengers.length > 9 ||
      !Number.isSafeInteger(payload.priceMinor) || (payload.priceMinor as number) < 0 ||
      typeof payload.currencyCode !== "string" || !/^[A-Z]{3}$/.test(payload.currencyCode) ||
      !Number.isInteger(payload.currencyDecimals) || (payload.currencyDecimals as number) < 0 ||
      (payload.currencyDecimals as number) > 6 ||
      typeof payload.expiresAt !== "string" || !Number.isFinite(Date.parse(payload.expiresAt))) {
    return false;
  }
  const passengerIds = new Set<string>();
  return payload.passengers.every((passenger) => {
    if (!passenger || typeof passenger !== "object" || Array.isArray(passenger)) return false;
    const binding = passenger as Record<string, unknown>;
    if (typeof binding.id !== "string" || binding.id.length === 0 || binding.id.length > 256 ||
        typeof binding.type !== "string" || binding.type.length === 0 || binding.type.length > 64 ||
        passengerIds.has(binding.id)) {
      return false;
    }
    passengerIds.add(binding.id);
    return true;
  });
}

export function kyteSandboxSessionFingerprint(sessionId: string, secret: string): string {
  if (!sessionId || secret.length < TOKEN_SECRET_MIN_LENGTH) {
    throw new Error("A valid session and signing material are required");
  }
  return createHmac("sha256", tokenKey(secret))
    .update("kyte-sandbox-session-v1\0")
    .update(sessionId)
    .digest("base64url");
}

export function sealKyteSandboxBookingToken(
  payload: KyteSandboxBookingTokenPayload,
  secret = process.env.SESSION_SECRET,
): string {
  if (!secret || secret.length < TOKEN_SECRET_MIN_LENGTH) {
    throw new Error("SESSION_SECRET must contain at least 32 characters to sign Kyte Sandbox booking tokens");
  }
  if (!validPayload(payload)) throw new Error("Invalid Kyte Sandbox booking token payload");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openKyteSandboxBookingToken(
  token: unknown,
  secret = process.env.SESSION_SECRET,
): KyteSandboxBookingTokenPayload | null {
  if (!secret || secret.length < TOKEN_SECRET_MIN_LENGTH ||
      typeof token !== "string" || token.length > 16_384) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3 ||
      parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }

  try {
    const [encodedIv, encodedTag, encodedCiphertext] = parts;
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", tokenKey(secret), iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload: unknown = JSON.parse(plaintext);
    if (!validPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}
