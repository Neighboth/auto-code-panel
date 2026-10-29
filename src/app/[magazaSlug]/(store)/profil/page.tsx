import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { getCustomerSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { brand } from "@/lib/brand";
import { ProfileForm } from "@/components/store/profile-form";
import { FactorSettings } from "@/components/security/factor-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil Ayarları" };

export default async function ProfilePage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const session = await getCustomerSession();
  if (!session || session.storeId !== state.store.id) {
    redirect(`${basePath}/giris`);
  }
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, session.customerId), eq(customers.storeId, state.store.id)))
    .limit(1);
  const customer = rows[0];
  if (!customer) redirect(`${basePath}/giris`);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-9">
      <div className="border-b pb-5 hairline">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Hesabım</p>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.025em]">Profil ayarları</h1>
        <p className="mt-1 text-[12.5px] muted">
          Kullanıcı adınız {state.store.name} mağazasına özeldir ve benzersiz olmalıdır.
        </p>
      </div>
      <div className="mt-6 space-y-5">
        <ProfileForm
          slug={state.store.slug}
          customer={{
            username: customer.username,
            displayName: customer.displayName,
            email: customer.email ?? "",
            avatarUrl: customer.avatarUrl,
          }}
        />
        <FactorSettings slug={state.store.slug} subjectType="customer" rpName={brand.name} />
      </div>
    </div>
  );
}
