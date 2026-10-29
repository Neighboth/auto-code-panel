import path from "node:path";

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function sqliteFilePath(): string {
  const raw = read("SQLITE_PATH") || path.join(process.cwd(), "data", "app.db");
  return path.resolve(raw.replace(/^file:/i, ""));
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on", "evet"].includes(value.trim().toLowerCase());
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
  appUrl: read("APP_URL").replace(/\/+$/, ""),
  /* ---- Optional SMTP: when unset, no e-mail is ever sent ---- */
  smtpHost: read("SMTP_HOST"),
  smtpPort: Number(read("SMTP_PORT", "587")) || 587,
  smtpSecure: bool("SMTP_SECURE", false),
  smtpUser: read("SMTP_USER"),
  smtpPassword: read("SMTP_PASSWORD"),
  smtpFrom: read("SMTP_FROM") || read("SMTP_USER"),
  smtpFromName: read("SMTP_FROM_NAME", read("BRAND_NAME", "Pixelith")),
  mailVerificationMode: (read("MAIL_VERIFICATION", "auto").toLowerCase() as "auto" | "on" | "off"),
};

/** SMTP credentials are complete enough to actually deliver mail. */
export function smtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpFrom);
}

/**
 * E-mail verification is ON only when SMTP is configured and the operator did
 * not explicitly disable it. With `auto` (default) the feature follows SMTP.
 */
export function mailVerificationEnabled(): boolean {
  if (env.mailVerificationMode === "off") return false;
  if (env.mailVerificationMode === "on") return smtpConfigured();
  return smtpConfigured();
}

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}
