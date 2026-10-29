import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { lookupByToken } from "@/lib/verification";
import { mailEnabled } from "@/lib/mailer";
import { EmailVerifyCard } from "@/components/store/email-verify";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.e-posta-dogrulama") };
}

/**
 * Magic-link landing page.
 *
 * The link deliberately does NOT sign the visitor in: it only reveals the
 * 6-digit code (and lets them verify right here if they prefer). This is the
 * e-mail-provider friendly pattern requested by the operator: the click proves
 * the mailbox is real, the code still has to be entered.
 */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazaSlug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { magazaSlug } = await params;
  const { t: token } = await searchParams;
  const { t } = await getTranslator();
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);

  const lookup = token ? await lookupByToken(token) : { ok: false as const, message: t("x.baglant-eksik-veya-gecersiz") };
  const invalidReason = !lookup.ok
    ? lookup.message
    : lookup.used
      ? t("x.bu-dogrulama-baglants-daha-once-kullanld")
      : lookup.expired
        ? t("x.baglantnn-suresi-doldu-yeni-kod-isteyin")
        : null;

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      <Link
        href={basePath || "/"}
        className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] muted"
      >
        <ArrowLeft size={12} />
        {state.store.name}
      </Link>
      <div className="card p-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
          <MailCheck size={16} />
        </span>
        <h1 className="mt-3.5 text-[21px] font-semibold tracking-[-0.02em]">{t("x.e-posta-dogrulama")}</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed muted">{t("x.baglant-yalnzca-kodunuzu-gosterir-sizi-kendi-basna-giris")}</p>

        <div className="mt-5">
          {lookup.ok && !invalidReason ? (
            <EmailVerifyCard
              mode="link"
              slug={state.store.slug}
              basePath={basePath}
              email={lookup.email}
              token={token}
              initialCode={lookup.code}
            />
          ) : (
            <div className="space-y-3">
              <p className="note note-danger text-[12px]">{invalidReason ?? t("x.baglant-gecersiz")}</p>
              <Link href={`${basePath}/giris`} className="btn btn-outline w-full">{t("x.giris-ekranna-don")}</Link>
            </div>
          )}
        </div>

        {!mailEnabled() ? (
          <p className="note note-warn mt-4 text-[11.5px]">{t("x.smtp-yaplandrlmadg-icin-dogrulama-e-postalar-gonderilmiy")}</p>
        ) : null}
      </div>
    </div>
  );
}
