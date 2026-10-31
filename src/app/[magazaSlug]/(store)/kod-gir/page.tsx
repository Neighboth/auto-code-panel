import { notFound } from "next/navigation";
import { getCustomerSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { RedeemFlow } from "@/components/store/redeem-flow";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.kod-gir") };
}

export default async function RedeemPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazaSlug: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { magazaSlug } = await params;
  const { code } = await searchParams;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const session = await getCustomerSession();
  const customerName =
    session && session.storeId === state.store.id ? session.username : null;

  return (
    <RedeemFlow
      slug={state.store.slug}
      basePath={basePath}
      initialCode={(code ?? "").slice(0, 40)}
      customerName={customerName}
      storeName={state.store.name}
    />
  );
}
