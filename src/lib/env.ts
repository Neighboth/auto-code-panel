import path from "node:path";

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function sqliteFilePath(): string {
  const raw = read("SQLITE_PATH") || path.join(process.cwd(), "data", "app.db");
  return path.resolve(raw.replace(/^file:/i, ""));
}

export const env = {
  nodeEnv: read("NODE_ENV", "development"),
  sqlitePath: sqliteFilePath(),
  authSecret: read("AUTH_SECRET") || read("SESSION_SECRET") || "change-auth-secret-in-env",
  dataKey: read("DATA_ENCRYPTION_KEY") || read("AUTH_SECRET") || "change-auth-secret-in-env",
  superAdminUsername: read("SUPER_ADMIN_USERNAME", "admin"),
  superAdminPassword: read("SUPER_ADMIN_PASSWORD"),
  superAdminEmail: read("SUPER_ADMIN_EMAIL"),
  brandName: read("BRAND_NAME", "Platform"),
  brandTagline: read("BRAND_TAGLINE", "Dijital teslimat altyapısı"),
  brandLogoUrl: read("BRAND_LOGO_URL"),
  renewalUrl: read("RENEWAL_URL", "https://example.com/renew"),
  supportEmail: read("SUPPORT_EMAIL", "destek@example.com"),
  cronSecret: read("CRON_SECRET"),
};

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}
