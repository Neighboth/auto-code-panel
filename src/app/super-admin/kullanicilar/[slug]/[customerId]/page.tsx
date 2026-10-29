import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { CustomerDetailView } from "@/components/admin/customer-detail";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.musteri-yonetimi") };
}

export default async function SuperCustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string; customerId: string }>;
}) {
  const { t } = await getTranslator();
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
      backLabel={t("x.magaza-musterileri")}
      listHref="/super-admin/kullanicilar?tab=customers"
    />
  );
}
