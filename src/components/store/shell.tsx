"use client";
import { useT } from "@/components/i18n-provider";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, KeyRound, Menu, Search, ShieldCheck, User, X } from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-provider";
import { createTranslator } from "@/lib/i18n/translate";

export function StoreNav({
  slug,
  basePath,
  storeName,
  logoUrl,
  customer,
  locale = "tr",
}: {
  slug: string;
  basePath: string;
  storeName: string;
  logoUrl: string;
  customer: string | null;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [code, setCode] = useState("");

  const links = [
    { href: basePath || "/", label: t("nav.home") },
    { href: `${basePath}/oyunlar`, label: t("nav.products") },
    { href: `${basePath}/kod-gir`, label: t("nav.redeem") },
  ];

  // Mobile drawer: freeze the page behind it and close on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  function quickRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    router.push(`${basePath}/kod-gir${trimmed ? `?code=${encodeURIComponent(trimmed)}` : ""}`);
    setMobileOpen(false);
  }

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl hairline"
      style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-5">
        <div className="flex h-14 items-center gap-2 sm:h-16 sm:gap-4">
          <Link href={basePath || "/"} className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                    loading="lazy"
                    decoding="async"
                src={logoUrl}
                alt={storeName}
                className="h-7 w-7 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-white"
                style={{ background: "var(--store-primary)" }}
              >
                {storeName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{storeName}</span>
          </Link>

          <nav aria-label={t("ui.storeMenu")} className="hidden items-center gap-5 lg:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="text-[13px] font-medium transition hover:opacity-70"
                  style={{ color: active ? "var(--fg)" : "var(--fg-muted)" }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <form
            onSubmit={quickRedeem}
            className="ml-auto hidden max-w-[280px] flex-1 items-center gap-1.5 md:flex"
          >
            <div className="relative flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t("store.quickCode")}
                className="input mono h-9 pl-8 text-[12px] uppercase"
                aria-label={t("ui.quickCode")}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm h-9 px-2.5" aria-label={t("ui.useCode")}>
              <ArrowRight size={13} />
            </button>
          </form>

          <div className="flex shrink-0 items-center gap-1.5 md:ml-0">

            {customer ? (
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => setAccountOpen((value) => !value)}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium hairline"
                  aria-expanded={accountOpen}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: "var(--store-accent)" }}
                  >
                    {customer.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[90px] truncate">{customer}</span>
                  <ChevronDown size={12} />
                </button>
                {accountOpen ? (
                  <div
                    className="absolute right-0 z-10 mt-1.5 w-44 overflow-hidden rounded-xl border py-1 shadow-lg hairline"
                    style={{ background: "var(--bg-elevated)" }}
                    onMouseLeave={() => setAccountOpen(false)}
                  >
                    <Link href={`${basePath}/kutuphane`} className="block px-3 py-2 text-[12.5px] hover:opacity-70">
                      {t("nav.library")}
                    </Link>
                    <Link href={`${basePath}/profil`} className="block px-3 py-2 text-[12.5px] hover:opacity-70">{t("x.profil-ayarlar")}</Link>
                    <div className="my-1 h-px" style={{ background: "var(--border)" }} />
                    <LogoutButton
                      kind="customer"
                      slug={slug}
                      basePath={basePath}
                      className="block w-full px-3 py-2 text-left text-[12.5px] hover:opacity-70"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="hidden items-center gap-1.5 sm:flex">
                <Link href={`${basePath}/giris`} className="btn btn-ghost btn-sm">
                  {t("nav.login")}
                </Link>
                <Link href={`${basePath}/kayit`} className="btn btn-primary btn-sm">
                  {t("nav.register")}
                </Link>
              </div>
            )}

            <Link
              href={`${basePath}/kod-gir`}
              className="btn btn-outline btn-sm px-2 sm:hidden"
              aria-label={t("nav.redeem")}
            >
              <KeyRound size={14} />
            </Link>

            <LanguageSwitcher locale={locale} compact />
            <ThemeToggle />

            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="rounded-lg border p-1.5 hairline lg:hidden"
              aria-label={mobileOpen ? t("x.menuyu-kapat") : t("x.menuyu-ac")}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>

        {/* Mobile quick redeem — always reachable */}
        <form onSubmit={quickRedeem} className="flex items-center gap-1.5 pb-2.5 md:hidden">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t("store.quickCode")}
              className="input mono h-9 pl-8 text-[12px] uppercase"
              aria-label={t("ui.quickCode")}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm h-9 shrink-0 px-3">
            {t("x.kullan")}
          </button>
        </form>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <button
            type="button"
            aria-label={t("x.menuyu-kapat")}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("common.menu")}
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-[340px] flex-col border-l shadow-2xl hairline"
            style={{ background: "var(--bg-elevated)", animation: "drawer-in 180ms ease-out" }}
          >
            <div className="flex h-14 items-center justify-between border-b px-4 hairline">
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] muted">
                {t("common.menu")}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border p-1.5 hairline"
                aria-label={t("x.menuyu-kapat")}
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[13.5px] font-medium muted active:opacity-60"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={`${basePath}/kutuphane`}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-2 py-2.5 text-[13.5px] font-medium muted active:opacity-60"
            >
              {t("nav.library")}
            </Link>
            <Link
              href={`${basePath}/profil`}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-2 py-2.5 text-[13.5px] font-medium muted active:opacity-60"
            >
              {t("nav.profile")}
            </Link>
            <Link
              href={`${basePath}/admin/giris`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-2.5 text-[13.5px] font-medium muted active:opacity-60"
            >
              <ShieldCheck size={13} />
              {t("store.openAdmin")}
            </Link>
            </nav>
            <div className="flex items-center gap-2 border-t p-3 hairline">
              {customer ? (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] muted">
                    <User size={13} className="shrink-0" />
                    <span className="truncate">{customer}</span>
                  </span>
                  <LogoutButton kind="customer" slug={slug} basePath={basePath} className="btn btn-outline btn-sm" />
                </>
              ) : (
                <>
                  <Link href={`${basePath}/giris`} onClick={() => setMobileOpen(false)} className="btn btn-outline btn-sm flex-1 justify-center">{t("x.giris-yap")}</Link>
                  <Link href={`${basePath}/kayit`} onClick={() => setMobileOpen(false)} className="btn btn-primary btn-sm flex-1 justify-center">{t("x.kayt-ol")}</Link>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
