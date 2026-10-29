import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string, fallback = false) =>
  integer(name, { mode: "boolean" }).notNull().default(fallback);

export const platformSettings = sqliteTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  brandName: text("brand_name").notNull().default("Platform"),
  renewalUrl: text("renewal_url").notNull().default("https://example.com/renew"),
  supportEmail: text("support_email").notNull().default("destek@example.com"),
  defaultPlanNote: text("default_plan_note").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const resellerKeys = sqliteTable(
  "reseller_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    durationDays: integer("duration_days"),
    maxAccounts: integer("max_accounts"),
    renewalUrl: text("renewal_url"),
    note: text("note"),
    status: text("status").notNull().default("available"),
    storeId: integer("store_id"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    usedAt: timestamp("used_at"),
  },
  (table) => [uniqueIndex("reseller_keys_code_uq").on(table.code)],
);

export const stores = sqliteTable(
  "stores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull().default("x.dijital-hesap-magazas"),
    subtitle: text("subtitle")
      .notNull()
      .default("x.oyun-ve-hesap-kodlarn-saniyeler-icinde-teslim-aln"),
    announcement: text("announcement").notNull().default(""),
    footerText: text("footer_text").notNull().default(""),
    logoUrl: text("logo_url").notNull().default(""),
    faviconUrl: text("favicon_url").notNull().default(""),
    primaryColor: text("primary_color").notNull().default("#111827"),
    accentColor: text("accent_color").notNull().default("#2563eb"),
    fontFamily: text("font_family").notNull().default("Inter"),
    contactLinks: text("contact_links", { mode: "json" })
      .$type<{ label: string; url: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at"),
    maxAccounts: integer("max_accounts"),
    renewalUrl: text("renewal_url"),
    resellerKeyId: integer("reseller_key_id"),
    customDomain: text("custom_domain"),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("stores_slug_uq").on(table.slug),
    uniqueIndex("stores_custom_domain_verified_uq")
      .on(table.customDomain)
      .where(sql`custom_domain_verified_at is not null`),
  ],
);

export const platformPosts = sqliteTable(
  "platform_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull().default("announcement"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    version: text("version").notNull().default(""),
    pinned: bool("pinned"),
    publishedAt: timestamp("published_at").notNull().$defaultFn(() => new Date()),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("platform_posts_kind_idx").on(table.kind, table.publishedAt)],
);

export const storeAdmins = sqliteTable(
  "store_admins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => [uniqueIndex("store_admins_username_uq").on(table.username)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url").notNull().default(""),
    emailVerifiedAt: timestamp("email_verified_at"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("customers_store_username_uq").on(table.storeId, table.username)],
);

export const securityFactors = sqliteTable(
  "security_factors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectType: text("subject_type").notNull(),
    subjectId: integer("subject_id").notNull(),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("security_factors_subject_kind_uq").on(table.subjectType, table.subjectId, table.kind)],
);

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    salesUrl: text("sales_url").notNull().default(""),
    steamUrl: text("steam_url").notNull().default(""),
    steamAppId: text("steam_app_id"),
    originalPrice: text("original_price"),
    originalCurrency: text("original_currency").notNull().default("TRY"),
    ourPrice: text("our_price").notNull().default("0"),
    currency: text("currency").notNull().default("TRY"),
    coverImage: text("cover_image").notNull().default(""),
    autoSync: bool("auto_sync"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("games_store_idx").on(table.storeId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    platform: text("platform").notNull().default("steam"),
    platformLabel: text("platform_label").notNull().default("Steam"),
    username: text("username"),
    email: text("email"),
    password: text("password").notNull(),
    productLabel: text("product_label").notNull().default(""),
    linkedGameIds: text("linked_game_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    guardType: text("guard_type").notNull().default("none"),
    steamSecret: text("steam_secret"),
    totpSecret: text("totp_secret"),
    mailEmail: text("mail_email"),
    mailPassword: text("mail_password"),
    mailProvider: text("mail_provider").notNull().default("gmail"),
    mailHost: text("mail_host"),
    mailPort: integer("mail_port"),
    mailSenderFilter: text("mail_sender_filter").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("available"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("accounts_store_idx").on(table.storeId)],
);

export const codes = sqliteTable(
  "codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    code: text("code").notNull(),
    type: text("type").notNull().default("single"),
    choiceCount: integer("choice_count").notNull().default(1),
    durationMinutes: integer("duration_minutes"),
    gameIds: text("game_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    accountIds: text("account_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    label: text("label").notNull().default(""),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    redeemedAt: timestamp("redeemed_at"),
    redeemedByCustomerId: integer("redeemed_by_customer_id"),
  },
  (table) => [
    uniqueIndex("codes_code_uq").on(table.code),
    index("codes_store_idx").on(table.storeId),
  ],
);

export const redemptions = sqliteTable(
  "redemptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    codeId: integer("code_id").notNull(),
    customerId: integer("customer_id"),
    guestUsername: text("guest_username"),
    guestToken: text("guest_token"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    accessExpiresAt: timestamp("access_expires_at"),
  },
  (table) => [
    uniqueIndex("redemptions_code_uq").on(table.codeId),
    index("redemptions_store_idx").on(table.storeId, table.createdAt),
  ],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    redemptionId: integer("redemption_id").notNull(),
    codeId: integer("code_id").notNull(),
    customerId: integer("customer_id"),
    kind: text("kind").notNull().default("game"),
    gameId: integer("game_id"),
    accountId: integer("account_id"),
    title: text("title").notNull().default(""),
    grantedAt: timestamp("granted_at").notNull().$defaultFn(() => new Date()),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [index("entitlements_customer_idx").on(table.storeId, table.customerId)],
);

/**
 * One row per verification challenge. A challenge carries a 6-digit code
 * (hashed) and a magic-link token: the link only reveals the code, it never
 * performs the verification by itself.
 */
export const emailVerifications = sqliteTable(
  "email_verifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id").notNull(),
    customerId: integer("customer_id"),
    subjectType: text("subject_type").notNull().default("customer"),
    subjectId: integer("subject_id"),
    email: text("email").notNull(),
    purpose: text("purpose").notNull().default("signup"),
    codeSecret: text("code_secret").notNull(),
    token: text("token").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("email_verifications_token_uq").on(table.token),
    index("email_verifications_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

/** Idempotency ledger for automated e-mails (reminders, receipts, digests). */
export const mailEvents = sqliteTable(
  "mail_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    storeId: integer("store_id"),
    recipient: text("recipient"),
    status: text("status").notNull().default("sent"),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("mail_events_kind_ref_uq").on(table.kind, table.ref)],
);

/**
 * Full audit trail. Every state change and every sensitive read writes a row.
 * Super admins can filter, search and export it from /super-admin/loglar.
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorType: text("actor_type").notNull().default("system"),
    actorId: integer("actor_id"),
    actorName: text("actor_name").notNull().default(""),
    storeId: integer("store_id"),
    storeSlug: text("store_slug").notNull().default(""),
    action: text("action").notNull(),
    entity: text("entity").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    severity: text("severity").notNull().default("info"),
    summary: text("summary").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_store_idx").on(table.storeId, table.createdAt),
    index("audit_logs_action_idx").on(table.action),
  ],
);

/**
 * Per-recipient e-mail preferences (GDPR/KVKK).
 *
 * Absence of a row means "everything on" so existing addresses keep receiving
 * transactional mail until they explicitly opt out from the profile page or from
 * the one-click unsubscribe link at the bottom of every message.
 */
export const mailPreferences = sqliteTable(
  "mail_preferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    audience: text("audience").notNull(),
    subjectId: integer("subject_id").notNull(),
    storeId: integer("store_id"),
    email: text("email").notNull().default(""),
    announcements: bool("announcements").notNull().default(true),
    delivery: bool("delivery").notNull().default(true),
    license: bool("license").notNull().default(true),
    security: bool("security").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("mail_preferences_subject_uq").on(table.audience, table.subjectId)],
);

export type Store = typeof stores.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Code = typeof codes.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type ResellerKey = typeof resellerKeys.$inferSelect;
export type PlatformPost = typeof platformPosts.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type MailEvent = typeof mailEvents.$inferSelect;
export type MailPreference = typeof mailPreferences.$inferSelect;
