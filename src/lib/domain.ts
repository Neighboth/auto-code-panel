import { createHash } from "node:crypto";

const DOMAIN_RE =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Accepts a hostname or a pasted URL and returns a bare lowercase domain.
 * `https://www.Magaza.com/foo` -> `magaza.com`
 */
export function normalizeDomain(value: string): string {
  let host = String(value ?? "").trim().toLowerCase();
  if (!host) return "";

  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  host = host.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  host = host.split("@").pop() ?? host;
  host = host.replace(/:\d+$/, "");
  host = host.replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/** Same normalization used for the incoming Host header (also strips a port). */
export function normalizeHost(value: string): string {
  const first = String(value ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "";
  return normalizeDomain(first);
}

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  if (domain === "localhost" || domain.endsWith(".localhost")) return false;
  if (IPV4_RE.test(domain) || domain.startsWith("[") || domain.includes(":")) return false;
  return DOMAIN_RE.test(domain);
}

/** Deterministic DNS TXT verification value for a store/domain pair. */
export function domainVerificationToken(storeId: number, domain: string): string {
  const digest = createHash("sha256")
    .update(`pixguard-domain:${storeId}:${domain}`)
    .digest("hex");
  return `pixguard-site-verification=${digest.slice(0, 40)}`;
}

export function domainTxtRecordName(domain: string): string {
  return `_pixguard.${domain}`;
}

export function storeUsesHost(
  store: { customDomain: string | null; customDomainVerifiedAt: Date | null },
  host: string,
): boolean {
  if (!store.customDomain || !store.customDomainVerifiedAt) return false;
  return normalizeHost(host) === normalizeDomain(store.customDomain);
}
