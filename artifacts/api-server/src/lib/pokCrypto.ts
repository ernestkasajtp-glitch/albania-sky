import crypto from "node:crypto";

const ENVELOPE_VERSION = "v1";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for POK credential encryption");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptPokSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPokSecret(envelope: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Invalid POK credential envelope");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}
