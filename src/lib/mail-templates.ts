import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { formatDateTime, remainingLabel } from "@/lib/format";
import {
  absoluteUrl,
  button,
  codeBlock,
  layout,
  list,
  muted,
  paragraph,
  sendMail,
  type MailResult,
} from "@/lib/mailer";

/**
 * Every automated e-mail in one place: verification, welcome, license
 * reminders, announcements and delivery receipts. All templates return a
 * `{ subject, html, text }` triple so the plain-text alternative is real, which
 * keeps spam filters happy.
 */

type Template = { subject: string; html: string; text: string };

const HTML_ONLY = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------- 1. E-posta doğrulama ------------------------- */

export function verificationTemplate(options: {
  storeName: string;
  username: string;
  code: string;
  link: string;
  purpose: "signup" | "login" | "change";
  locale?: string;
}): Template {
  const isEn = (options.locale ?? "tr").toLowerCase().startsWith("en");
  const title =
    options.purpose === "signup"
      ? isEn
        ? "Verify your e-mail"
        : "E-posta adresinizi doğrulayın"
      : isEn
        ? "Your sign-in code"
        : "Giriş doğrulama kodunuz";
  const body = [
    paragraph(
      isEn
        ? `Hello <strong>${escape(options.username)}</strong>, use the code below to continue in <strong>${escape(options.storeName)}</strong>.`
        : `Merhaba <strong>${escape(options.username)}</strong>, <strong>${escape(options.storeName)}</strong> mağazasında devam etmek için aşağıdaki kodu kullanın.`,
    ),
    codeBlock(options.code),
    paragraph(
      isEn
        ? "You can also open the secure link below; it shows the same 6-digit code. The link never signs you in by itself."
        : "Aşağıdaki güvenli bağlantıyı da açabilirsiniz; aynı 6 haneli kodu gösterir. Bağlantı sizi kendi başına oturum açtırmaz.",
    ),
    button(options.link, isEn ? "Show my code" : "Kodumu göster"),
    muted(
      isEn
        ? "The code and the link expire in 15 minutes. If you did not request this, you can ignore this e-mail."
        : "Kod ve bağlantı 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
    ),
  ].join("");
  return {
    subject: isEn
      ? `${options.code} — ${brand.name} verification code`
      : `${options.code} — ${brand.name} doğrulama kodunuz`,
    html: layout({ title, preheader: `${options.code}`, badge: { text: isEn ? "Verification" : "Doğrulama" }, body }),
    text: [
      title,
      "",
      isEn ? `Hello ${options.username},` : `Merhaba ${options.username},`,
      isEn ? `Your code for ${options.storeName}: ${options.code}` : `${options.storeName} için kodunuz: ${options.code}`,
      "",
      isEn ? `Open the link to see the code: ${options.link}` : `Kodu görmek için bağlantı: ${options.link}`,
      "",
      isEn ? "Valid for 15 minutes." : "15 dakika geçerlidir.",
    ].join("\n"),
  };
}

/* ----------------------------- 2. Karşılama ----------------------------- */

export function welcomeTemplate(options: {
  storeName: string;
  adminUsername: string;
  loginUrl: string;
  storeSlug?: string;
  expiresAt: Date | null;
  planNote?: string;
}): Template {
  const remaining = options.expiresAt ? remainingLabel(options.expiresAt) : "Sınırsız";
  const body = [
    paragraph(
      `Merhaba <strong>${escape(options.adminUsername)}</strong>, <strong>${escape(options.storeName)}</strong> mağazanız hazır. Panelinize giriş yapıp ürünlerinizi ekleyebilirsiniz.`,
    ),
    button(options.loginUrl, "Mağaza paneline gir"),
    list([
      `Mağaza adresi: ${absoluteUrl("/" + (options.storeSlug ?? ""))}`,
      `Lisans süresi: ${remaining}`,
      options.expiresAt ? `Bitiş: ${formatDateTime(options.expiresAt)}` : "Bitiş: yok (sınırsız)",
    ]),
    options.planNote ? muted(escape(options.planNote)) : "",
    muted("Faturalandırma ve süre uzatma için panelinizdeki bağlantıyı kullanabilirsiniz."),
  ].join("");
  return {
    subject: `${brand.name} — ${options.storeName} mağazanız açıldı`,
    html: layout({ title: "Mağazanız hazır", badge: { text: "Hoş geldiniz", color: "#047857" }, body }),
    text: [
      `Mağazanız hazır: ${options.storeName}`,
      `Panele giriş: ${options.loginUrl}`,
      `Lisans: ${remaining}`,
      options.planNote ?? "",
    ].join("\n"),
  };
}

/* -------------------------- 3. Lisans hatırlatma ------------------------ */

export function licenseReminderTemplate(options: {
  storeName: string;
  adminUsername: string;
  daysLeft: number;
  expiresAt: Date;
  renewalUrl: string;
}): Template {
  const body = [
    paragraph(
      `Merhaba <strong>${escape(options.adminUsername)}</strong>, <strong>${escape(options.storeName)}</strong> mağazanızın bayilik süresi <strong>${options.daysLeft} gün</strong> içinde doluyor.`,
    ),
    list([`Bitiş tarihi: ${formatDateTime(options.expiresAt)}`, `Kalan süre: ${remainingLabel(options.expiresAt)}`]),
    paragraph("Süre dolduğunda mağaza paneli kilitlenir ve müşterileriniz kod kullanamaz. Kesintisiz devam etmek için süreyi uzatın."),
    button(options.renewalUrl, "Süreyi uzat"),
    muted("Bu hatırlatma, lisans bitiminden 3 gün ve 1 gün önce bir kez gönderilir."),
  ].join("");
  return {
    subject: `${brand.name} — ${options.storeName} lisansı ${options.daysLeft} gün içinde bitiyor`,
    html: layout({
      title: `Lisansınız ${options.daysLeft} gün içinde bitiyor`,
      badge: { text: `${options.daysLeft} gün`, color: "#b45309" },
      body,
    }),
    text: [
      `${options.storeName} lisansı ${options.daysLeft} gün içinde bitiyor.`,
      `Bitiş: ${formatDateTime(options.expiresAt)}`,
      `Uzat: ${options.renewalUrl}`,
    ].join("\n"),
  };
}

/* --------------------------- 4. Duyuru / sürüm -------------------------- */

export function announcementTemplate(options: {
  storeName: string;
  adminUsername: string;
  kind: "announcement" | "update";
  title: string;
  body: string;
  version: string;
  url: string;
}): Template {
  const isUpdate = options.kind === "update";
  const body = [
    paragraph(`Merhaba <strong>${escape(options.adminUsername)}</strong>, ${escape(options.storeName)} mağazanız için yeni bir ${isUpdate ? "güncelleme notu" : "duyuru"} yayınlandı.`),
    muted(isUpdate && options.version ? `Sürüm ${escape(options.version)}` : ""),
    `<div style="margin:12px 0;padding:14px 16px;border-left:3px solid ${isUpdate ? "#4f46e5" : "#047857"};background:#f8fafc;border-radius:8px;font-size:13px;line-height:1.7">${options.body
      .split(/\n{2,}/)
      .map((chunk) => `<p style="margin:0 0 8px">${escape(chunk).replace(/\n/g, "<br>")}</p>`)
      .join("")}</div>`,
    button(options.url, "Panelde aç"),
  ].join("");
  return {
    subject: `${brand.name} — ${isUpdate ? "Güncelleme" : "Duyuru"}: ${options.title}`,
    html: layout({
      title: options.title,
      badge: { text: isUpdate ? "Güncelleme" : "Duyuru", color: isUpdate ? "#4f46e5" : "#047857" },
      body,
      footerNote: "Bu duyuru, mağazanız aktif olduğu için gönderildi.",
    }),
    text: [`${isUpdate ? "Güncelleme" : "Duyuru"}: ${options.title}`, "", HTML_ONLY(options.body), "", options.url].join("\n"),
  };
}

/* --------------------------- 5. Teslimat fişi --------------------------- */

export function deliveryTemplate(options: {
  storeName: string;
  username: string;
  code: string;
  items: { title: string; platformLabel?: string }[];
  libraryUrl: string;
}): Template {
  const body = [
    paragraph(
      `Merhaba <strong>${escape(options.username)}</strong>, <strong>${escape(options.code)}</strong> kodunu başarıyla kullandınız. Aşağıdaki ürünler kütüphanenize eklendi.`,
    ),
    list(options.items.map((item) => (item.platformLabel ? `${item.title} (${item.platformLabel})` : item.title))),
    paragraph("Hesap bilgileri ve canlı 2FA / Steam Guard kodları kütüphanenizde. Erişim süresizdir; kod tekrar kullanılamaz, bu yüzden bu e-postayı saklamanız gerekmez."),
    button(options.libraryUrl, "Kütüphanemi aç"),
    muted("Güvenlik nedeniyle şifreler e-posta ile gönderilmez."),
  ].join("");
  return {
    subject: `${brand.name} — ${options.storeName} teslimatınız hazır (${options.code})`,
    html: layout({ title: "Yeni ürünleriniz hazır", badge: { text: "Teslimat", color: "#047857" }, body }),
    text: [
      `${options.storeName} — kod: ${options.code}`,
      "Kütüphanenize eklenen ürünler:",
      ...options.items.map((item) => `- ${item.title}`),
      "",
      options.libraryUrl,
    ].join("\n"),
  };
}

/* ----------------------------- 6. Güvenlik ------------------------------ */

export function securityTemplate(options: {
  storeName: string;
  username: string;
  what: string;
  detail: string;
  at: Date;
  ip?: string;
}): Template {
  const body = [
    paragraph(`Merhaba <strong>${escape(options.username)}</strong>, ${escape(options.storeName)} hesabınızda bir güvenlik değişikliği yapıldı.`),
    list([
      `İşlem: ${options.what}`,
      `Detay: ${options.detail}`,
      `Tarih: ${formatDateTime(options.at)}`,
      options.ip ? `IP: ${options.ip}` : "",
    ].filter(Boolean)),
    paragraph("Bu işlemi siz yapmadıysanız hemen şifrenizi değiştirin ve destek ile iletişime geçin."),
    button(`mailto:${env.supportEmail}`, "Destek ile iletişime geç"),
  ].join("");
  return {
    subject: `${brand.name} — güvenlik bildirimi (${options.what})`,
    html: layout({ title: "Hesabınızda bir değişiklik yapıldı", badge: { text: "Güvenlik", color: "#b91c1c" }, body }),
    text: [`${options.what}: ${options.detail}`, formatDateTime(options.at), options.ip ?? ""].join("\n"),
  };
}

/* ------------------------------ 7. Test -------------------------------- */

export function testTemplate(options: { recipient: string }): Template {
  const body = [
    paragraph("SMTP yapılandırmanız çalışıyor. Bu e-postayı görüyorsanız doğrulama, magic link ve bildirim mailleri de gönderilecektir."),
    muted(`Alıcı: ${escape(options.recipient)} · Sunucu: ${escape(env.smtpHost)}:${env.smtpPort}`),
  ].join("");
  return {
    subject: `${brand.name} — SMTP test e-postası`,
    html: layout({ title: "SMTP testi başarılı", badge: { text: "Test", color: "#047857" }, body }),
    text: `SMTP testi başarılı. Sunucu: ${env.smtpHost}:${env.smtpPort}`,
  };
}

/* ------------------------------ Helper -------------------------------- */

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Sends a built template and returns the delivery result. */
export async function deliver(options: {
  to: string;
  template: Template;
  kind: Parameters<typeof sendMail>[0]["kind"];
  dedupeRef?: string;
  storeId?: number | null;
  /** One-click unsubscribe target; appended to both HTML and plain text parts. */
  unsubscribeUrl?: string;
}): Promise<MailResult> {
  let html = options.template.html;
  let text = options.template.text;
  if (options.unsubscribeUrl) {
    const link = `<p style="margin:0 0 8px"><a href="${options.unsubscribeUrl}" style="color:#6b7280;text-decoration:underline">E-posta bildirimlerini kapat</a></p>`;
    html = html.replace(
      '<p style="margin:0">Bu e-posta',
      `${link}<p style="margin:0">Bu e-posta`,
    );
    text = `${text}\n\nBildirimleri kapat: ${options.unsubscribeUrl}`;
  }
  return sendMail({
    to: options.to,
    subject: options.template.subject,
    html,
    text,
    kind: options.kind,
    dedupeRef: options.dedupeRef,
    storeId: options.storeId ?? null,
  });
}
