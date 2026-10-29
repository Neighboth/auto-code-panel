import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

const globalForDb = globalThis as typeof globalThis & {
  __sqliteClient?: ReturnType<typeof createClient>;
  __sqliteReady?: Promise<void>;
};

function openClient() {
  const filePath = env.sqlitePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return createClient({ url: `file:${filePath}` });
}

export const sqlite = globalForDb.__sqliteClient ?? openClient();
if (env.nodeEnv !== "production") {
  globalForDb.__sqliteClient = sqlite;
}

export const db = drizzle(sqlite, { schema });

const DDL = [
  `create table if not exists platform_settings (
    id integer primary key default 1,
    brand_name text not null default 'Platform',
    renewal_url text not null default 'https://example.com/renew',
    support_email text not null default 'destek@example.com',
    default_plan_note text not null default '',
    updated_at integer not null
  )`,
  `create table if not exists reseller_keys (
    id integer primary key autoincrement,
    code text not null,
    duration_days integer,
    max_accounts integer,
    renewal_url text,
    note text,
    status text not null default 'available',
    store_id integer,
    created_at integer not null,
    used_at integer
  )`,
  `create unique index if not exists reseller_keys_code_uq on reseller_keys (code)`,
  `create table if not exists stores (
    id integer primary key autoincrement,
    slug text not null,
    name text not null,
    title text not null default 'Dijital Hesap Mağazası',
    subtitle text not null default 'Oyun ve hesap kodlarını saniyeler içinde teslim alın.',
    announcement text not null default '',
    footer_text text not null default '',
    logo_url text not null default '',
    favicon_url text not null default '',
    primary_color text not null default '#111827',
    accent_color text not null default '#2563eb',
    font_family text not null default 'Inter',
    contact_links text not null default '[]',
    status text not null default 'active',
    expires_at integer,
    max_accounts integer,
    renewal_url text,
    reseller_key_id integer,
    custom_domain text,
    custom_domain_verified_at integer,
    created_at integer not null,
    updated_at integer not null
  )`,
  `create unique index if not exists stores_slug_uq on stores (slug)`,
  `create table if not exists platform_posts (
    id integer primary key autoincrement,
    kind text not null default 'announcement',
    title text not null,
    body text not null default '',
    version text not null default '',
    pinned integer not null default 0,
    published_at integer not null,
    created_at integer not null,
    updated_at integer not null
  )`,
  `create index if not exists platform_posts_kind_idx on platform_posts (kind, published_at)`,
  `create table if not exists store_admins (
    id integer primary key autoincrement,
    store_id integer not null,
    username text not null,
    email text not null,
    password_hash text not null,
    status text not null default 'active',
    created_at integer not null,
    last_login_at integer
  )`,
  `create unique index if not exists store_admins_username_uq on store_admins (username)`,
  `create table if not exists customers (
    id integer primary key autoincrement,
    store_id integer not null,
    username text not null,
    display_name text not null,
    email text,
    avatar_url text not null default '',
    password_hash text not null,
    status text not null default 'active',
    email_verified_at integer,
    created_at integer not null
  )`,
  `create unique index if not exists customers_store_username_uq on customers (store_id, username)`,
  `create table if not exists security_factors (
    id integer primary key autoincrement,
    subject_type text not null,
    subject_id integer not null,
    kind text not null,
    data text not null,
    created_at integer not null
  )`,
  `create unique index if not exists security_factors_subject_kind_uq on security_factors (subject_type, subject_id, kind)`,
  `create table if not exists games (
    id integer primary key autoincrement,
    store_id integer not null,
    title text not null,
    description text not null default '',
    sales_url text not null default '',
    steam_url text not null default '',
    steam_app_id text,
    original_price text,
    original_currency text not null default 'TRY',
    our_price text not null default '0',
    currency text not null default 'TRY',
    cover_image text not null default '',
    auto_sync integer not null default 0,
    last_synced_at integer,
    created_at integer not null,
    updated_at integer not null
  )`,
  `create index if not exists games_store_idx on games (store_id)`,
  `create table if not exists accounts (
    id integer primary key autoincrement,
    store_id integer not null,
    platform text not null default 'steam',
    platform_label text not null default 'Steam',
    username text,
    email text,
    password text not null,
    product_label text not null default '',
    linked_game_ids text not null default '[]',
    guard_type text not null default 'none',
    steam_secret text,
    totp_secret text,
    mail_email text,
    mail_password text,
    mail_provider text not null default 'gmail',
    mail_host text,
    mail_port integer,
    mail_sender_filter text not null default '',
    notes text not null default '',
    status text not null default 'available',
    created_at integer not null,
    updated_at integer not null
  )`,
  `create index if not exists accounts_store_idx on accounts (store_id)`,
  `create table if not exists codes (
    id integer primary key autoincrement,
    store_id integer not null,
    code text not null,
    type text not null default 'single',
    choice_count integer not null default 1,
    duration_minutes integer,
    game_ids text not null default '[]',
    account_ids text not null default '[]',
    label text not null default '',
    created_at integer not null,
    redeemed_at integer,
    redeemed_by_customer_id integer
  )`,
  `create unique index if not exists codes_code_uq on codes (code)`,
  `create index if not exists codes_store_idx on codes (store_id)`,
  `create table if not exists redemptions (
    id integer primary key autoincrement,
    store_id integer not null,
    code_id integer not null,
    customer_id integer,
    guest_username text,
    guest_token text,
    created_at integer not null,
    access_expires_at integer
  )`,
  `create unique index if not exists redemptions_code_uq on redemptions (code_id)`,
  `create index if not exists redemptions_store_idx on redemptions (store_id, created_at)`,
  `create table if not exists entitlements (
    id integer primary key autoincrement,
    store_id integer not null,
    redemption_id integer not null,
    code_id integer not null,
    customer_id integer,
    kind text not null default 'game',
    game_id integer,
    account_id integer,
    title text not null default '',
    granted_at integer not null,
    expires_at integer
  )`,
  `create index if not exists entitlements_customer_idx on entitlements (store_id, customer_id)`,
  `create table if not exists email_verifications (
    id integer primary key autoincrement,
    store_id integer not null,
    customer_id integer,
    subject_type text not null default 'customer',
    subject_id integer,
    email text not null,
    purpose text not null default 'signup',
    code_secret text not null,
    token text not null,
    attempts integer not null default 0,
    expires_at integer not null,
    used_at integer,
    created_at integer not null
  )`,
  `create unique index if not exists email_verifications_token_uq on email_verifications (token)`,
  `create index if not exists email_verifications_subject_idx on email_verifications (subject_type, subject_id)`,
  `create table if not exists mail_events (
    id integer primary key autoincrement,
    kind text not null,
    ref text not null,
    store_id integer,
    recipient text,
    status text not null default 'sent',
    detail text not null default '',
    created_at integer not null
  )`,
  `create unique index if not exists mail_events_kind_ref_uq on mail_events (kind, ref)`,
  `create table if not exists audit_logs (
    id integer primary key autoincrement,
    actor_type text not null default 'system',
    actor_id integer,
    actor_name text not null default '',
    store_id integer,
    store_slug text not null default '',
    action text not null,
    entity text not null default '',
    entity_id text not null default '',
    severity text not null default 'info',
    summary text not null default '',
    metadata text not null default '{}',
    ip text not null default '',
    user_agent text not null default '',
    created_at integer not null
  )`,
  `create index if not exists audit_logs_created_idx on audit_logs (created_at)`,
  `create index if not exists audit_logs_store_idx on audit_logs (store_id, created_at)`,
  `create index if not exists audit_logs_action_idx on audit_logs (action)`,
  `create table if not exists mail_preferences (
    id integer primary key autoincrement,
    audience text not null,
    subject_id integer not null,
    store_id integer,
    email text not null default '',
    announcements integer not null default 1,
    delivery integer not null default 1,
    license integer not null default 1,
    security integer not null default 1,
    updated_at integer not null
  )`,
  `create unique index if not exists mail_preferences_subject_uq on mail_preferences (audience, subject_id)`,
  /* Hot-path indexes: storefront listings, redemption lookups and dashboards. */
  `create index if not exists games_store_idx on games (store_id)`,
  `create index if not exists games_store_active_idx on games (store_id, created_at desc)`,
  `create index if not exists accounts_store_idx on accounts (store_id, status)`,
  `create index if not exists codes_store_idx on codes (store_id, created_at desc)`,
  `create index if not exists codes_store_redeemed_idx on codes (store_id, redeemed_at)`,
  `create index if not exists customers_store_idx on customers (store_id)`,
  `create unique index if not exists customers_store_username_uq on customers (store_id, username)`,
  `create index if not exists entitlements_store_idx on entitlements (store_id, customer_id)`,
  `create index if not exists redemptions_store_idx on redemptions (store_id)`,
  `create index if not exists store_admins_store_idx on store_admins (store_id)`,
];

async function bootstrap(): Promise<void> {
  await sqlite.execute("pragma busy_timeout = 8000");
  await sqlite.execute("pragma journal_mode = WAL");
  await sqlite.execute("pragma foreign_keys = ON");
  for (const statement of DDL) {
    await sqlite.execute(statement);
  }
  // In-place migrations for databases created before these columns existed.
  const migrations = [
    "alter table store_admins add column status text not null default 'active'",
    "alter table customers add column status text not null default 'active'",
    "alter table accounts add column mail_provider text not null default 'gmail'",
    "alter table accounts add column mail_host text",
    "alter table accounts add column mail_port integer",
    "alter table accounts add column mail_sender_filter text not null default ''",
    "alter table redemptions add column guest_token text",
    "update store_admins set status = 'active' where status = 'banned'",
    "alter table stores add column custom_domain text",
    "alter table stores add column custom_domain_verified_at integer",
    "alter table customers add column email_verified_at integer",
    "drop index if exists stores_custom_domain_uq",
    "create unique index if not exists stores_custom_domain_verified_uq on stores (custom_domain) where custom_domain is not null and custom_domain_verified_at is not null",
  ];
  for (const statement of migrations) {
    try {
      await sqlite.execute(statement);
    } catch {
      /* column already exists */
    }
  }
  try {
    await sqlite.execute("drop index if exists store_admins_store_username_uq");
  } catch {
    /* ignore */
  }
  const existing = await sqlite.execute("select id from platform_settings where id = 1 limit 1");
  if (existing.rows.length === 0) {
    await sqlite.execute({
      sql: `insert into platform_settings (id, brand_name, renewal_url, support_email, default_plan_note, updated_at)
            values (1, ?, ?, ?, '', ?)`,
      args: [env.brandName, env.renewalUrl, env.supportEmail, Date.now()],
    });
  }
}

export async function ensureDatabase(): Promise<void> {
  if (!globalForDb.__sqliteReady) {
    globalForDb.__sqliteReady = bootstrap().catch((error) => {
      globalForDb.__sqliteReady = undefined;
      throw error;
    });
  }
  await globalForDb.__sqliteReady;
}

if (process.env.NEXT_PHASE !== "phase-production-build") {
  void ensureDatabase();
}
