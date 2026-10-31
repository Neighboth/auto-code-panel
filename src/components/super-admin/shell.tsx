"use client";
import { useT } from "@/components/i18n-provider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, ExternalLink, Mail, Megaphone, Menu, Settings2, Store, Tag, Users, X } from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";
import { BrandLogo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-provider";

export function SuperAdminShell({
  username,
  brandName,
  brandLogoUrl,
  locale = "tr",
  children,
}: {
  username: string;
  brandName: string;
  brandLogoUrl?: string;
  locale?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  /** Mobile navigation opens from the right instead of scrolling sideways. */
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);
  const nav = [
    { href: "/super-admin", label: t("super.navStores"), icon: Store },
    { href: "/super-admin/kullanicilar", label: t("super.navUsers"), icon: Users },
    { href: "/super-admin/duyurular", label: t("super.navPosts"), icon: Megaphone },
    { href: "/super-admin/loglar", label: t("super.navLogs"), icon: Activity },
    { href: "/super-admin/postalar", label: t("super.navMail"), icon: Mail },
    { href: "/super-admin/fiyatlar", label: t("nav.pricingPlans"), icon: Tag },
    { href: "/super-admin/ayarlar", label: t("super.navSettings"), icon: Settings2 },
  ];

  return (
    <div className="app-layout min-h-dvh">
      <aside className="app-aside border-b hairline lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4 hairline">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo logoUrl={brandLogoUrl} size={24} />
            <span>
              <span className="block text-[13px] font-semibold leading-tight">{brandName}</span>
              <span className="block text-[10px] uppercase tracking-[0.1em] muted">
                {t("super.badge")}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitcher locale={locale} compact />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("x.menuyu-ac")}
              aria-expanded={drawerOpen}
              aria-controls="super-drawer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border hairline lg:hidden"
            >
              <Menu size={15} />
            </button>
          </div>
        </div>
        <nav aria-label={t("x.super-admin")} className="hidden gap-1 px-3 py-3 lg:flex lg:flex-col">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition"
                style={{
                  background: active ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                }}
              >
                <item.icon size={15} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t px-3 py-3 lg:block hairline">
          <Link
            href="/"
            className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] muted transition hover:opacity-70"
          >
            <ExternalLink size={14} />
            {t("super.promo")}
          </Link>
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-[12px] font-medium">{username}</p>
              <p className="text-[10.5px] muted">{t("super.owner")}</p>
            </div>
            <LogoutButton
              kind="super"
              className="text-[11.5px] font-medium muted hover:opacity-70"
              label={t("common.logout")}
            />
          </div>
        </div>
      </aside>
      {drawerOpen ? (
        <div className="fixed inset-0 z-[150] lg:hidden">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            id="super-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("x.super-admin")}
            className="absolute inset-y-0 right-0 flex w-[min(84vw,320px)] flex-col border-l hairline"
            style={{ background: "var(--bg-elevated)", animation: "drawer-in 180ms ease-out" }}
          >
            <div className="flex h-16 items-center justify-between border-b px-4 hairline">
              <span className="text-[13px] font-semibold">{t("common.menu")}</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("x.menuyu-kapat")}
                className="flex h-8 w-8 items-center justify-center rounded-lg border hairline"
              >
                <X size={15} />
              </button>
            </div>
            <nav aria-label={t("x.super-admin")} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={`drawer-${item.href}`}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition"
                    style={{
                      background: active ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                      color: active ? "var(--fg)" : "var(--fg-muted)",
                    }}
                  >
                    <item.icon size={15} strokeWidth={1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t px-3 py-3 hairline">
              <Link
                href="/"
                onClick={() => setDrawerOpen(false)}
                className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] muted"
              >
                <ExternalLink size={14} />
                {t("super.promo")}
              </Link>
              <div className="flex items-center justify-between rounded-lg px-3 py-2">
                <div>
                  <p className="text-[12px] font-medium">{username}</p>
                  <p className="text-[10.5px] muted">{t("super.owner")}</p>
                </div>
                <LogoutButton
                  kind="super"
                  className="text-[11.5px] font-medium muted hover:opacity-70"
                  label={t("common.logout")}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <a href="#main" className="skip-link">{t("x.icerige-gec")}</a>
      <main id="main" tabIndex={-1} className="app-main min-w-0 px-4 py-6 sm:px-7 lg:py-8">
        {children}
      </main>
    </div>
  );
}
