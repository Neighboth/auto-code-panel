import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, storeAdmins, stores } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { UserTabs } from "./tabs-client";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.kullanclar") };
}

export default async function SuperUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { t } = await getTranslator();
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const { tab } = await searchParams;

  const resellerRows = await db
    .select({
      admin: storeAdmins,
      storeName: stores.name,
      storeSlug: stores.slug,
      storeStatus: stores.status,
      storeExpiresAt: stores.expiresAt,
    })
    .from(storeAdmins)
    .innerJoin(stores, eq(stores.id, storeAdmins.storeId))
    .orderBy(asc(stores.createdAt));

  const customerRows = await db
    .select({
      customer: customers,
      storeName: stores.name,
      storeSlug: stores.slug,
    })
    .from(customers)
    .innerJoin(stores, eq(stores.id, customers.storeId))
    .orderBy(asc(customers.createdAt));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{t("x.kullanclar")}</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">{" "}{t("x.platform-kullanclar")}</h1>
        <p className="mt-1 text-[12.5px] muted">{t("x.bayi-hesaplar-platform-genelinde-magaza-musterileri-tena")}</p>
      </div>

      <UserTabs
        resellers={resellerRows.map((row) => ({
          key: row.admin.id,
          id: row.admin.id,
          username: row.admin.username,
          email: row.admin.email,
          status: row.admin.status,
          createdAt: new Date(row.admin.createdAt).toISOString(),
          storeName: row.storeName,
          storeSlug: row.storeSlug,
          storeStatus: row.storeStatus,
          storeExpiresAt: row.storeExpiresAt ? new Date(row.storeExpiresAt).toISOString() : null,
        }))}
        initialTab={tab === "customers" ? "customers" : "resellers"}
        customers={customerRows.map((row) => ({
          key: row.customer.id,
          id: row.customer.id,
          username: row.customer.username,
          displayName: row.customer.displayName,
          email: row.customer.email ?? "",
          status: row.customer.status,
          createdAt: new Date(row.customer.createdAt).toISOString(),
          storeName: row.storeName,
          storeSlug: row.storeSlug,
        }))}
      />
    </div>
  );
}
