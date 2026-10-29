import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { requireStoreAdmin, getStoreBasePath } from "@/lib/tenant";
import { EmptyState } from "@/components/ui";
import { CustomersTable, type CustomerRow } from "@/components/admin/customers-table";

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
        <CustomersTable
          slug={store.slug}
          basePath={basePath}
          rows={rows.map(({ customer, deliveryCount }) => ({
            id: customer.id,
            username: customer.username,
            displayName: customer.displayName,
            email: customer.email,
            createdAt: customer.createdAt.toISOString(),
            deliveryCount: Number(deliveryCount),
            status: customer.status,
          }))}
          formattedDates={Object.fromEntries(rows.map(({ customer }) => [customer.id, formatDate(customer.createdAt)]))}
        />
      )}
    </div>
  );
}
