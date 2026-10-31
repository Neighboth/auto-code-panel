import { decryptData, encryptData } from "@/lib/secret-crypto";

/**
 * Recovery vault for panel passwords.
 *
 * Sign-in still verifies against the bcrypt hash — that never changes. But a
 * hash cannot be shown back to anyone, and a store owner who loses their
 * manager password has no "show me" option. So whenever a password is created or
 * changed, an AES-256-GCM copy is stored next to the hash. Only the platform
 * owner can read it (super-admin panel, audited); store admins and customers
 * can never retrieve it.
 *
 * Legacy rows have no copy (`""`), and the panel offers "set a new password"
 * instead of pretending to know it.
 */
export function rememberPassword(plain: string): string {
  const value = (plain ?? "").trim();
  return value ? encryptData(value) : "";
}

export function revealPassword(enc: string | null | undefined): string | null {
  const value = decryptData(enc ?? "");
  return value ? value : null;
}
