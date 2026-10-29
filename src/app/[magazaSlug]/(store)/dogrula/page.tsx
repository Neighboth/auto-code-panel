import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { lookupByToken } from "@/lib/verification";
import { mailEnabled } from "@/lib/mailer";
import { EmailVerifyCard } from "@/components/store/email-verify";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-posta Doğrulama" };

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
  const { t } = await searchParams;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);

  const lookup = t ? await lookupByToken(t) : { ok: false as const, message: "Bağlantı eksik veya geçersiz." };
  const invalidReason = !lookup.ok
    ? lookup.message
    : lookup.used
      ? "Bu doğrulama bağlantısı daha önce kullanıldı."
      : lookup.expired
        ? "Bağlantının süresi doldu. Yeni kod isteyin."
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
        <h1 className="mt-3.5 text-[21px] font-semibold tracking-[-0.02em]">E-posta doğrulama</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed muted">
          Bağlantı yalnızca kodunuzu gösterir; sizi kendi başına giriş yaptırmaz.
        </p>

        <div className="mt-5">
          {lookup.ok && !invalidReason ? (
            <EmailVerifyCard
              mode="link"
              slug={state.store.slug}
              basePath={basePath}
              email={lookup.email}
              token={t}
              initialCode={lookup.code}
            />
          ) : (
            <div className="space-y-3">
              <p className="note note-danger text-[12px]">{invalidReason ?? "Bağlantı geçersiz."}</p>
              <Link href={`${basePath}/giris`} className="btn btn-outline w-full">
                Giriş ekranına dön
              </Link>
            </div>
          )}
        </div>

        {!mailEnabled() ? (
          <p className="note note-warn mt-4 text-[11.5px]">
            SMTP yapılandırılmadığı için doğrulama e-postaları gönderilmiyor. Yönetici panelinden
            sunucu bilgilerini kontrol edin.
          </p>
        ) : null}
      </div>
    </div>
  );
}
