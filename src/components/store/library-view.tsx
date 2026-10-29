"use client";

import { useMemo, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { CredentialsModal } from "@/components/store/credentials-modal";
import { createTranslator } from "@/lib/i18n/translate";

export type LibraryItem = {
  entitlementId: number;
  title: string;
  subtitle: string;
  coverImage: string;
  platformLabel: string;
  guardType: string;
  username: string | null;
  email: string | null;
  password: string | null;
  mailEmail: string | null;
  mailPassword: string | null;
  notes: string;
  expiresAt: string | null;
};

export function LibraryView({
  slug,
  basePath,
  items,
  locale = "tr",
}: {
  slug: string;
  basePath: string;
  items: LibraryItem[];
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [active, setActive] = useState<LibraryItem | null>(null);
  const [open, setOpen] = useState(false);

  const item = useMemo(
    () =>
      active
        ? {
            entitlementId: active.entitlementId,
            title: active.title,
            subtitle: active.subtitle,
            platformLabel: active.platformLabel,
            guardType: active.guardType,
            username: active.username,
            email: active.email,
            password: active.password,
            mailEmail: active.mailEmail,
            mailPassword: active.mailPassword,
            notes: active.notes,
          }
        : null,
    [active],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-9">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5 hairline">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Hesabım</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.025em]">{t("library.title")}</h1>
          <p className="mt-1 text-[12.5px] muted">
            {items.length} teslimat · Paylaşımlı hesaplar sınırsız süreyle kullanılabilir.
          </p>
        </div>
        <span className="badge badge-green">
          <ShieldCheck size={11} /> Canlı kod üretimi aktif
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center hairline">
          <KeyRound size={22} className="mx-auto muted" />
          <p className="mt-2 text-[13px] font-medium">{t("library.empty")}</p>
          <p className="mt-1 text-[11.5px] muted">{t("library.emptySub")}</p>
          <a href={`${basePath}/kod-gir`} className="btn btn-primary btn-sm mt-4">
            {t("nav.redeem")}
          </a>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((entry) => (
            <button
              key={entry.entitlementId}
              type="button"
              onClick={() => {
                setActive(entry);
                setOpen(true);
              }}
              className="card overflow-hidden text-left transition hover:-translate-y-0.5"
            >
              <div className="relative aspect-[460/215]" style={{ background: "var(--bg)" }}>
                {entry.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.coverImage} alt={entry.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center muted">
                    <KeyRound size={24} />
                  </div>
                )}
                <span className="absolute right-2 top-2 badge" style={{ background: "var(--bg-elevated)" }}>
                  {entry.platformLabel}
                </span>
              </div>
              <div className="p-4">
                <p className="truncate text-[13.5px] font-semibold">{entry.title}</p>
                <p className="mt-0.5 text-[10.5px] muted">{entry.subtitle}</p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] muted">{t("library.unlimited")}</span>
                  <span className="btn btn-outline btn-sm">{t("library.details")}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <CredentialsModal open={open} onClose={() => setOpen(false)} slug={slug} item={item} />
    </div>
  );
}
