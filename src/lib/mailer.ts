import nodemailer, { type Transporter } from "nodemailer";
import { and, eq } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { mailEvents } from "@/db/schema";
import { brand } from "@/lib/brand";
import { env, smtpConfigured } from "@/lib/env";
import { logAudit } from "@/lib/audit";

/**
 * Transactional e-mail.
 *
 * SMTP is entirely optional: when `SMTP_HOST`/`SMTP_FROM` are missing the helper
 * reports `skipped`, nothing is sent and every caller keeps working (no crash,
 * no dead-end registration flow).
 */

export type MailKind =
  | "verification"
  | "announcement"
  | "license"
  | "welcome"
  | "delivery"
  | "security"
  | "test"
  | "generic";

export type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind?: MailKind;
  /** Idempotency key; the same (kind, ref) pair is only ever sent once. */
  dedupeRef?: string;
  storeId?: number | null;
};

export type MailResult = {
  status: "sent" | "skipped" | "failed" | "duplicate";
  /** Dictionary key for the stored result (`x.gonderildi`, `x.smtp-yapilandirilmadi`, …). */
  detailCode: string;
  /** Technical text (message id or SMTP error). Server-side only. */
  detail: string;
};

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
    pool: true,
    maxConnections: 2,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export function mailEnabled(): boolean {
  return smtpConfigured();
}

export function mailFromHeader(): string {
  return `"${env.smtpFromName || brand.name}" <${env.smtpFrom}>`;
}

/** Absolute URL helper: every link inside an e-mail has to be clickable. */
export function absoluteUrl(path: string): string {
  const base = env.appUrl || "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function recordEvent(
  payload: MailPayload,
  status: MailResult["status"],
  /** Machine-readable reason code; the UI translates it. */
  detailCode: string,
  /** Free-form technical detail (SMTP server message). Never user-facing copy. */
  detail: string,
): Promise<void> {
  // Only the reason code is stored: this column is rendered in the super-admin
  // mail console, so it must stay translatable. The raw SMTP string is a
  // technical artefact and goes to the server log instead.
  const stored = detailCode.slice(0, 400);
  if (status === "failed") console.error("[mail] delivery failed:", detail);
  try {
    await ensureDatabase();
    if (payload.dedupeRef) {
      await db
        .insert(mailEvents)
        .values({
          kind: payload.kind ?? "generic",
          ref: payload.dedupeRef.slice(0, 160),
          storeId: payload.storeId ?? null,
          recipient: payload.to.slice(0, 200),
          status,
          detail: stored,
        })
        .onConflictDoNothing({ target: [mailEvents.kind, mailEvents.ref] });
    } else {
      await db.insert(mailEvents).values({
        kind: payload.kind ?? "generic",
        ref: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        storeId: payload.storeId ?? null,
        recipient: payload.to.slice(0, 200),
        status,
        detail: stored,
      });
    }
  } catch (error) {
    console.error("[mail] olay kaydı yazılamadı", error);
  }
}

/** Has this (kind, ref) already been delivered? Used by the reminder cron. */
export async function wasMailSent(kind: MailKind, ref: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await db
    .select({ id: mailEvents.id })
    .from(mailEvents)
    .where(and(eq(mailEvents.kind, kind), eq(mailEvents.ref, ref.slice(0, 160))))
    .limit(1);
  return rows.length > 0;
}

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const to = payload.to.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { status: "skipped", detailCode: "x.gecersiz-alici", detail: "invalid recipient address" };
  }
  if (!smtpConfigured()) {
    await recordEvent(payload, "skipped", "x.smtp-yapilandirilmadi", "SMTP not configured");
    return { status: "skipped", detailCode: "x.smtp-yapilandirilmadi", detail: "SMTP not configured" };
  }
  if (payload.dedupeRef && (await wasMailSent(payload.kind ?? "generic", payload.dedupeRef))) {
    return { status: "duplicate", detailCode: "x.zaten-gonderildi", detail: "already delivered" };
  }

  const transport = getTransport();
  if (!transport) return { status: "skipped", detailCode: "x.smtp-yapilandirilmadi", detail: "SMTP not configured" };

  try {
    const info = await transport.sendMail({
      from: mailFromHeader(),
      to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: env.supportEmail || undefined,
    });
    await recordEvent(payload, "sent", "x.gonderildi", info.messageId ?? "");
    await logAudit({
      action: "mail.sent",
      entity: "mail",
      entityId: payload.dedupeRef ?? "",
      storeId: payload.storeId ?? null,
      summary: `${payload.kind ?? "mail"} → ${to}`,
      metadata: { subject: payload.subject, messageId: info.messageId ?? "" },
    });
    return { status: "sent", detailCode: "x.gonderildi", detail: info.messageId ?? "" };
  } catch (error) {
    const detail = (error as Error).message.slice(0, 300);
    await recordEvent(payload, "failed", "x.gonderim-hatasi", detail);
    await logAudit({
      action: "mail.failed",
      entity: "mail",
      storeId: payload.storeId ?? null,
      severity: "warn",
      summary: `${payload.kind ?? "mail"} → ${to}`,
      metadata: { detail },
    });
    return { status: "failed", detailCode: "x.gonderim-hatasi", detail };
  }
}

/* ------------------------------ Templates ------------------------------ */

const COLORS = {
  bg: "#f5f6f8",
  card: "#ffffff",
  fg: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#4f46e5",
  danger: "#dc2626",
  warn: "#b45309",
  ok: "#047857",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared responsive HTML shell (inline styles: mail clients strip <style>). */
export function layout(options: {
  title: string;
  preheader?: string;
  badge?: { text: string; color?: string };
  body: string;
  footerNote?: string;
  /** One-click unsubscribe link (KVKK / GDPR, RFC 8058 friendly). */
  unsubscribeUrl?: string;
}): string {
  const badge = options.badge
    ? `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${options.badge.color ?? COLORS.accent}14;color:${options.badge.color ?? COLORS.accent};font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(options.badge.text)}</span>`
    : "";
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.fg}">
${options.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${COLORS.border}">
<span style="font-size:15px;font-weight:700;letter-spacing:-.02em">${escapeHtml(brand.name)}</span>
</td></tr>
<tr><td style="padding:24px">
${badge}
<h1 style="margin:12px 0 8px;font-size:20px;line-height:1.3;letter-spacing:-.02em">${escapeHtml(options.title)}</h1>
${options.body}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${COLORS.border};color:${COLORS.muted};font-size:11.5px;line-height:1.6">
${options.footerNote ? `<p style="margin:0 0 6px">${escapeHtml(options.footerNote)}</p>` : ""}
${options.unsubscribeUrl ? `<p style="margin:0 0 6px"><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:${COLORS.muted};text-decoration:underline">E-posta bildirimlerini kapat</a> — yalnızca bu adres için geçerlidir.</p>` : ""}
<p style="margin:0">Bu e-posta ${escapeHtml(brand.name)} tarafından otomatik gönderildi. Yanıtlamayın; destek için
<a href="mailto:${escapeHtml(env.supportEmail)}" style="color:${COLORS.accent}">${escapeHtml(env.supportEmail)}</a>.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:16px 0 4px;padding:11px 18px;border-radius:10px;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:600">${escapeHtml(label)}</a>`;
}

export function codeBlock(code: string): string {
  return `<div style="margin:16px 0;padding:16px;border-radius:12px;background:${COLORS.bg};border:1px dashed ${COLORS.border};text-align:center">
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:.22em;font-weight:700">${escapeHtml(code)}</div>
<div style="margin-top:6px;color:${COLORS.muted};font-size:11.5px">Bu kod 15 dakika geçerlidir.</div>
</div>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:13.5px;line-height:1.7;color:${COLORS.fg}">${text}</p>`;
}

export function muted(text: string): string {
  return `<p style="margin:0 0 10px;font-size:12.5px;line-height:1.7;color:${COLORS.muted}">${text}</p>`;
}

export function list(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul style="margin:8px 0 14px;padding-left:18px;font-size:13px;line-height:1.8">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}
