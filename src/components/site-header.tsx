"use client";
import { useT } from "@/components/i18n-provider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-provider";

/** Anchors are absolute so they still work from `/bayi`. */
const links = [
  { href: "/#ozellikler", label: "x.ozellikler" },
  { href: "/#nasil-calisir", label: "x.nasl-calsr" },
  { href: "/#fiyatlandirma", label: "x.fiyatlandrma" },
  { href: "/#sss", label: "x.sss" },
];

export function SiteHeader({
  name,
  tagline,
  logoUrl,
  locale,
}: {
  name: string;
  tagline: string;
  logoUrl?: string;
  locale: string;
}) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /*
   * Top-bar links jump to a section on the home page. Next.js keeps the scroll
   * position when the route changes, so following "/#ozellikler" from /bayi
   * used to land mid-page (or keep the old offset). Scroll explicitly: to the
   * target when a hash is present, to the very top otherwise.
   */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) {
      const offset = target.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(offset, 0), behavior: "auto" });
    }
  }, [pathname]);

  // Right-hand drawer: lock the page behind it and close on Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl hairline"
      style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-5">
        <Link href="/" className="flex min-w-0 flex-1 items-center md:flex-none" aria-label={name}>
          <Wordmark name={name} subtitle={tagline} logoUrl={logoUrl} size={26} />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium muted transition hover:opacity-70"
            >
              {t(link.label)}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 md:ml-auto">
          <LanguageSwitcher locale={locale} compact />
          <ThemeToggle />
          <Link href="/super-admin" className="btn btn-gray btn-sm hidden md:inline-flex">
            {t("x.giris")}
          </Link>
          <Link href="/bayi" className="btn btn-dark btn-sm hidden sm:inline-flex">
            <span className="hidden lg:inline">{t("x.bayilik-aktivasyonu")}</span>
            <span className="lg:hidden">{t("x.bayilik")}</span>
            <ArrowRight size={13} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border p-1.5 hairline md:hidden"
            aria-label={t("x.menuyu-ac")}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
          >
            <Menu size={17} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[120] md:hidden">
          {/* Dimmed backdrop — tapping it closes the drawer. */}
          <button
            type="button"
            aria-label={t("x.menuyu-kapat")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[2px]"
          />
          <aside
            id="site-mobile-menu"
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-[82%] max-w-[320px] flex-col border-l shadow-2xl hairline"
            style={{ background: "var(--bg-elevated)", animation: "drawer-in 180ms ease-out" }}
          >
            <div className="flex h-14 items-center justify-between border-b px-4 hairline">
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] muted">
                {t("common.menu")}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[14px] font-medium muted active:opacity-60"
                >
                  {t(link.label)}
                </Link>
              ))}
              <Link
                href="/super-admin"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-[14px] font-medium muted active:opacity-60"
              >
                {t("x.giris")}
              </Link>
            </nav>
            <div className="border-t p-3 hairline">
              <Link
                href="/bayi"
                onClick={() => setOpen(false)}
                className="btn btn-dark w-full justify-center"
              >
                {t("x.bayilik-aktivasyonu")}
                <ArrowRight size={13} />
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
