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
  { id: "steam", label: "Steam", kind: "steam", icon: "steam", hint: "x.steam-guard-paylasml-hesap", group: "Oyun" },
  { id: "epic", label: "Epic Games", kind: "generic", icon: "gamepad", hint: "x.epic-hesab", group: "Oyun" },
  { id: "riot", label: "Riot Games", kind: "generic", icon: "gamepad", hint: "x.valorant-lol-hesaplar", group: "Oyun" },
  { id: "battlenet", label: "Battle.net", kind: "generic", icon: "gamepad", hint: "x.blizzard-hesaplar", group: "Oyun" },
  { id: "ea", label: "EA / Origin", kind: "generic", icon: "gamepad", hint: "x.ea-app-hesaplar", group: "Oyun" },
  { id: "ubisoft", label: "Ubisoft Connect", kind: "generic", icon: "gamepad", hint: "x.ubisoft-hesaplar", group: "Oyun" },
  { id: "xbox", label: "Xbox / Microsoft", kind: "generic", icon: "gamepad", hint: "x.game-pass-xbox-hesaplar", group: "Oyun" },
  { id: "playstation", label: "PlayStation Network", kind: "generic", icon: "gamepad", hint: "x.psn-hesaplar", group: "Oyun" },
  { id: "nintendo", label: "Nintendo", kind: "generic", icon: "gamepad", hint: "x.nintendo-switch-hesaplar", group: "Oyun" },
  { id: "minecraft", label: "Minecraft", kind: "generic", icon: "gamepad", hint: "x.mojang-microsoft-hesaplar", group: "Oyun" },
  { id: "roblox", label: "Roblox", kind: "generic", icon: "gamepad", hint: "x.roblox-hesaplar", group: "Oyun" },
  { id: "rockstar", label: "Rockstar", kind: "generic", icon: "gamepad", hint: "x.gta-rdr-hesaplar", group: "Oyun" },
  { id: "hoyoverse", label: "HoYoverse", kind: "generic", icon: "gamepad", hint: "Genshin / HSR / ZZZ", group: "Oyun" },
  { id: "supercell", label: "Supercell", kind: "generic", icon: "gamepad", hint: "x.clash-brawl-hesaplar", group: "Oyun" },
  { id: "openai", label: "OpenAI / ChatGPT", kind: "generic", icon: "sparkles", hint: "ChatGPT Plus / API", group: "Yapay zekâ" },
  { id: "anthropic", label: "Anthropic Claude", kind: "generic", icon: "sparkles", hint: "x.claude-pro-hesaplar", group: "Yapay zekâ" },
  { id: "gemini", label: "Google Gemini", kind: "generic", icon: "sparkles", hint: "Gemini Advanced", group: "Yapay zekâ" },
  { id: "midjourney", label: "Midjourney", kind: "generic", icon: "sparkles", hint: "x.midjourney-planlar", group: "Yapay zekâ" },
  { id: "perplexity", label: "Perplexity", kind: "generic", icon: "sparkles", hint: "Perplexity Pro", group: "Yapay zekâ" },
  { id: "copilot", label: "Microsoft Copilot", kind: "generic", icon: "sparkles", hint: "Copilot Pro", group: "Yapay zekâ" },
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

export type FontOption = { family: string; category: string };

/**
 * Google Fonts ailesinden seçilmiş, latin-ext desteği yüksek aileler. Seçim
 * yapıldığında mağaza arayüzü Google Fonts CDN üzerinden canlı önizlemeli
 * olarak yüklenir.
 */
export const FONT_OPTIONS: FontOption[] = [
  { family: "Inter", category: "Sans Serif" },
  { family: "DM Sans", category: "Sans Serif" },
  { family: "Manrope", category: "Sans Serif" },
  { family: "Plus Jakarta Sans", category: "Sans Serif" },
  { family: "Work Sans", category: "Sans Serif" },
  { family: "Rubik", category: "Sans Serif" },
  { family: "Montserrat", category: "Sans Serif" },
  { family: "Poppins", category: "Sans Serif" },
  { family: "Archivo", category: "Sans Serif" },
  { family: "Barlow", category: "Sans Serif" },
  { family: "Cabin", category: "Sans Serif" },
  { family: "Figtree", category: "Sans Serif" },
  { family: "Karla", category: "Sans Serif" },
  { family: "Lato", category: "Sans Serif" },
  { family: "Libre Franklin", category: "Sans Serif" },
  { family: "Mulish", category: "Sans Serif" },
  { family: "Nunito Sans", category: "Sans Serif" },
  { family: "Open Sans", category: "Sans Serif" },
  { family: "Outfit", category: "Sans Serif" },
  { family: "Public Sans", category: "Sans Serif" },
  { family: "Raleway", category: "Sans Serif" },
  { family: "Roboto", category: "Sans Serif" },
  { family: "Source Sans 3", category: "Sans Serif" },
  { family: "Space Grotesk", category: "Sans Serif" },
  { family: "Sora", category: "Sans Serif" },
  { family: "Urbanist", category: "Sans Serif" },
  { family: "Nunito", category: "Sans Serif" },
  { family: "Quicksand", category: "Sans Serif" },
  { family: "Josefin Sans", category: "Sans Serif" },
  { family: "Albert Sans", category: "Sans Serif" },
  { family: "Be Vietnam Pro", category: "Sans Serif" },
  { family: "Epilogue", category: "Sans Serif" },
  { family: "Hanken Grotesk", category: "Sans Serif" },
  { family: "Instrument Sans", category: "Sans Serif" },
  { family: "Onest", category: "Sans Serif" },
  { family: "Red Hat Display", category: "Sans Serif" },
  { family: "Schibsted Grotesk", category: "Sans Serif" },
  { family: "Geist", category: "Sans Serif" },
  { family: "Titillium Web", category: "Sans Serif" },
  { family: "Ubuntu", category: "Sans Serif" },
  { family: "PT Sans", category: "Sans Serif" },
  { family: "Noto Sans", category: "Sans Serif" },
  { family: "Inter Tight", category: "Sans Serif" },
  { family: "Playfair Display", category: "Serif" },
  { family: "Merriweather", category: "Serif" },
  { family: "Lora", category: "Serif" },
  { family: "Cormorant Garamond", category: "Serif" },
  { family: "Libre Baskerville", category: "Serif" },
  { family: "DM Serif Display", category: "Serif" },
  { family: "Source Serif 4", category: "Serif" },
  { family: "Crimson Pro", category: "Serif" },
  { family: "EB Garamond", category: "Serif" },
  { family: "Bitter", category: "Serif" },
  { family: "Roboto Slab", category: "Serif" },
  { family: "Zilla Slab", category: "Serif" },
  { family: "JetBrains Mono", category: "Monospace" },
  { family: "Fira Code", category: "Monospace" },
  { family: "IBM Plex Mono", category: "Monospace" },
  { family: "Space Mono", category: "Monospace" },
  { family: "Inconsolata", category: "Monospace" },
  { family: "Roboto Mono", category: "Monospace" },
  { family: "Source Code Pro", category: "Monospace" },
  { family: "Oswald", category: "Display" },
  { family: "Bebas Neue", category: "Display" },
  { family: "Anton", category: "Display" },
  { family: "Syne", category: "Display" },
  { family: "Unbounded", category: "Display" },
  { family: "Righteous", category: "Display" },
  { family: "Chakra Petch", category: "Display" },
  { family: "Rajdhani", category: "Display" },
  { family: "Michroma", category: "Display" },
  { family: "Audiowide", category: "Display" },
  { family: "Orbitron", category: "Display" },
  { family: "Russo One", category: "Display" },
  { family: "Teko", category: "Display" },
  { family: "Oxanium", category: "Display" },
  { family: "Big Shoulders Display", category: "Display" },
  { family: "Archivo Black", category: "Display" },
];

export function googleFontHref(families: string[]): string {
  const unique = Array.from(new Set(families.filter(Boolean))).slice(0, 6);
  if (unique.length === 0) return "";
  const params = unique
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
