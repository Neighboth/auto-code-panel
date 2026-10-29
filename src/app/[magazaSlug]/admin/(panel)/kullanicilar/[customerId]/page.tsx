import { notFound } from "next/navigation";
import { getStoreBasePath, requireStoreAdmin } from "@/lib/tenant";
import { CustomerDetailView } from "@/components/admin/customer-detail";

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

  return (
    <CustomerDetailView
      storeId={store.id}
      storeSlug={store.slug}
      basePath={basePath}
      customerId={id}
      backHref={`${basePath}/admin/kullanicilar`}
      backLabel="Müşteri listesi"
    />
  );
}
