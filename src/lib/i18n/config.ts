export type Locale = {
  code: string;
  name: string;
  nativeName: string;
  /** ISO-3166 alpha-2 code used to load the PNG flag from flagcdn. */
  flag: string;
  dir: "ltr" | "rtl";
};

/**
 * Every language the interface can be rendered in. `tr` and `en` are pinned to
 * the top of the list; the rest are sorted by native name. Translations that
 * are not shipped yet fall back to English (see dictionaries.ts).
 */
export const LOCALES: Locale[] = [
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "tr", dir: "ltr" },
  { code: "en", name: "English", nativeName: "English", flag: "gb", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "de", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", flag: "fr", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "es", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "it", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "pt", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "nl", dir: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "ru", dir: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "ua", dir: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "pl", dir: "ltr" },
  { code: "cs", name: "Czech", nativeName: "Čeština", flag: "cz", dir: "ltr" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina", flag: "sk", dir: "ltr" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", flag: "hu", dir: "ltr" },
  { code: "ro", name: "Romanian", nativeName: "Română", flag: "ro", dir: "ltr" },
  { code: "bg", name: "Bulgarian", nativeName: "Български", flag: "bg", dir: "ltr" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "gr", dir: "ltr" },
  { code: "sr", name: "Serbian", nativeName: "Српски", flag: "rs", dir: "ltr" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski", flag: "hr", dir: "ltr" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina", flag: "si", dir: "ltr" },
  { code: "bs", name: "Bosnian", nativeName: "Bosanski", flag: "ba", dir: "ltr" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски", flag: "mk", dir: "ltr" },
  { code: "sq", name: "Albanian", nativeName: "Shqip", flag: "al", dir: "ltr" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių", flag: "lt", dir: "ltr" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu", flag: "lv", dir: "ltr" },
  { code: "et", name: "Estonian", nativeName: "Eesti", flag: "ee", dir: "ltr" },
  { code: "fi", name: "Finnish", nativeName: "Suomi", flag: "fi", dir: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "se", dir: "ltr" },
  { code: "no", name: "Norwegian", nativeName: "Norsk", flag: "no", dir: "ltr" },
  { code: "da", name: "Danish", nativeName: "Dansk", flag: "dk", dir: "ltr" },
  { code: "is", name: "Icelandic", nativeName: "Íslenska", flag: "is", dir: "ltr" },
  { code: "ga", name: "Irish", nativeName: "Gaeilge", flag: "ie", dir: "ltr" },
  { code: "mt", name: "Maltese", nativeName: "Malti", flag: "mt", dir: "ltr" },
  { code: "ca", name: "Catalan", nativeName: "Català", flag: "es-ct", dir: "ltr" },
  { code: "eu", name: "Basque", nativeName: "Euskara", flag: "es", dir: "ltr" },
  { code: "gl", name: "Galician", nativeName: "Galego", flag: "es", dir: "ltr" },
  { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch", flag: "lu", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "sa", dir: "rtl" },
  { code: "fa", name: "Persian", nativeName: "فارسی", flag: "ir", dir: "rtl" },
  { code: "he", name: "Hebrew", nativeName: "עברית", flag: "il", dir: "rtl" },
  { code: "ur", name: "Urdu", nativeName: "اردو", flag: "pk", dir: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "in", dir: "ltr" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "bd", dir: "ltr" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "lk", dir: "ltr" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", flag: "in", dir: "ltr" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", flag: "in", dir: "ltr" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", flag: "in", dir: "ltr" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", flag: "in", dir: "ltr" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", flag: "np", dir: "ltr" },
  { code: "si", name: "Sinhala", nativeName: "සිංහල", flag: "lk", dir: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "cn", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "jp", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "kr", dir: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "vn", dir: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "th", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "id", dir: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "my", dir: "ltr" },
  { code: "fil", name: "Filipino", nativeName: "Filipino", flag: "ph", dir: "ltr" },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ", flag: "kh", dir: "ltr" },
  { code: "lo", name: "Lao", nativeName: "ລາວ", flag: "la", dir: "ltr" },
  { code: "my", name: "Burmese", nativeName: "မြန်မာ", flag: "mm", dir: "ltr" },
  { code: "mn", name: "Mongolian", nativeName: "Монгол", flag: "mn", dir: "ltr" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша", flag: "kz", dir: "ltr" },
  { code: "ky", name: "Kyrgyz", nativeName: "Кыргызча", flag: "kg", dir: "ltr" },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbekcha", flag: "uz", dir: "ltr" },
  { code: "tg", name: "Tajik", nativeName: "Тоҷикӣ", flag: "tj", dir: "ltr" },
  { code: "tk", name: "Turkmen", nativeName: "Türkmençe", flag: "tm", dir: "ltr" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca", flag: "az", dir: "ltr" },
  { code: "ka", name: "Georgian", nativeName: "ქართული", flag: "ge", dir: "ltr" },
  { code: "hy", name: "Armenian", nativeName: "Հայերեն", flag: "am", dir: "ltr" },
  { code: "be", name: "Belarusian", nativeName: "Беларуская", flag: "by", dir: "ltr" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans", flag: "za", dir: "ltr" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "ke", dir: "ltr" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", flag: "et", dir: "ltr" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "ng", dir: "ltr" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "ng", dir: "ltr" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "ng", dir: "ltr" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu", flag: "za", dir: "ltr" },
  { code: "so", name: "Somali", nativeName: "Soomaali", flag: "so", dir: "ltr" },
  { code: "eo", name: "Esperanto", nativeName: "Esperanto", flag: "eu", dir: "ltr" },
];

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE = "tr";
export const LOCALE_COOKIE = "locale";

export function findLocale(code: string | null | undefined): Locale | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  return (
    LOCALES.find((locale) => locale.code === normalized) ??
    LOCALES.find((locale) => normalized.startsWith(`${locale.code}-`) || localizedBase(normalized) === locale.code) ??
    null
  );
}

function localizedBase(code: string): string {
  return code.split("-")[0].split("_")[0];
}

/** Accept-Language negotiation with graceful fallback to the site default. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return findLocale(DEFAULT_LOCALE)!;
  const entries = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim(), quality: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.quality - a.quality);
  for (const entry of entries) {
    const locale = findLocale(localizedBase(entry.tag.toLowerCase()));
    if (locale) return locale;
  }
  return findLocale(DEFAULT_LOCALE)!;
}

/**
 * Flags ship as bundled SVGs (`scripts/flags.mjs` copies them into
 * `public/flags`): crisp on every display density and no third-party request.
 * `size` is kept for call sites that only want the natural aspect ratio.
 */
export function flagUrl(flag: string, size: "w20" | "w40" | "w80" = "w40"): string {
  void size;
  return `/flags/${flag.toLowerCase()}.svg`;
}
