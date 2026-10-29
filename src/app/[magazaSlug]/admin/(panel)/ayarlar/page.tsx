import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { db } from "@/db";
import { storeAdmins } from "@/db/schema";
import { formatDate, remainingLabel } from "@/lib/format";
import { domainVerificationToken } from "@/lib/domain";
import { getStoreBasePath, requireStoreAdmin } from "@/lib/tenant";
import { getPlatformSettings } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { StoreCredentialsForm, StoreDomainForm, StoreSettingsForm } from "@/components/admin/settings";
import { FactorSettings } from "@/components/security/factor-settings";
import { StoreMailPrefsCard } from "@/components/store/mail-prefs-card";
import { getMailPrefs } from "@/lib/mail-prefs";
import { getStoreAdminSession } from "@/lib/session";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.gorunum-ve-ayarlar") };
}

export default async function AdminSettingsPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();
  const store = guard.state.store;

  const adminRows = await db
    .select()
    .from(storeAdmins)
    .where(and(eq(storeAdmins.id, guard.session.adminId), eq(storeAdmins.storeId, store.id)))
    .limit(1);
  const admin = adminRows[0];
  const settings = await getPlatformSettings();
  const adminSession = await getStoreAdminSession();
  const storeMailPrefs = adminSession ? await getMailPrefs("store_admin", adminSession.adminId) : null;
  const renewalUrl = store.renewalUrl || settings.renewalUrl;
  const basePath = await getStoreBasePath(store);
  const domainToken = store.customDomain
    ? domainVerificationToken(store.id, store.customDomain)
    : "";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.magaza-yonetimi")}</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">{" "}{t("x.gorunum-ve-ayarlar")}</h1>
          <p className="mt-1 text-[12.5px] muted">{t("x.marka-tema-font-ve-magaza-id-ayarlar-degisiklikler-kayde")}</p>
        </div>
        <a href={basePath || "/"} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">{t("x.vitrini-ac")}<ArrowUpRight size={12} />
        </a>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
              <Clock3 size={16} />
            </span>
            <div>
              <p className="text-[12.5px] font-semibold">Bayilik durumu</p>
              <p className="mt-0.5 text-[11.5px] muted">{t("x.kalan-sure-2")}<span className="font-medium" style={{ color: "var(--fg)" }}>{store.expiresAt ? remainingLabel(store.expiresAt) : t("x.snrsz")}</span>{" "}
                · {t("x.bitis-2")} {store.expiresAt ? formatDate(store.expiresAt) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] muted">
                Hesap limiti: {store.maxAccounts ?? t("x.snrsz")} · Durum:{" "}
                {guard.state.suspended ? t("x.askda") : guard.state.expired ? t("x.suresi-doldu") : "Aktif"}
              </p>
            </div>
          </div>
          <a href={renewalUrl} target="_blank" rel="noreferrer" className="btn btn-dark btn-sm">{t("x.sure-uzat-ilan-linki")}<ArrowUpRight size={12} />
          </a>
        </div>
        {settings.defaultPlanNote ? (
          <p className="mt-3 rounded-lg border px-3 py-2 text-[11.5px] muted hairline">{settings.defaultPlanNote}</p>
        ) : null}
      </section>

      <StoreSettingsForm
        store={{
          slug: store.slug,
          title: store.title,
          subtitle: store.subtitle,
          announcement: store.announcement,
          footerText: store.footerText,
          logoUrl: store.logoUrl,
          faviconUrl: store.faviconUrl,
          primaryColor: store.primaryColor,
          accentColor: store.accentColor,
          fontFamily: store.fontFamily,
          contactLinks: store.contactLinks,
        }}
      />

      <StoreDomainForm
        key={`${store.customDomain ?? "none"}:${store.customDomainVerifiedAt?.getTime() ?? 0}`}
        slug={store.slug}
        domain={store.customDomain ?? ""}
        verifiedAt={store.customDomainVerifiedAt ? store.customDomainVerifiedAt.toISOString() : null}
        token={domainToken}
      />

      <StoreCredentialsForm
        slug={store.slug}
        username={admin?.username ?? guard.session.username}
        email={admin?.email ?? ""}
      />

      {storeMailPrefs ? <StoreMailPrefsCard slug={store.slug} initial={storeMailPrefs} /> : null}
      <FactorSettings slug={store.slug} subjectType="store" rpName={brand.name} />
    </div>
  );
}
