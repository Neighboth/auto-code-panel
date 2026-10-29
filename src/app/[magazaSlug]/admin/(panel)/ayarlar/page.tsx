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

export const dynamic = "force-dynamic";
export const metadata = { title: "Görünüm ve Ayarlar" };

export default async function AdminSettingsPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
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
  const renewalUrl = store.renewalUrl || settings.renewalUrl;
  const basePath = await getStoreBasePath(store);
  const domainToken = store.customDomain
    ? domainVerificationToken(store.id, store.customDomain)
    : "";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Mağaza yönetimi</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Görünüm ve ayarlar</h1>
          <p className="mt-1 text-[12.5px] muted">
            Marka, tema, font ve mağaza ID ayarları. Değişiklikler kaydedildiğinde vitrin anında güncellenir.
          </p>
        </div>
        <a href={basePath || "/"} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
          Vitrini aç
          <ArrowUpRight size={12} />
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
              <p className="mt-0.5 text-[11.5px] muted">
                Kalan süre: <span className="font-medium" style={{ color: "var(--fg)" }}>{store.expiresAt ? remainingLabel(store.expiresAt) : "Sınırsız"}</span>{" "}
                · Bitiş: {store.expiresAt ? formatDate(store.expiresAt) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] muted">
                Hesap limiti: {store.maxAccounts ?? "Sınırsız"} · Durum:{" "}
                {guard.state.suspended ? "Askıda" : guard.state.expired ? "Süresi doldu" : "Aktif"}
              </p>
            </div>
          </div>
          <a href={renewalUrl} target="_blank" rel="noreferrer" className="btn btn-dark btn-sm">
            Süre Uzat (İlan Linki)
            <ArrowUpRight size={12} />
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

      <FactorSettings slug={store.slug} subjectType="store" rpName={brand.name} />
    </div>
  );
}
