import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { accounts, customers, entitlements, games, securityFactors } from "@/db/schema";
import { formatDate, remainingLabel } from "@/lib/format";
import { decryptData } from "@/lib/secret-crypto";
import {
  CustomerDetailActions,
  CustomerRemoveButton,
} from "@/app/[magazaSlug]/admin/(panel)/kullanicilar/[customerId]/actions-client";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Customer detail view shared by the store panel and the platform owner panel,
 * so a super admin can manage tenant customers without leaving /super-admin.
 */
export async function CustomerDetailView({
  storeId,
  storeSlug,
  basePath,
  customerId,
  backHref,
  backLabel,
  listHref,
}: {
  storeId: number;
  storeSlug: string;
  basePath: string;
  customerId: number;
  backHref: string;
  backLabel: string;
  listHref?: string;
}) {
  const { t } = await getTranslator();
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, storeId), eq(customers.id, customerId)))
    .limit(1);
  const customer = rows[0];
  if (!customer) notFound();

  const factors = await db
    .select({ kind: securityFactors.kind })
    .from(securityFactors)
    .where(
      and(eq(securityFactors.subjectType, "customer"), eq(securityFactors.subjectId, customerId)),
    );

  const libraryRows = await db
    .select({
      entitlementId: entitlements.id,
      title: entitlements.title,
      kind: entitlements.kind,
      expiresAt: entitlements.expiresAt,
      username: accounts.username,
      password: accounts.password,
      platformLabel: accounts.platformLabel,
    })
    .from(entitlements)
    .leftJoin(accounts, eq(accounts.id, entitlements.accountId))
    .where(and(eq(entitlements.storeId, storeId), eq(entitlements.customerId, customerId)))
    .orderBy(desc(entitlements.grantedAt));

  const gameOptions = await db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.storeId, storeId));

  const library = libraryRows.map((row) => ({
    entitlementId: row.entitlementId,
    title: row.title,
    kind: row.kind,
    expiresAt: row.expiresAt,
    username: row.username ?? null,
    password: row.password ? decryptData(row.password) : null,
    platformLabel: row.platformLabel ?? "Steam",
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-[12px] muted hover:opacity-70">
        <ArrowLeft size={13} />
        {backLabel}
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-semibold text-white"
              style={{ background: "var(--store-accent)" }}
            >
              {customer.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-[15px] font-semibold">{customer.username}</p>
              <p className="text-[11.5px] muted">
                {customer.displayName} · {customer.email || t("x.e-posta-yok")} · {t("x.kayt")}{" "}
                {formatDate(customer.createdAt)}
              </p>
            </div>
          </div>
          <span className={`badge ${customer.status === "active" ? "badge-green" : "badge-red"}`}>
            {customer.status === "active" ? t("x.aktif") : t("x.yasakl")}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-[0.06em] muted">{t("x.guvenlik-3")}</span>
          {factors.length === 0 ? (
            <span className="text-[11.5px] muted">{t("x.yontem-kaytl-degil")}</span>
          ) : null}
          {factors.map((factor) => (
            <span key={factor.kind} className="badge">
              {factor.kind === "totp" ? "TOTP 2FA" : factor.kind === "passkey" ? "Passkey" : t("x.guvenlik-sorusu")}
            </span>
          ))}
        </div>

        <CustomerDetailActions
          slug={storeSlug}
          basePath={basePath}
          customerId={customerId}
          banned={customer.status === "banned"}
          games={gameOptions}
          listHref={listHref}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b px-4 py-3 hairline">
          <h2 className="text-[13.5px] font-semibold">{t("x.kutuphane-2")} ({library.length})</h2>
          <p className="text-[11px] muted">
            {t("x.paylasml-hesaplar-suresiz-teslim-edilir")}
          </p>
        </div>
        {library.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] muted">{t("x.bu-musteride-teslimat-yok")}</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table min-w-[680px]">
              <thead>
                <tr>
                  <th>{t("x.urun-3")}</th>
                  <th>{t("x.hesap-3")}</th>
                  <th>Platform</th>
                  <th>{t("x.erisim-3")}</th>
                  <th className="text-right">{t("x.islem-3")}</th>
                </tr>
              </thead>
              <tbody>
                {library.map((item) => (
                  <tr key={item.entitlementId}>
                    <td>
                      <p className="text-[12.5px] font-medium">{item.title}</p>
                      <p className="text-[10.5px] muted">{item.kind === "game" ? t("x.urun-3") : t("x.hesap-3")}</p>
                    </td>
                    <td>
                      <p className="text-[12px]">{item.username ?? "—"}</p>
                      {item.password ? (
                        <p className="mono mt-0.5 text-[10.5px] muted">
                          {t("x.sifre-2")} {item.password.length > 8 ? `••••${item.password.slice(-4)}` : item.password}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-[12px]">{item.platformLabel}</td>
                    <td className="text-[12px]">
                      {item.expiresAt ? remainingLabel(item.expiresAt) : t("x.snrsz-erisim")}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <CustomerRemoveButton
                          slug={storeSlug}
                          customerId={customerId}
                          entitlementId={item.entitlementId}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
