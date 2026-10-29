import { redirect } from "next/navigation";
import Link from "next/link";
import { Database, Globe2, KeyRound } from "lucide-react";
import { getSuperSession } from "@/lib/session";
import { getPlatformSettings } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { PlatformSettingsForm } from "@/components/super-admin/panels";
import { FactorSettings } from "@/components/security/factor-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sistem Ayarları" };

export default async function SystemSettingsPage() {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const settings = await getPlatformSettings();

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
