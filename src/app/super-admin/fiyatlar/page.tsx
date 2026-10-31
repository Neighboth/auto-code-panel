import { redirect } from "next/navigation";
import { getSuperSession } from "@/lib/session";
import { getTranslator } from "@/lib/i18n/server";
import { listPlans } from "@/lib/plans";
import { PlanEditor } from "@/components/super-admin/plan-editor";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.fiyatlar-ve-paketler") };
}

/** Platform owner: edit the pricing cards that the marketing page renders. */
export default async function PricingPage() {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const plans = await listPlans({ includeInactive: true });
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PlanEditor plans={plans} />
    </div>
  );
}
