import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const PREFIX = "enc:v1:";
const KEY = createHash("sha256").update(`${env.dataKey}::keyrail-data-encryption-v1`).digest();

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** AES-256-GCM encryption for account credentials and 2FA secrets at rest. */
export function encryptData(plaintext: string): string {
  if (!plaintext) return "";
  if (isEncrypted(plaintext)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function decryptData(value: string | null | undefined): string {
  if (!value) return "";
  if (!isEncrypted(value)) return value; // legacy plaintext row, transparently readable
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskData(value: string | null | undefined): string {
  const plain = decryptData(value);
  if (!plain) return "—";
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, plain.length - 4))}${plain.slice(-4)}`;
}
