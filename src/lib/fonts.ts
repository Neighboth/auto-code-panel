export type PlatformPreset = {
  id: string;
  label: string;
  kind: "steam" | "generic";
  icon: string;
  hint: string;
};

export const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: "steam", label: "Steam", kind: "steam", icon: "steam", hint: "Steam Guard / paylaşımlı hesap" },
  { id: "openai", label: "OpenAI", kind: "generic", icon: "sparkles", hint: "ChatGPT / API erişimi" },
  { id: "netflix", label: "Netflix", kind: "generic", icon: "play", hint: "Profil bazlı erişim" },
  { id: "spotify", label: "Spotify", kind: "generic", icon: "music", hint: "Premium / aile planı" },
  { id: "riot", label: "Riot Games", kind: "generic", icon: "gamepad", hint: "Valorant / LoL hesapları" },
  { id: "custom", label: "Custom (Özel Platform)", kind: "generic", icon: "box", hint: "Kendi platform adınızı girin" },
];

export const PLATFORM_LABELS: Record<string, string> = PLATFORM_PRESETS.reduce<Record<string, string>>(
  (acc, preset) => {
    acc[preset.id] = preset.label;
    return acc;
  },
  {},
);

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
