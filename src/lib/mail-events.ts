import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { customers, platformPosts, storeAdmins, stores, type PlatformPost, type Store } from "@/db/schema";
import { env } from "@/lib/env";
import { absoluteUrl } from "@/lib/mailer";
import {
  announcementTemplate,
  deliver,
  deliveryTemplate,
  licenseReminderTemplate,
  welcomeTemplate,
} from "@/lib/mail-templates";
import { logAudit } from "@/lib/audit";
import { allowsMail, unsubscribeUrl } from "@/lib/mail-prefs";
import { remainingLabel } from "@/lib/format";

/**
 * Business e-mails triggered by platform events.
 *
 * Every sender is best-effort and idempotent:
 *  - nothing is sent when SMTP is not configured,
 *  - reminders are deduplicated through `mail_events` (kind + ref),
 *  - a failure is logged to the audit trail instead of breaking the action.
 */

/** 1. Store created (reseller activation). */
export async function sendWelcomeMail(store: Store, admin: { id: number; email: string; username: string }) {
  if (!admin.email) return;
  const template = await welcomeTemplate({
    storeName: store.name,
    adminUsername: admin.username,
    loginUrl: absoluteUrl(`/${store.slug}/admin/giris`),
    storeSlug: store.slug,
    expiresAt: store.expiresAt ? new Date(store.expiresAt) : null,
  });
  await deliver({
    to: admin.email,
    template,
    kind: "welcome",
    dedupeRef: `welcome:${store.id}`,
    storeId: store.id,
    unsubscribeUrl: unsubscribeUrl("store_admin", admin.id),
  });
}

/** 2. Announcement / update published → every ACTIVE store manager. */
export async function sendAnnouncementMails(post: PlatformPost): Promise<{ sent: number; skipped: number }> {
  await ensureDatabase();
  const rows = await db
    .select({ store: stores, admin: storeAdmins })
    .from(stores)
    .innerJoin(storeAdmins, eq(storeAdmins.storeId, stores.id));

  let sent = 0;
  let skipped = 0;
  for (const { store, admin } of rows) {
    // Suspended or expired stores do not receive platform e-mails.
    const expired = store.expiresAt !== null && new Date(store.expiresAt).getTime() <= Date.now();
    if (store.status !== "active" || expired) {
      skipped += 1;
      continue;
    }
    if (!admin.email) {
      skipped += 1;
      continue;
    }
    if (!(await allowsMail("store_admin", admin.id, "announcements"))) {
      skipped += 1;
      continue;
    }
    const template = announcementTemplate({
      storeName: store.name,
      adminUsername: admin.username,
      kind: post.kind === "update" ? "update" : "announcement",
      title: post.title,
      body: post.body || "",
      version: post.version || "",
      url: absoluteUrl(`/${store.slug}/admin`),
    });
    const result = await deliver({
      to: admin.email,
      template,
      kind: "announcement",
      dedupeRef: `post:${post.id}:admin:${admin.id}`,
      storeId: store.id,
      unsubscribeUrl: unsubscribeUrl("store_admin", admin.id),
    });
    if (result.status === "sent" || result.status === "skipped") sent += 1;
    else skipped += 1;
  }

  await logAudit({
    action: "mail.announcement.broadcast",
    entity: "platform_post",
    entityId: post.id,
    summary: `${post.title} duyurusu ${sent} mağazaya gönderildi (${skipped} atlandı)`,
    metadata: { kind: post.kind, sent, skipped },
  });
  return { sent, skipped };
}

/** 3. License reminders: exactly 3 days and 1 day before expiry. */
export async function sendLicenseReminders(): Promise<{ sent: number; checked: number }> {
  await ensureDatabase();
  const horizon = new Date(Date.now() + 4 * 86_400_000);
  const rows = await db
    .select({ store: stores, admin: storeAdmins })
    .from(stores)
    .innerJoin(storeAdmins, eq(storeAdmins.storeId, stores.id))
    .where(and(isNotNull(stores.expiresAt), lte(stores.expiresAt, horizon)));

  let sent = 0;
  let checked = 0;
  for (const { store, admin } of rows) {
    if (!store.expiresAt || !admin.email) continue;
    if (!(await allowsMail("store_admin", admin.id, "license"))) continue;
    const expiresAt = new Date(store.expiresAt);
    const msLeft = expiresAt.getTime() - Date.now();
    if (msLeft <= 0) continue;
    const daysLeft = msLeft / 86_400_000;
    // 3 days and 1 day windows; the day bucket keeps the ref stable per day.
    const bucket = daysLeft <= 1.5 ? 1 : daysLeft <= 3.5 ? 3 : null;
    if (!bucket) continue;
    checked += 1;
    const template = licenseReminderTemplate({
      storeName: store.name,
      adminUsername: admin.username,
      daysLeft: bucket,
      expiresAt,
      renewalUrl: store.renewalUrl || env.renewalUrl,
    });
    const result = await deliver({
      to: admin.email,
      template,
      kind: "license",
      dedupeRef: `license:${store.id}:${bucket}:${expiresAt.toISOString().slice(0, 10)}`,
      storeId: store.id,
      unsubscribeUrl: unsubscribeUrl("store_admin", admin.id),
    });
    if (result.status === "sent") sent += 1;
  }
  return { sent, checked };
}

/** 4. Redeem receipt for the member (guests have no mailbox on file). */
export async function sendDeliveryReceipt(options: {
  store: Store;
  customerId: number | null;
  code: string;
  items: { title: string; platformLabel?: string }[];
}) {
  if (!options.customerId) return;
  if (!(await allowsMail("customer", options.customerId, "delivery"))) return;
  const rows = await db
    .select({ email: customers.email, username: customers.username })
    .from(customers)
    .where(eq(customers.id, options.customerId))
    .limit(1);
  const customer = rows[0];
  if (!customer?.email) return;

  const template = deliveryTemplate({
    storeName: options.store.name,
    username: customer.username,
    code: options.code,
    items: options.items,
    libraryUrl: absoluteUrl(`/${options.store.slug}/kutuphane`),
  });
  await deliver({
    to: customer.email,
    template,
    kind: "delivery",
    dedupeRef: `delivery:${options.store.id}:${options.code}`,
    storeId: options.store.id,
    unsubscribeUrl: unsubscribeUrl("customer", options.customerId),
  });
}

/** Helper used by the settings UI to show whether mail is wired up. */
export function mailStatus(): { enabled: boolean; host: string; from: string; verification: boolean } {
  return {
    enabled: Boolean(env.smtpHost && env.smtpFrom),
    host: env.smtpHost,
    from: env.smtpFrom,
    verification: Boolean(env.smtpHost && env.smtpFrom && env.mailVerificationMode !== "off"),
  };
}

/** Human label for the licence countdown (kept here for the reminder tests). */
export function licenseCountdown(expiresAt: Date): string {
  return remainingLabel(expiresAt);
}
