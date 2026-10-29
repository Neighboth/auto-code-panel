import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { CustomerDetailView } from "@/components/admin/customer-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Müşteri Yönetimi" };

export default async function SuperCustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string; customerId: string }>;
}) {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const { slug, customerId } = await params;
  const rows = await db.select().from(stores).where(eq(stores.slug, slug.toLowerCase())).limit(1);
  const store = rows[0];
  if (!store) notFound();
  const id = Number(customerId);
  if (!Number.isInteger(id)) notFound();

  return (
    <CustomerDetailView
      storeId={store.id}
      storeSlug={store.slug}
      basePath={`/super-admin/kullanicilar`}
      customerId={id}
      backHref="/super-admin/kullanicilar?tab=customers"
      backLabel="Mağaza müşterileri"
      listHref="/super-admin/kullanicilar?tab=customers"
    />
  );
}
