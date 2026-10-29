import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getStoreAdminSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { StoreAdminLoginForm } from "@/components/auth-forms";
import { BrandMark } from "@/components/brand";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mağaza Yönetimi Girişi" };

export default async function StoreAdminLoginPage({
  params,
}: {
  params: Promise<{ magazaSlug: string }>;
}) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const locale = await getLocale();
  const session = await getStoreAdminSession();
  if (session && session.storeId === state.store.id) redirect(`${basePath}/admin`);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 hairline-grid opacity-40" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-14">
        <div className="mb-6 flex items-center justify-between">
          <Link href={basePath || "/"} className="flex items-center gap-2">
            <BrandMark size={24} />
            <span>
              <span className="block text-[13.5px] font-semibold leading-tight">{state.store.name}</span>
              <span className="block text-[10px] uppercase tracking-[0.1em] muted">Mağaza yönetimi</span>
            </span>
          </Link>
        </div>
        <div className="card p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
            <ShieldCheck size={16} />
          </span>
          <h1 className="mt-3.5 text-[21px] font-semibold tracking-[-0.02em]">Yönetim paneline giriş</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed muted">
            Bu panel yalnızca {state.store.name} mağaza sahibine aittir. Bayilik menüsü içermez.
          </p>
          {!state.active ? (
            <div
              className="mt-3 rounded-lg border px-3 py-2 text-[11.5px]"
              style={{
                borderColor: "color-mix(in srgb, #f59e0b 40%, var(--border))",
                background: "color-mix(in srgb, #f59e0b 12%, var(--bg-elevated))",
                color: "color-mix(in srgb, #b45309 70%, var(--fg))",
              }}
            >
              Mağaza şu anda {state.suspended ? "askıda" : "süresi dolmuş"} durumda. Panele giriş yapıp
              lisans durumunuzu görüntüleyebilirsiniz.
            </div>
          ) : null}
          <div className="mt-5">
            <StoreAdminLoginForm
              slug={state.store.slug}
              storeName={state.store.name}
              basePath={basePath}
              locale={locale.code}
            />
          </div>

        </div>
        <Link href={basePath || "/"} className="mt-4 inline-flex items-center justify-center gap-1.5 text-[11.5px] muted">
          <ArrowLeft size={12} />
          Mağaza vitrinine dön
        </Link>
      </div>
    </div>
  );
}
