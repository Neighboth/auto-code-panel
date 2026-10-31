import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowUpRight, ExternalLink, KeyRound } from "lucide-react";
import { db } from "@/db";
import { resellerKeys, stores } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { getPlatformSettings } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { formatDate, remainingLabel } from "@/lib/format";
import { ManagerLoginForm } from "@/components/auth-forms";
import { ResellerKeyGenerator, RevokeKeyButton, StoreActions } from "@/components/super-admin/panels";
import { StoreAccountsButton } from "@/components/super-admin/store-accounts";
import { StoreLoginsButton } from "@/components/super-admin/store-logins";
import { BrandLogo } from "@/components/brand";
import { Stat } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.yonetici-girisi-bayilik-yonetimi") };
}

function statusOf(store: { status: string; expiresAt: Date | null }, t: Translator) {
  if (store.status === "suspended") return { label: t("x.askda"), tone: "badge-amber" as const };
  if (store.expiresAt && new Date(store.expiresAt).getTime() <= Date.now()) {
    return { label: t("x.suresi-doldu"), tone: "badge-red" as const };
  }
  return { label: t("x.aktif-2"), tone: "badge-green" as const };
}

function expiresSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  return time > Date.now() && time < Date.now() + 7 * 86_400_000;
}

export default async function SuperAdminPage() {
  const { t } = await getTranslator();
  const session = await getSuperSession();
  const settings = await getPlatformSettings();


  if (!session) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center px-5 py-14">
        <div className="pointer-events-none absolute inset-0 hairline-grid opacity-40" />
        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandLogo logoUrl={brand.logoUrl} />
              <span className="text-[15px] font-semibold">{brand.name}</span>
            </Link>
          </div>
          <div className="card p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.tek-noktadan-erisim")}</p>
            <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">{" "}{t("x.yonetici-girisi-2")}</h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed muted">{t("x.super-admin-veya-magaza-yoneticisi-bilgilerinizle-giris")}</p>
            <div className="mt-5">
              <ManagerLoginForm />
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed muted">
            {t("x.magazanza-ozel-giris-ekrann-tercih-ederseniz-url-adresin", { url: "/magaza-id/admin/giris" })}
          </p>
        </div>
      </div>
    );
  }

  const storeRows = await db
    .select({
      id: stores.id,
      slug: stores.slug,
      name: stores.name,
      status: stores.status,
      expiresAt: stores.expiresAt,
      maxAccounts: stores.maxAccounts,
      renewalUrl: stores.renewalUrl,
      customDomain: stores.customDomain,
      customDomainVerifiedAt: stores.customDomainVerifiedAt,
      createdAt: stores.createdAt,
      accountCount: sql<number>`(select count(*) from accounts a where a.store_id = ${stores.id})`,
      codeCount: sql<number>`(select count(*) from codes c where c.store_id = ${stores.id})`,
      customerCount: sql<number>`(select count(*) from customers cu where cu.store_id = ${stores.id})`,
    })
    .from(stores)
    .orderBy(desc(stores.createdAt));

  const keyRows = await db
    .select({
      id: resellerKeys.id,
      code: resellerKeys.code,
      status: resellerKeys.status,
      durationDays: resellerKeys.durationDays,
      maxAccounts: resellerKeys.maxAccounts,
      renewalUrl: resellerKeys.renewalUrl,
      note: resellerKeys.note,
      usedAt: resellerKeys.usedAt,
      createdAt: resellerKeys.createdAt,
      storeSlug: stores.slug,
    })
    .from(resellerKeys)
    .leftJoin(stores, eq(stores.id, resellerKeys.storeId))
    .orderBy(desc(resellerKeys.createdAt))
    .limit(60);

  const activeStores = storeRows.filter((store) => statusOf(store, t).label === t("x.aktif-2")).length;
  const expiringSoon = storeRows.filter((store) => expiresSoon(store.expiresAt)).length;
  const availableKeys = keyRows.filter((key) => key.status === "available").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.bayilik-yonetimi")}</p>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">{t("x.platform-kontrol-paneli")}</h1>
          <p className="mt-1 text-[12.5px] muted">
            {t("x.brand-uzerinde-count-bayi-kaytl-hos-geldiniz-name", { brand: brand.name, count: storeRows.length, name: session.username })}
          </p>
        </div>
        <Link href="/super-admin/ayarlar" className="btn btn-outline btn-sm">{t("x.sistem-ayarlar")}<ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("x.toplam-bayi")} value={storeRows.length} sub={t("x.tum-zamanlar")} />
        <Stat label={t("x.aktif-bayi")} value={activeStores} sub={t("x.count-bayi-7-gun-icinde-bitiyor", { count: expiringSoon })} />
        <Stat label={t("x.kullanlabilir-kod")} value={availableKeys} sub="Aktive edilmeyi bekliyor" />
        <Stat
          label={t("x.toplam-teslimat-kodu")}
          value={storeRows.reduce((total, store) => total + store.codeCount, 0)}
          sub={t("x.tum-bayiler")}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 hairline">
            <div>
              <h2 className="text-[14px] font-semibold">{t("x.bayi-listesi")}</h2>
              <p className="text-[11.5px] muted">{" "}{t("x.kalan-sure-hesap-kullanm-ve-magaza-linkleri")}</p>
            </div>
            <span className="badge">{t("x.count-magaza", { count: storeRows.length })}</span>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="table min-w-[860px]">
              <thead>
                <tr>
                  <th>{t("x.magaza")}</th>
                  <th>{t("x.durum")}</th>
                  <th>{" "}{t("x.kalan-sure")}</th>
                  <th>{t("x.hesap-3")}</th>
                  <th>{" "}{t("x.kod-musteri")}</th>
                  <th className="text-right">{t("x.islem")}</th>
                </tr>
              </thead>
              <tbody>
                {storeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[12.5px] muted">{t("x.henuz-bayi-yok-sagdaki-formdan-bayilik-kodu-uretin")}</td>
                  </tr>
                ) : null}
                {storeRows.map((store) => {
                  const status = statusOf(store, t);
                  const remaining =
                    store.expiresAt === null ? t("x.snrsz") : remainingLabel(store.expiresAt);
                  const usage = store.maxAccounts
                    ? Math.min(100, Math.round((store.accountCount / store.maxAccounts) * 100))
                    : 8;
                  return (
                    <tr key={store.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">{store.name}</span>
                          <a
                            href={`/${store.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="muted hover:opacity-70"
                            title={`/${store.slug}`}
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <p className="mono mt-0.5 text-[11px] muted">/{store.slug}</p>
                        {store.customDomain ? (
                          <p className="mono mt-0.5 flex items-center gap-1 text-[10.5px]" style={{ color: "var(--fg-muted)" }}>
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: store.customDomainVerifiedAt ? "#16a34a" : "#d97706" }}
                            />
                            {store.customDomain}
                            <span className="text-[9.5px] uppercase tracking-[0.06em]">
                              {store.customDomainVerifiedAt ? t("x.ozel-alan-ad") : t("x.dogrulama-bekliyor-2")}
                            </span>
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${status.tone}`}>{status.label}</span>
                      </td>
                      <td>
                        <p className="text-[12.5px] font-medium">{remaining}</p>
                        <p className="text-[10.5px] muted">{formatDate(store.expiresAt)}</p>
                      </td>
                      <td>
                        <p className="text-[12.5px] font-medium tabular-nums">
                          {store.accountCount} / {store.maxAccounts ?? "∞"}
                        </p>
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${usage}%`,
                              background: usage >= 90 ? "#dc2626" : "var(--fg)",
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <p className="text-[12px]">{t("x.count-kod", { count: store.codeCount })}</p>
                        <p className="text-[10.5px] muted">{t("x.count-musteri", { count: store.customerCount })}</p>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <StoreAccountsButton storeId={store.id} storeName={store.name} />
                          <StoreLoginsButton storeId={store.id} storeName={store.name} />
                          <StoreActions
                            storeId={store.id}
                            storeName={store.name}
                            suspended={store.status === "suspended"}
                            expiresAt={store.expiresAt ? new Date(store.expiresAt).toISOString() : null}
                            maxAccounts={store.maxAccounts}
                            renewalUrl={store.renewalUrl}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <ResellerKeyGenerator globalRenewalUrl={settings.renewalUrl} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 hairline">
          <div className="flex items-center gap-2">
            <KeyRound size={15} />
            <div>
              <h2 className="text-[14px] font-semibold">{" "}{t("x.bayilik-kodlar")}</h2>
              <p className="text-[11.5px] muted">{" "}{t("x.son-60-kod-tek-kullanmlk-aktivasyon-anahtarlar")}</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[820px]">
            <thead>
              <tr>
                <th>{t("x.kod")}</th>
                <th>{t("x.sure")}</th>
                <th>{t("x.hesap-limiti")}</th>
                <th>{t("x.durum")}</th>
                <th>{" "}{t("x.kullanan-magaza")}</th>
                <th className="text-right">{t("x.islem")}</th>
              </tr>
            </thead>
            <tbody>
              {keyRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[12.5px] muted">{t("x.henuz-bayilik-kodu-uretilmedi")}</td>
                </tr>
              ) : null}
              {keyRows.map((key) => (
                <tr key={key.id}>
                  <td>
                    <p className="mono text-[12px] font-medium">{key.code}</p>
                    {key.note ? <p className="mt-0.5 text-[10.5px] muted">{key.note}</p> : null}
                  </td>
                  <td className="text-[12px]">{key.durationDays ? `${key.durationDays} gün` : t("x.snrsz")}</td>
                  <td className="text-[12px]">{key.maxAccounts ?? t("x.snrsz")}</td>
                  <td>
                    <span
                      className={`badge ${
                        key.status === "available" ? "badge-blue" : key.status === "used" ? "badge-green" : "badge-red"
                      }`}
                    >
                      {key.status === "available" ? t("x.kullanlabilir") : key.status === "used" ? t("x.kullanld") : t("x.iptal")}
                    </span>
                  </td>
                  <td className="text-[12px]">
                    {key.storeSlug ? (
                      <a href={`/${key.storeSlug}`} target="_blank" rel="noreferrer" className="mono underline underline-offset-2">
                        /{key.storeSlug}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <RevokeKeyButton keyId={key.id} status={key.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
