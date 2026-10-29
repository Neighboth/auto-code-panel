"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Activity, ExternalLink, Mail, Megaphone, Settings2, Store, Users } from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";
import { BrandLogo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-provider";
import { createTranslator } from "@/lib/i18n/translate";

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
  const t = createTranslator(locale);
  const nav = [
    { href: "/super-admin", label: t("super.navStores"), icon: Store },
    { href: "/super-admin/kullanicilar", label: t("super.navUsers"), icon: Users },
    { href: "/super-admin/duyurular", label: t("super.navPosts"), icon: Megaphone },
    { href: "/super-admin/loglar", label: t("super.navLogs"), icon: Activity },
    { href: "/super-admin/postalar", label: t("super.navMail"), icon: Mail },
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
          </div>
        </div>
        <nav aria-label="Süper admin" className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col">
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
      <a href="#main" className="skip-link">
        İçeriğe geç
      </a>
      <main id="main" tabIndex={-1} className="app-main min-w-0 px-4 py-6 sm:px-7 lg:py-8">
        {children}
      </main>
    </div>
  );
}
