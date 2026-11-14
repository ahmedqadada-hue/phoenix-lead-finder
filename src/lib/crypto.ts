import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw = (process.env.ENCRYPTION_KEY ?? "").trim();
  // Preferred: 64 hex characters (openssl rand -hex 32).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  // Also accepted: any passphrase of 32+ characters, turned into a 256-bit key.
  if (raw.length >= 32) return createHash("sha256").update(raw, "utf8").digest();
  throw new Error("ENCRYPTION_KEY is missing or too short. Use 64 hex characters, or any random text of at least 32 characters.");
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Unrecognised secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export function keyHint(plain: string): string {
  return plain.length > 8 ? `••••${plain.slice(-4)}` : "••••";
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
