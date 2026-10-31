import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";

/**
 * Pricing tiers of the marketing site.
 *
 * The data lives in SQLite so the platform owner can change a price, a duration,
 * a feature list or the purchase link from the super-admin panel without a
 * deploy. Per-locale overrides are optional: a plan with no translation for the
 * active language falls back to its base text, which is what `resolvePlan` does.
 */
export type PlanTranslation = { name?: string; description?: string; features?: string[] };

export type Plan = {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  durationDays: number | null;
  accountLimit: number | null;
  features: string[];
  purchaseUrl: string;
  highlight: boolean;
  active: boolean;
  sortOrder: number;
  translations: Record<string, PlanTranslation>;
};

/** Seed used the first time the panel is opened (mirrors the old hardcoded cards). */
export const DEFAULT_PLANS: Omit<Plan, "id">[] = [
  {
    name: "Başlangıç",
    description: "",
    price: "249",
    currency: "TRY",
    durationDays: 30,
    accountLimit: 40,
    features: ["Tek mağaza", "Steam auto-sync", "2FA / Steam Guard kodu", "Kod sihirbazı"],
    purchaseUrl: "/bayi",
    highlight: false,
    active: true,
    sortOrder: 1,
    translations: {
      en: {
        name: "Starter",
        features: ["Single store", "Steam auto-sync", "2FA / Steam Guard codes", "Code wizard"],
      },
    },
  },
  {
    name: "Profesyonel",
    description: "",
    price: "599",
    currency: "TRY",
    durationDays: 90,
    accountLimit: 150,
    features: [
      "Tek mağaza + özel slug",
      "Steam auto-sync ve cron",
      "Müşteri kütüphanesi",
      "Font ve tema özelleştirme",
      "Süre uzatma önceliği",
    ],
    purchaseUrl: "/bayi",
    highlight: true,
    active: true,
    sortOrder: 2,
    translations: {
      en: {
        name: "Professional",
        features: [
          "Single store + custom slug",
          "Steam auto-sync and cron",
          "Customer library",
          "Font and theme customization",
          "Renewal priority",
        ],
      },
    },
  },
  {
    name: "Ölçek",
    description: "",
    price: "1899",
    currency: "TRY",
    durationDays: 365,
    accountLimit: null,
    features: [
      "Sınırsız envanter",
      "500'lük toplu kod üretimi",
      "Kullanılmış kod detay raporu",
      "Öncelikli destek",
    ],
    purchaseUrl: "/bayi",
    highlight: false,
    active: true,
    sortOrder: 3,
    translations: {
      en: {
        name: "Scale",
        features: [
          "Unlimited inventory",
          "Bulk generation up to 500 codes",
          "Used-code detail report",
          "Priority support",
        ],
      },
    },
  },
];

function toPlan(row: typeof plans.$inferSelect): Plan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    durationDays: row.durationDays ?? null,
    accountLimit: row.accountLimit ?? null,
    features: Array.isArray(row.features) ? row.features : [],
    purchaseUrl: row.purchaseUrl,
    highlight: Boolean(row.highlight),
    active: Boolean(row.active),
    sortOrder: row.sortOrder,
    translations: (row.translations ?? {}) as Record<string, PlanTranslation>,
  };
}

/** Plans ordered for display; seeds the defaults on a fresh database. */
export async function listPlans(options: { includeInactive?: boolean } = {}): Promise<Plan[]> {
  const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.id));
  if (rows.length === 0) {
    await db.insert(plans).values(
      DEFAULT_PLANS.map((plan) => ({
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        durationDays: plan.durationDays,
        accountLimit: plan.accountLimit,
        features: plan.features,
        purchaseUrl: plan.purchaseUrl,
        highlight: plan.highlight,
        active: plan.active,
        sortOrder: plan.sortOrder,
        translations: plan.translations,
      })),
    );
    const seeded = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.id));
    return seeded.map(toPlan);
  }
  const mapped = rows.map(toPlan);
  return options.includeInactive ? mapped : mapped.filter((plan) => plan.active);
}

export async function getPlan(id: number): Promise<Plan | null> {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ? toPlan(row) : null;
}

/**
 * Text of a plan in the reader's language.
 *
 * `translations[locale]` wins, then a base-language match (Turkish), then the
 * plain fields — a new language never shows an empty card.
 */
export function resolvePlan(plan: Plan, locale: string): { name: string; description: string; features: string[] } {
  const code = (locale || "tr").split("-")[0];
  const override = plan.translations[code];
  return {
    name: override?.name?.trim() || plan.name,
    description: override?.description?.trim() || plan.description,
    features:
      override?.features && override.features.length > 0
        ? override.features.filter((item) => item.trim().length > 0)
        : plan.features,
  };
}
