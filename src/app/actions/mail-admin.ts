"use server";

import { getTranslator } from "@/lib/i18n/server";

import { desc, sql } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { mailEvents } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { mailEnabled } from "@/lib/mailer";
import { deliver, testTemplate } from "@/lib/mail-templates";
import { logAudit } from "@/lib/audit";
import { maskEmail } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

export type MailStats = {
  total: number;
  byStatus: { status: string; count: number }[];
  byKind: { kind: string; count: number }[];
  recent: {
    id: number;
    kind: string;
    status: string;
    recipient: string;
    detail: string;
    createdAt: string;
  }[];
  enabled: boolean;
};

/** Delivery ledger for the super admin (mail_events is the source of truth). */
export async function getMailStats(): Promise<ActionResult<MailStats>> {
  const session = await getSuperSession();
  if (!session) {
    const { t } = await getTranslator();
    return { ok: false, message: t("x.yetkiniz-yok") };
  }
  await ensureDatabase();
  const [totalRows, statusRows, kindRows, recentRows] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(mailEvents),
    db
      .select({ status: mailEvents.status, count: sql<number>`count(*)` })
      .from(mailEvents)
      .groupBy(mailEvents.status),
    db.select({ kind: mailEvents.kind, count: sql<number>`count(*)` }).from(mailEvents).groupBy(mailEvents.kind),
    db.select().from(mailEvents).orderBy(desc(mailEvents.id)).limit(60),
  ]);

  return {
    ok: true,
    data: {
      total: Number(totalRows[0]?.value ?? 0),
      byStatus: statusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
      byKind: kindRows.map((row) => ({ kind: row.kind, count: Number(row.count) })),
      recent: recentRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        recipient: row.recipient ?? "",
        detail: row.detail,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      enabled: mailEnabled(),
    },
  };
}

/** Sends a real test message to verify SMTP credentials from the panel. */
export async function sendTestMail(toRaw: string): Promise<ActionResult> {
  const { t } = await getTranslator();
  const session = await getSuperSession();
  if (!session) {
    const { t } = await getTranslator();
    return { ok: false, message: t("x.yetkiniz-yok") };
  }
  const to = toRaw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };
  if (!mailEnabled()) {
    return { ok: false, message: t("x.smtp-yaplandrlmad-env-dosyasna-smtp-host-ve-smtp-from-ek") };
  }
  const result = await deliver({
    to,
    template: testTemplate({ recipient: to }),
    kind: "test",
    dedupeRef: `test:${to}:${Date.now()}`,
  });
  await logAudit({
    action: "super.mail.test",
    entity: "mail",
    summary: `Test e-postası ${maskEmail(to)} adresine gönderildi (${result.status})`,
    severity: result.status === "sent" ? "info" : "warn",
    metadata: { status: result.status, detail: result.detail },
  });
  return {
    ok: result.status === "sent",
    message:
      result.status === "sent"
        ? t("x.test-e-postas-gonderildi")
        : `Gönderilemedi: ${result.detail || result.status}`,
  };
}
