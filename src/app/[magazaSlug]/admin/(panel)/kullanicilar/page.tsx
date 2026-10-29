import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { requireStoreAdmin, getStoreBasePath } from "@/lib/tenant";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kullanıcılar" };

export default async function StoreCustomersPage({
  params,
}: {
  params: Promise<{ magazaSlug: string }>;
}) {
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();
  const store = guard.state.store;
  const basePath = await getStoreBasePath(store);

  const rows = await db
    .select({
      customer: customers,
      deliveryCount: sql<number>`(select count(*) from entitlements e where e.customer_id = ${customers.id} and e.store_id = ${store.id})`,
    })
    .from(customers)
    .where(eq(customers.storeId, store.id))
    .orderBy(asc(customers.createdAt));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Mağaza yönetimi</p>
        <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Kullanıcılar</h1>
        <p className="mt-1 text-[12.5px] muted">
          {rows.length} müşteri kaydı. Müşteriler yalnızca kendi mağazanıza özeldir; aynı kullanıcı
          adı başka mağazada farklı bir müşteri olabilir.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz müşteri yok"
          description="Kod kullanan ve hesap oluşturan müşteriler burada listelenir."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scroll-thin">
            <table className="table min-w-[720px]">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>E-posta</th>
                  <th>Kayıt tarihi</th>
                  <th>Teslimat</th>
                  <th>Durum</th>
                  <th className="text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ customer, deliveryCount }) => (
                  <tr key={customer.id}>
                    <td>
                      <p className="text-[12.5px] font-medium">{customer.username}</p>
                      <p className="text-[10.5px] muted">{customer.displayName}</p>
                    </td>
                    <td className="text-[12px]">{customer.email ?? "—"}</td>
                    <td className="text-[11.5px] muted">{formatDate(customer.createdAt)}</td>
                    <td className="text-[12px] tabular-nums">{Number(deliveryCount)}</td>
                    <td>
                      <span className={`badge ${customer.status === "active" ? "badge-green" : "badge-red"}`}>
                        {customer.status === "active" ? "Aktif" : "Yasaklı"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Link
                          href={`${basePath}/admin/kullanicilar/${customer.id}`}
                          className="btn btn-outline btn-sm"
                        >
                          <Users size={12} />
                          Yönet
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
