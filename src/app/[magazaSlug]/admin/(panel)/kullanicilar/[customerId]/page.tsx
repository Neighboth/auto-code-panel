import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { accounts, customers, entitlements, securityFactors } from "@/db/schema";
import { formatDate, remainingLabel } from "@/lib/format";
import { requireStoreAdmin, getStoreBasePath } from "@/lib/tenant";
import { CustomerDetailActions, CustomerRemoveButton } from "./actions-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Müşteri Detayı" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ magazaSlug: string; customerId: string }>;
}) {
  const { magazaSlug, customerId } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();
  const store = guard.state.store;
  const basePath = await getStoreBasePath(store);
  const id = Number(customerId);
  if (!Number.isInteger(id)) notFound();

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, store.id), eq(customers.id, id)))
    .limit(1);
  const customer = rows[0];
  if (!customer) notFound();

  const factors = await db
    .select({ kind: securityFactors.kind })
    .from(securityFactors)
    .where(and(eq(securityFactors.subjectType, "customer"), eq(securityFactors.subjectId, id)));

  const { games: gamesTable } = await import("@/db/schema");
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
    .where(and(eq(entitlements.storeId, store.id), eq(entitlements.customerId, id)))
    .orderBy(desc(entitlements.grantedAt));

  const gameOptions = await db.select({ id: gamesTable.id, title: gamesTable.title }).from(gamesTable).where(eq(gamesTable.storeId, store.id));

  const { decryptData } = await import("@/lib/secret-crypto");
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
      <Link
        href={`${basePath}/admin/kullanicilar`}
        className="inline-flex items-center gap-1.5 text-[12px] muted hover:opacity-70"
      >
        <ArrowLeft size={13} />
        Müşteri listesi
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
                {customer.displayName} · {customer.email || "e-posta yok"} · kayıt: {formatDate(customer.createdAt)}
              </p>
            </div>
          </div>
          <span className={`badge ${customer.status === "active" ? "badge-green" : "badge-red"}`}>
            {customer.status === "active" ? "Aktif" : "Yasaklı"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-[0.06em] muted">Güvenlik:</span>
          {factors.length === 0 ? <span className="text-[11.5px] muted">Yöntem kayıtlı değil</span> : null}
          {factors.map((factor) => (
            <span key={factor.kind} className="badge">
              {factor.kind === "totp" ? "TOTP 2FA" : factor.kind === "passkey" ? "Passkey" : "Güvenlik sorusu"}
            </span>
          ))}
        </div>

        <CustomerDetailActions slug={store.slug} basePath={basePath} customerId={id} banned={customer.status === "banned"} games={gameOptions} />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b px-4 py-3 hairline">
          <h2 className="text-[13.5px] font-semibold">Kütüphane ({library.length})</h2>
          <p className="text-[11px] muted">
            Bu müşterinin teslimatları. Kaldırma, manuel ekleme ve süre bilgisi burada yapılır.
          </p>
        </div>
        {library.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] muted">Bu müşteride teslimat yok.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table min-w-[680px]">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Hesap</th>
                  <th>Platform</th>
                  <th>Kalan süre</th>
                  <th className="text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {library.map((item) => (
                  <tr key={item.entitlementId}>
                    <td>
                      <p className="text-[12.5px] font-medium">{item.title}</p>
                      <p className="text-[10.5px] muted">{item.kind === "game" ? "Oyun" : "Hesap"}</p>
                    </td>
                    <td>
                      <p className="text-[12px]">{item.username ?? "—"}</p>
                      {item.password ? (
                        <p className="mono mt-0.5 text-[10.5px] muted">
                          şifre: {item.password.length > 8 ? `••••${item.password.slice(-4)}` : item.password}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-[12px]">{item.platformLabel}</td>
                    <td className="text-[12px]">
                      {item.expiresAt ? remainingLabel(item.expiresAt) : "Sınırsız erişim"}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <CustomerRemoveButton
                          slug={store.slug}
                          customerId={id}
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
