import { ImapFlow } from "imapflow";
import { MAIL_PRESETS, resolveMailPreset, type MailProvider } from "@/lib/mail-presets";

export { MAIL_PRESETS, resolveMailPreset };
export type { MailProvider };

/**
 * Fetches verification codes from a mailbox over IMAP.
 *
 * Steam (and many other services) send guard/verification codes by e-mail when
 * "e-mail confirmation" is enabled on the account. Stores can bind the mailbox
 * of an account and read only the freshest matching message.
 */

/**
 * Most guards use a 5-6 char alphanumeric code, usually wrapped in angle
 * brackets in the HTML/text body: `>AB12C<` or `>A1B2C3<`.
 * The requested expression plus a few common alternatives are applied; the
 * newest matching message wins.
 */
export const DEFAULT_MAIL_CODE_REGEX =
  ">(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\\d)[A-Z0-9]{5,6}<";

const FALLBACK_PATTERNS: RegExp[] = [
  /\b([A-Z0-9]{5})\b/g,
  /\b([A-Z0-9]{6})\b/g,
  /\b(\d{6})\b/g,
];

export type MailCodeResult =
  | {
      ok: true;
      code: string;
      subject: string;
      from: string;
      receivedAt: string;
      snippet: string;
    }
  | { ok: false; message: string };

function normalizeText(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractCode(raw: string, customPattern?: string): string | null {
  const patterns: RegExp[] = [];
  if (customPattern) {
    try {
      patterns.push(new RegExp(customPattern, "g"));
    } catch {
      /* invalid custom regex is ignored */
    }
  }
  patterns.push(new RegExp(DEFAULT_MAIL_CODE_REGEX, "g"));
  for (const pattern of patterns) {
    const matches = Array.from(raw.matchAll(pattern)).map((match) =>
      (match[1] ?? match[0]).replace(/[<>]/g, "").trim(),
    );
    const candidate = matches.find((value) => /^[A-Z0-9]{5,6}$/i.test(value) && /\d/.test(value));
    if (candidate) return candidate.toUpperCase();
  }
  const text = normalizeText(raw);
  for (const pattern of FALLBACK_PATTERNS) {
    const matches = Array.from(text.matchAll(pattern)).map((match) => match[1]);
    if (matches.length > 0) return matches[matches.length - 1].toUpperCase();
  }
  return null;
}

export async function fetchLatestMailCode(options: {
  email: string;
  password: string;
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  pattern?: string | null;
  senderFilter?: string | null;
  sinceMinutes?: number;
}): Promise<MailCodeResult> {
  if (!options.email || !options.password) {
    return { ok: false, message: "Mail adresi ve uygulama şifresi zorunludur." };
  }
  const host = options.host?.trim() || "imap.gmail.com";
  const port = options.port ?? 993;
  const client = new ImapFlow({
    host,
    port,
    secure: options.secure ?? port === 993,
    auth: { user: options.email, pass: options.password },
    logger: false,
    tls: { rejectUnauthorized: false },
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
  });

  try {
    await client.connect();
  } catch (error) {
    return {
      ok: false,
      message: `IMAP bağlantısı kurulamadı (${host}:${port}). Sunucu bilgilerini ve uygulama şifresini kontrol edin. ${(error as Error).message.slice(0, 120)}`,
    };
  }

  const since = new Date(Date.now() - Math.max(5, options.sinceMinutes ?? 30) * 60_000);
  const sender = options.senderFilter?.trim().toLowerCase() ?? "";

  try {
    const mailbox = await client.mailboxOpen("INBOX");
    if (!mailbox || mailbox.exists === 0) {
      return { ok: false, message: "Posta kutusu boş görünüyor." };
    }
    const searchCriteria = { since, ...(sender ? { from: sender } : {}) } as {
      since: Date;
      from?: string;
    };
    const uids = await client.search(searchCriteria, { uid: true });
    const candidates = (uids || []).slice(-12).reverse();
    if (candidates.length === 0) {
      return {
        ok: false,
        message: sender
          ? `Son ${options.sinceMinutes ?? 30} dakikada "${sender}" adresinden mail bulunamadı.`
          : `Son ${options.sinceMinutes ?? 30} dakikada mail bulunamadı.`,
      };
    }
    for await (const message of client.fetch(
      candidates,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      const envelope = message.envelope;
      const source = message.source ? message.source.toString("utf8") : "";
      const code = extractCode(source, options.pattern ?? undefined);
      if (!code) continue;
      return {
        ok: true,
        code,
        subject: envelope?.subject ?? "",
        from: envelope?.from?.[0]?.address ?? "",
        receivedAt: new Date(envelope?.date ?? Date.now()).toISOString(),
        snippet: normalizeText(source).slice(0, 180),
      };
    }
    return {
      ok: false,
      message: "Yeni mailler bulundu ancak içinde geçerli bir doğrulama kodu algılanamadı.",
    };
  } catch (error) {
    return { ok: false, message: `Mail okunamadı: ${(error as Error).message.slice(0, 140)}` };
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
