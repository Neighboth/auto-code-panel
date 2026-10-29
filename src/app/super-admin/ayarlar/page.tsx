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

export const dynamic = "force-dynamic";
export const metadata = { title: "Sistem Ayarları" };

export default async function SystemSettingsPage() {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const settings = await getPlatformSettings();
  const coverage = coverageSummary();
  const coverageGroups = (["full", "core", "english"] as const).map((status) => ({
    status,
    label: status === "full" ? "Tam çeviri" : status === "core" ? "Çekirdek (müşteri arayüzü)" : "İngilizceye düşüyor",
    locales: coverage.rows.filter((row) => row.status === status),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">Sistem ayarları</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">Platform yapılandırması</h1>
        <p className="mt-1 text-[12.5px] muted">
          Marka bilgileri, global süre uzatma linki ve bayilere gösterilen bilgilendirme metni.
        </p>
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
            <h2 className="text-[13.5px] font-semibold">Yönlendirme</h2>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed muted">
            <span className="mono">/</span> tanıtım sitesi, <span className="mono">/bayi</span> aktivasyon,
            <span className="mono"> /super-admin</span> platform yönetimi ve{" "}
            <span className="mono">/:magazaSlug</span> bayi vitrinidir.
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
            <h2 className="text-[13.5px] font-semibold">Veritabanı</h2>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed muted">
            Aktif sürücü: <span className="mono font-medium" style={{ color: "var(--fg)" }}>SQLite</span> ·
            Drizzle ORM. Dosya yolu <span className="mono">SQLITE_PATH</span> ortam değişkeninden okunur.
            Tüm tenant tabloları store_id ile izole edilir.
          </p>
          <p className="mt-2 text-[11.5px] muted">
            Kimlik bilgileri, marka adı ve süre uzatma linki JSON dosyası yerine ortam değişkenleriyle yönetilir.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <Globe2 size={15} />
          <h2 className="text-[13.5px] font-semibold">Dil kapsamı</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">
          {coverage.total} dil listeleniyor · referans {coverage.referenceKeys} anahtar · çekirdek paket{" "}
          {coverage.coreKeys} anahtar. Eksik anahtarlar İngilizceye düşer; ham anahtar adı asla görünmez.
          Kapsamı <span className="mono">npm run i18n:coverage</span> ile de görebilirsiniz.
        </p>
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
          <h2 className="text-[13.5px] font-semibold">Lisans hatırlatma görevi</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">
          Bayilik süresi dolmadan 3 ve 1 gün önce hatırlatma e-postası gönderen uç nokta. Gönderim
          <span className="mono mx-1">mail_events</span> ile tekilleştirilir; saatte bir çalıştırmak
          güvenlidir ve mükerrer e-posta üretmez.
        </p>
        <pre className="mono mt-3 overflow-x-auto rounded-lg border p-3 text-[11.5px] hairline scroll-thin" style={{ background: "var(--bg)" }}>
          GET /api/cron/reminders?secret=$CRON_SECRET
        </pre>
        <p className="mt-2 text-[11.5px] muted">Önerilen sıklık: saatte bir (veya günde bir sabah).</p>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2">
          <KeyRound size={15} />
          <h2 className="text-[13.5px] font-semibold">Steam otomatik senkronizasyon görevi</h2>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">
          Auto-Sync işaretli ürünler için zamanlanmış görev aşağıdaki uç noktayı çağırır. Üretimde
          <span className="mono mx-1">CRON_SECRET</span> ortam değişkeni tanımlanmalıdır.
        </p>
        <pre className="mono mt-3 overflow-x-auto rounded-lg border p-3 text-[11.5px] hairline scroll-thin" style={{ background: "var(--bg)" }}>
          GET /api/cron/steam-sync?secret=$CRON_SECRET
        </pre>
        <p className="mt-2 text-[11.5px] muted">
          Önerilen sıklık: 6 saatte bir. Steam Store API ücretsiz ve anahtarsızdır; mağaza fiyatları
          <span className="mono mx-1">cc=tr&amp;l=turkish</span> parametreleriyle çekilir.
        </p>
      </div>
    </div>
  );
}
