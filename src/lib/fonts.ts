export type PlatformPreset = {
  id: string;
  label: string;
  kind: "steam" | "generic";
  icon: string;
  hint: string;
  group: string;
};

/**
 * Accounts are not Steam-only: the platform sells ChatGPT, streaming, design
 * tools, game launchers and more. `kind` only decides which guard options the
 * form offers (Steam Guard vs. standard TOTP).
 */
export const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: "steam", label: "Steam", kind: "steam", icon: "steam", hint: "x.steam-guard-paylasml-hesap", group: "x.grup-oyun" },
  { id: "epic", label: "Epic Games", kind: "generic", icon: "gamepad", hint: "x.epic-hesab", group: "x.grup-oyun" },
  { id: "riot", label: "Riot Games", kind: "generic", icon: "gamepad", hint: "x.valorant-lol-hesaplar", group: "x.grup-oyun" },
  { id: "battlenet", label: "Battle.net", kind: "generic", icon: "gamepad", hint: "x.blizzard-hesaplar", group: "x.grup-oyun" },
  { id: "ea", label: "EA / Origin", kind: "generic", icon: "gamepad", hint: "x.ea-app-hesaplar", group: "x.grup-oyun" },
  { id: "ubisoft", label: "Ubisoft Connect", kind: "generic", icon: "gamepad", hint: "x.ubisoft-hesaplar", group: "x.grup-oyun" },
  { id: "xbox", label: "Xbox / Microsoft", kind: "generic", icon: "gamepad", hint: "x.game-pass-xbox-hesaplar", group: "x.grup-oyun" },
  { id: "playstation", label: "PlayStation Network", kind: "generic", icon: "gamepad", hint: "x.psn-hesaplar", group: "x.grup-oyun" },
  { id: "nintendo", label: "Nintendo", kind: "generic", icon: "gamepad", hint: "x.nintendo-switch-hesaplar", group: "x.grup-oyun" },
  { id: "minecraft", label: "Minecraft", kind: "generic", icon: "gamepad", hint: "x.mojang-microsoft-hesaplar", group: "x.grup-oyun" },
  { id: "roblox", label: "Roblox", kind: "generic", icon: "gamepad", hint: "x.roblox-hesaplar", group: "x.grup-oyun" },
  { id: "rockstar", label: "Rockstar", kind: "generic", icon: "gamepad", hint: "x.gta-rdr-hesaplar", group: "x.grup-oyun" },
  { id: "hoyoverse", label: "HoYoverse", kind: "generic", icon: "gamepad", hint: "Genshin / HSR / ZZZ", group: "x.grup-oyun" },
  { id: "supercell", label: "Supercell", kind: "generic", icon: "gamepad", hint: "x.clash-brawl-hesaplar", group: "x.grup-oyun" },
  { id: "openai", label: "OpenAI / ChatGPT", kind: "generic", icon: "sparkles", hint: "ChatGPT Plus / API", group: "x.grup-yapay-zeka" },
  { id: "anthropic", label: "Anthropic Claude", kind: "generic", icon: "sparkles", hint: "x.claude-pro-hesaplar", group: "x.grup-yapay-zeka" },
  { id: "gemini", label: "Google Gemini", kind: "generic", icon: "sparkles", hint: "Gemini Advanced", group: "x.grup-yapay-zeka" },
  { id: "midjourney", label: "Midjourney", kind: "generic", icon: "sparkles", hint: "x.midjourney-planlar", group: "x.grup-yapay-zeka" },
  { id: "perplexity", label: "Perplexity", kind: "generic", icon: "sparkles", hint: "Perplexity Pro", group: "x.grup-yapay-zeka" },
  { id: "copilot", label: "Microsoft Copilot", kind: "generic", icon: "sparkles", hint: "Copilot Pro", group: "x.grup-yapay-zeka" },
  { id: "netflix", label: "Netflix", kind: "generic", icon: "play", hint: "x.profil-bazl-erisim", group: "x.yayn" },
  { id: "disney", label: "Disney+", kind: "generic", icon: "play", hint: "x.disney-hesaplar", group: "x.yayn" },
  { id: "primevideo", label: "Amazon Prime Video", kind: "generic", icon: "play", hint: "Prime Video", group: "x.yayn" },
  { id: "hbo", label: "HBO Max", kind: "generic", icon: "play", hint: "x.hbo-max-hesaplar", group: "x.yayn" },
  { id: "spotify", label: "Spotify", kind: "generic", icon: "music", hint: "x.premium-aile-plan", group: "x.muzik" },
  { id: "apple", label: "Apple Music / TV", kind: "generic", icon: "music", hint: "Apple servisleri", group: "x.muzik" },
  { id: "youtube", label: "YouTube Premium", kind: "generic", icon: "play", hint: "Premium / Music", group: "x.yayn" },
  { id: "adobe", label: "Adobe Creative Cloud", kind: "generic", icon: "box", hint: "Photoshop / CC", group: "x.yazlm" },
  { id: "canva", label: "Canva Pro", kind: "generic", icon: "box", hint: "Canva ekipleri", group: "x.yazlm" },
  { id: "office", label: "Microsoft 365", kind: "generic", icon: "box", hint: "Office / OneDrive", group: "x.yazlm" },
  { id: "capcut", label: "CapCut Pro", kind: "generic", icon: "box", hint: "x.capcut-hesaplar", group: "x.yazlm" },
  { id: "vpn", label: "VPN / Proxy", kind: "generic", icon: "shield", hint: "NordVPN, ExpressVPN…", group: "x.yazlm" },
  { id: "iptv", label: "IPTV", kind: "generic", icon: "play", hint: "IPTV abonelikleri", group: "x.yayn" },
  { id: "duolingo", label: "Duolingo", kind: "generic", icon: "box", hint: "Duolingo Plus", group: "x.egitim" },
  { id: "coursera", label: "Coursera / Udemy", kind: "generic", icon: "box", hint: "x.egitim-hesaplar", group: "x.egitim" },
  { id: "linkedin", label: "LinkedIn", kind: "generic", icon: "box", hint: "LinkedIn Premium", group: "x.egitim" },
  { id: "custom", label: "x.ozel-platform", kind: "generic", icon: "box", hint: "x.kendi-platform-adnz-girin", group: "x.diger" },
];

export const PLATFORM_GROUPS = Array.from(new Set(PLATFORM_PRESETS.map((preset) => preset.group)));

export const PLATFORM_LABELS: Record<string, string> = PLATFORM_PRESETS.reduce<Record<string, string>>(
  (acc, preset) => {
    acc[preset.id] = preset.label;
    return acc;
  },
  {},
);

/** Guard mechanisms an inventory account can expose. */
export const GUARD_OPTIONS = [
  { id: "none", label: "x.korumasz", hint: "x.2fa-guard-yok-sadece-kullanc-ad-sifre" },
  { id: "steam_guard", label: "x.steam-guard-mobil-authenticator", hint: "x.base64-shared-secret-ile-5-haneli-kod" },
  { id: "totp", label: "x.standart-2fa-totp", hint: "x.google-authenticator-uyumlu-6-haneli-kod" },
  { id: "email", label: "x.e-posta-imap-dogrulamas", hint: "x.kod-bagl-mail-kutusundan-okunur" },
  { id: "steam_guard_email", label: "x.steam-guard-e-posta-imap", hint: "x.guard-kodu-ve-mail-kodu-birlikte" },
  { id: "totp_email", label: "x.totp-e-posta-imap", hint: "x.authenticator-kodu-ve-mail-kodu-birlikte" },
] as const;

export type GuardType = (typeof GUARD_OPTIONS)[number]["id"];

export function guardHasSteam(guard: string): boolean {
  return guard === "steam_guard" || guard === "steam_guard_email";
}

export function guardHasTotp(guard: string): boolean {
  return guard === "totp" || guard === "totp_email";
}

export function guardHasEmail(guard: string): boolean {
  return guard === "email" || guard === "steam_guard_email" || guard === "totp_email";
}

export type { FontOption } from "@/lib/font-catalog";
export {
  FONT_CATALOG,
  FONT_CATEGORIES,
  FONT_COUNT,
  FONT_OPTIONS,
} from "@/lib/font-catalog";
export {
  FONT_LIBRARY,
  FONT_LIBRARY_COUNT,
  FONTSHARE_FONTS,
  familyStylesheet,
  fontProvider,
  googleFontHref,
  isSupportedFont,
  previewStylesheets,
  providerLabel,
  type CatalogFont,
  type FontProvider,
} from "@/lib/font-providers";
