import { env } from "@/lib/env";

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
export function managerIdentifierError(username: string, email?: string): string | null {
  const usernameValue = username.trim().toLowerCase();
  const emailValue = (email ?? "").trim().toLowerCase();
  if (RESERVED_MANAGER_IDENTIFIERS.has(usernameValue)) {
    return `"${username.trim()}" platform yöneticisine ayrılmış bir kullanıcı adıdır. Lütfen farklı bir yönetici adı seçin.`;
  }
  if (isOwnerIdentifier(usernameValue)) {
    return "Bu kullanıcı adı platform sahibine ait. Mağaza yöneticisi için farklı bir ad seçin.";
  }
  if (emailValue && isOwnerIdentifier(emailValue)) {
    return "Bu e-posta platform sahibine ait. Mağaza yöneticisi için farklı bir e-posta kullanın.";
  }
  return null;
}

/** Store admins can never be suspended individually; only the store itself can. */
export function adminStatusIsActive(status: string): boolean {
  return status !== "banned";
}
