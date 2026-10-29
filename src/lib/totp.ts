import { authenticator } from "otplib";
import { generateAuthCode } from "steam-totp";

authenticator.options = { window: 1 };

/**
 * Steam Guard codes are NOT RFC-6238 TOTP codes. Steam derives a 5 character
 * code from HMAC-SHA1(shared_secret, floor(time / 30)) and maps the digest onto
 * Steam's own 26 character alphabet. `steam-totp` implements that algorithm,
 * while Google Authenticator style 2FA uses the RFC-6238 6 digit TOTP flow.
 */
export type GeneratedCode = {
  code: string;
  kind: "steam" | "totp";
  digits: number;
  periodSeconds: number;
  secondsRemaining: number;
  generatedAt: string;
};

export function generateTotpCode(secret: string): string {
  const normalized = secret.replace(/\s+/g, "").toUpperCase();
  return authenticator.generate(normalized);
}

export function generateSteamGuardCode(sharedSecret: string): string {
  const normalized = sharedSecret.replace(/\s+/g, "");
  return generateAuthCode(normalized);
}

export function secondsRemaining(now = Date.now()): number {
  const period = 30_000;
  return Math.ceil((period - (now % period)) / 1000);
}

export function isValidTotpSecret(secret: string): boolean {
  try {
    generateTotpCode(secret);
    return true;
  } catch {
    return false;
  }
}

export function isValidSteamSecret(secret: string): boolean {
  try {
    // steam-totp expects a base64 shared_secret; guard against malformed input.
    return generateSteamGuardCode(secret).length === 5;
  } catch {
    return false;
  }
}
