import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const derived = scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pick(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Human friendly redeem code, e.g. KEYR-8FA2K-P4M7Q. */
export function generateRedeemCode(): string {
  return `KEYR-${pick(5)}-${pick(5)}`;
}

/** Reseller activation key, e.g. BAYI-7K2M-9PQR-6TZX. */
export function generateResellerKey(): string {
  return `BAYI-${pick(4)}-${pick(4)}-${pick(4)}`;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
