import { env } from "@/lib/env";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * The platform owner (super admin) authenticates from the same unified login
 * form as store managers. To keep the two roles strictly separated, an owner
 * identifier can never be used by a tenant admin account.
 */
export const RESERVED_MANAGER_IDENTIFIERS = new Set([
  "admin",
  "superadmin",
  "super-admin",
  "root",
  "owner",
  "system",
  "support",
  "yonetici",
  "sahip",
]);

export function ownerIdentifiers(): string[] {
  return [env.superAdminUsername, env.superAdminEmail]
    .filter(Boolean)
    .map((value) => value.trim().toLowerCase());
}

export function isOwnerIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ownerIdentifiers().includes(normalized);
}

/**
 * Returns an error message when a store admin identifier collides with the
 * platform owner, otherwise null. Usernames are globally unique in the system,
 * so this check has to run on every create/update path.
 */
export async function managerIdentifierError(username: string, email?: string): Promise<string | null> {
  const t = createTranslator("tr");
  const usernameValue = username.trim().toLowerCase();
  const emailValue = (email ?? "").trim().toLowerCase();
  if (RESERVED_MANAGER_IDENTIFIERS.has(usernameValue)) {
    return t("x.name-platform-yoneticisine-ayrlms-bir-kullanc-addr-lutfe", { name: username.trim() });
  }
  if (isOwnerIdentifier(usernameValue)) {
    return t("x.bu-kullanc-ad-platform-sahibine-ait-magaza-yoneticisi-ic");
  }
  if (emailValue && isOwnerIdentifier(emailValue)) {
    return t("x.bu-e-posta-platform-sahibine-ait-magaza-yoneticisi-icin");
  }
  return null;
}

/** Store admins can never be suspended individually; only the store itself can. */
export function adminStatusIsActive(status: string): boolean {
  return status !== "banned";
}
