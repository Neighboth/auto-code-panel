import { randomBytes } from "node:crypto";

type Challenge = { token: string; challenge: string; expiresAt: number };

const challenges = new Map<string, Challenge>();

function cleanup() {
  if (challenges.size < 500) return;
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now > entry.expiresAt) challenges.delete(key);
  }
}

export function issueChallenge(id: string, ttlMs = 120_000): { challenge: string; tokenId: string } {
  cleanup();
  void id;
  const token = randomBytes(24).toString("base64url");
  const challenge = randomBytes(32).toString("base64url");
  challenges.set(token, { token, challenge, expiresAt: Date.now() + ttlMs });
  return { challenge, tokenId: token };
}

export function consumeChallenge(tokenId: string, challenge: string): boolean {
  const entry = challenges.get(tokenId);
  if (!entry) return false;
  challenges.delete(tokenId);
  if (Date.now() > entry.expiresAt) return false;
  return entry.challenge === challenge;
}

export type StoredPasskey = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorAttachment?: string;
    transports?: string[];
  };
  publicKey: {
    x5c?: string[];
    alg: number;
    crv?: string;
    kty: string;
    kid?: string;
  };
};

const subtle = globalThis.crypto.subtle;

function fromB64url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").buffer.slice(
    Buffer.from(padded, "base64").byteOffset,
    Buffer.from(padded, "base64").byteOffset + Buffer.from(padded, "base64").byteLength,
  );
}

/** Verifies a WebAuthn assertion (login) signature produced by a stored credential. */
export async function verifyAssertion(
  credential: StoredPasskey,
  clientDataJson: string,
  authData: string,
  signature: string,
): Promise<boolean> {
  try {
    const clientData = Buffer.from(clientDataJson);
    const authDataBuf = Buffer.from(authData, "base64url");
    if (authDataBuf.length < 37) return false;
    const flags = authDataBuf[32];
    if (!(flags & 0x01)) return false; // user presence required

    const data = Buffer.concat([authDataBuf, clientData]);
    const publicKey = credential.publicKey;
    if (publicKey.kty === "EC" && (publicKey.alg === -7 || publicKey.alg === -257)) {
      const key = await subtle.importKey(
        "spki",
        fromB64url(publicKey.x5c?.[0] ?? ""),
        { name: "ECDSA", namedCurve: publicKey.crv === "P-256" ? "P-256" : "P-384" },
        false,
        ["verify"],
      );
      return subtle.verify(
        "ECDSA",
        key,
        new Uint8Array(fromB64url(signature)),
        new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)),
      );
    }
    if (publicKey.kty === "RSA" && (publicKey.alg === -257 || publicKey.alg === -65535)) {
      const key = await subtle.importKey(
        "spki",
        fromB64url(publicKey.x5c?.[0] ?? ""),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      return subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        new Uint8Array(fromB64url(signature)),
        new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)),
      );
    }
    return false;
  } catch {
    return false;
  }
}
