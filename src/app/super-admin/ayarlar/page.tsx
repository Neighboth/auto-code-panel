import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, Database, Globe2, KeyRound } from "lucide-react";
import { getSuperSession } from "@/lib/session";
import { getPlatformSettings } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { PlatformSettingsForm } from "@/components/super-admin/panels";
import { FactorSettings } from "@/components/security/factor-settings";
import { coverageSummary } from "@/lib/i18n/coverage";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.sistem-ayarlar") };
}

export default async function SystemSettingsPage() {
  const { t } = await getTranslator();
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const settings = await getPlatformSettings();
  const coverage = coverageSummary();
  const coverageGroups = (["full", "core", "english"] as const).map((status) => ({
    status,
    label: status === "full" ? t("x.tam-ceviri") : status === "core" ? t("x.cekirdek-musteri-arayuzu") : t("x.ingilizceye-dusuyor"),
    locales: coverage.rows.filter((row) => row.status === status),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.sistem-ayarlar")}</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">{" "}{t("x.platform-yaplandrmas")}</h1>
        <p className="mt-1 text-[12.5px] muted">{t("x.marka-bilgileri-global-sure-uzatma-linki-ve-bayilere-gos")}</p>
      </div>

      <PlatformSettingsForm
        renewalUrl={env.renewalUrl}
        supportEmail={env.supportEmail}
        defaultPlanNote={settings.defaultPlanNote}
        envRenewalUrl={env.renewalUrl}
        envSupportEmail={env.supportEmail}
      />

      <FactorSettings slug="" subjectType="super" rpName={brand.name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Globe2 size={15} />
            <h2 className="text-[13.5px] font-semibold">{t("x.yonlendirme")}</h2>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed muted">
            {t("x.sites-tantm-sitesi-reseller-aktivasyon-admin-platform-yo", { sites: "/", reseller: "/bayi", admin: "/super-admin", store: "/:magazaSlug" })}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <Link href="/bayi" className="badge">
              /bayi
            </Link>
            <Link href="/super-admin" className="badge">
              /super-admin
            </Link>
            <span className="badge">/:magazaSlug</span>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Database size={15} />
            <h2 className="text-[13.5px] font-semibold">{t("x.veritaban")}</h2>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed muted">{t("x.aktif-surucu")}<span className="mono font-medium" style={{ color: "var(--fg)" }}>SQLite</span> ·
            Drizzle ORM. Dosya yolu <span className="mono">SQLITE_PATH</span>{t("x.ortam-degiskeninden-okunur-tum-tenant-tablolar-store-id")}</p>
          <p className="mt-2 text-[11.5px] muted">{t("x.kimlik-bilgileri-marka-ad-ve-sure-uzatma-linki-json-dosy")}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Globe2 size={15} />
          <h2 className="text-[13.5px] font-semibold">{" "}{t("x.dil-kapsam")}</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">
          {t("x.languages-dil-listeleniyor-referans-keys-anahtar-cekirde", { languages: coverage.total, keys: coverage.referenceKeys, core: coverage.coreKeys })}{" "}
          {t("x.kapsam-cmd-ile-de-gorebilirsiniz", { cmd: "npm run i18n:coverage" })}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {coverageGroups.map((group) => (
            <div key={group.status} className="rounded-lg border p-3 hairline">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] muted">{group.label}</p>
              <p className="mt-1 text-[19px] font-semibold tabular-nums">{group.locales.length}</p>
              <p className="mt-1 line-clamp-3 text-[11px] muted">
                {group.locales.slice(0, 24).map((row) => row.code).join(", ") || "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Clock3 size={15} />
          <h2 className="text-[13.5px] font-semibold">{" "}{t("x.lisans-hatrlatma-gorevi")}</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">{t("x.bayilik-suresi-dolmadan-3-ve-1-gun-once-hatrlatma-e-post")}<span className="mono mx-1">mail_events</span>{t("x.ile-tekillestirilir-saatte-bir-calstrmak-guvenlidir-ve-m")}</p>
        <pre className="mono mt-3 overflow-x-auto rounded-lg border p-3 text-[11.5px] hairline scroll-thin" style={{ background: "var(--bg)" }}>
          GET /api/cron/reminders?secret=$CRON_SECRET
        </pre>
        <p className="mt-2 text-[11.5px] muted">{" "}{t("x.onerilen-sklk-saatte-bir-veya-gunde-bir-sabah")}</p>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <KeyRound size={15} />
          <h2 className="text-[13.5px] font-semibold">{" "}{t("x.steam-otomatik-senkronizasyon-gorevi")}</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">{t("x.auto-sync-isaretli-urunler-icin-zamanlanms-gorev-asagdak")}<span className="mono mx-1">CRON_SECRET</span>{t("x.ortam-degiskeni-tanmlanmaldr")}</p>
        <pre className="mono mt-3 overflow-x-auto rounded-lg border p-3 text-[11.5px] hairline scroll-thin" style={{ background: "var(--bg)" }}>
          GET /api/cron/steam-sync?secret=$CRON_SECRET
        </pre>
        <p className="mt-2 text-[11.5px] muted">{t("x.onerilen-sklk-6-saatte-bir-steam-store-api-ucretsiz-ve-a")}<span className="mono mx-1">cc=tr&amp;l=turkish</span>{t("x.parametreleriyle-cekilir")}</p>
      </div>
    </div>
  );
}
