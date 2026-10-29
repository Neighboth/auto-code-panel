/**
 * Mailbox presets shared by the client form and the server-side IMAP reader.
 * This module must stay dependency free: it is imported by client components.
 */
export type MailProvider = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
};

/** Auto-configuration presets so the store owner does not need server details. */
export const MAIL_PRESETS: MailProvider[] = [
  { id: "gmail", label: "Gmail / Google Workspace", host: "imap.gmail.com", port: 993, secure: true },
  { id: "outlook", label: "Outlook / Hotmail / Live", host: "outlook.office365.com", port: 993, secure: true },
  { id: "yandex", label: "Yandex Mail", host: "imap.yandex.com", port: 993, secure: true },
  { id: "icloud", label: "iCloud Mail", host: "imap.mail.me.com", port: 993, secure: true },
  { id: "zoho", label: "Zoho Mail", host: "imap.zoho.com", port: 993, secure: true },
  { id: "proton", label: "ProtonMail Bridge", host: "127.0.0.1", port: 1143, secure: false },
  { id: "custom", label: "Özel IMAP sunucusu", host: "", port: 993, secure: true },
];

export function resolveMailPreset(id: string | null | undefined): MailProvider {
  return MAIL_PRESETS.find((preset) => preset.id === id) ?? MAIL_PRESETS[0];
}
