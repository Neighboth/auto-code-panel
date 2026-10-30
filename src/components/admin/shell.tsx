"use client";
import { useT } from "@/components/i18n-provider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Code2,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  Menu,
  Palette,
  Timer,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-provider";

export function AdminShell({
  slug,
  basePath,
  storeName,
  logoUrl,
  adminUsername,
  remaining,
  renewalUrl,
  accountUsed,
  accountMax,
  suspended,
  expired,
  supportEmail,
  locale,
  superView,
  children,
}: {
  slug: string;
  basePath: string;
  storeName: string;
  logoUrl: string;
  adminUsername: string;
  remaining: string;
  renewalUrl: string;
  accountUsed: number;
  accountMax: number | null;
  suspended: boolean;
  expired: boolean;
  supportEmail?: string;
  locale: string;
  superView?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  /** Mobile navigation lives in a right-side drawer instead of a scroller. */
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
  const blocked = suspended || expired;
  const usagePercent = accountMax ? Math.min(100, Math.round((accountUsed / accountMax) * 100)) : 6;

  const nav = [
    { href: "", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "oyunlar", label: t("nav.products"), icon: Boxes },
    { href: "hesaplar", label: t("nav.accounts"), icon: KeyRound },
    { href: "kodlar", label: t("nav.codes"), icon: Code2 },
    { href: "kullanicilar", label: t("nav.users"), icon: Users },
    { href: "istatistikler", label: t("nav.stats"), icon: BarChart3 },
    { href: "ayarlar", label: t("nav.settings"), icon: Palette },
  ];

  return (
    <div className="app-layout min-h-dvh">
      <aside className="app-aside border-b hairline lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4 hairline">
          <Link href={basePath || "/"} className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                    loading="lazy"
                    decoding="async" src={logoUrl} alt={storeName} className="h-7 w-7 shrink-0 rounded-md object-cover" />
            ) : (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-white"
                style={{ background: "var(--store-primary)" }}
              >
                {storeName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{storeName}</span>
              <span className="block text-[10px] uppercase tracking-[0.1em] muted">
                {superView ? t("admin.superView") : t("admin.brandSub")}
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
              aria-controls="admin-drawer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border hairline lg:hidden"
            >
              <Menu size={15} />
            </button>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="rounded-xl border p-3 hairline" style={{ background: "var(--bg)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">
                {t("admin.remaining")}
              </span>
              {blocked ? (
                <span className="badge badge-red">{suspended ? t("common.suspended") : t("common.expired")}</span>
              ) : (
                <span className="badge badge-green">
                  <span className="live-dot" /> {t("common.active")}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13.5px] font-semibold leading-snug tracking-[-0.01em]">{remaining}</p>
            <a href={renewalUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm mt-2 w-full">
              <Timer size={12} />
              {t("common.renew")}
              <ArrowUpRight size={11} />
            </a>
          </div>

          <div className="mt-2 rounded-xl border p-3 hairline">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">
                {t("admin.accountLimit")}
              </span>
              <span className="text-[10.5px] font-medium tabular-nums">
                {accountUsed} / {accountMax ?? "∞"}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${usagePercent}%`,
                  background: usagePercent >= 90 ? "#dc2626" : "var(--store-primary)",
                }}
              />
            </div>
          </div>
        </div>

        <nav
          id="admin-nav-desktop"
          aria-label={t("x.magaza-yonetimi")}
          className="hidden gap-1 px-3 pb-3 lg:flex lg:flex-col"
        >
          {nav.map((item) => {
            const href = item.href ? `${basePath}/admin/${item.href}` : `${basePath}/admin`;
            const active = pathname === href;
            const disabled = blocked;
            const content = (
              <>
                <item.icon size={15} strokeWidth={1.8} />
                {item.label}
                {disabled ? <Lock size={11} className="ml-auto opacity-60" /> : null}
              </>
            );
            if (disabled) {
              return (
                <span
                  key={item.href || "dashboard"}
                  aria-disabled="true"
                  title={t("admin.blockedDesc")}
                  className="flex shrink-0 cursor-not-allowed items-center gap-2.5 rounded-lg border border-red-500/20 px-3 py-2 text-[12.5px] font-medium"
                  style={{
                    background: "color-mix(in srgb, #dc2626 9%, transparent)",
                    color: "color-mix(in srgb, #dc2626 70%, var(--fg))",
                  }}
                >
                  {content}
                </span>
              );
            }
            return (
              <Link
                key={item.href || "dashboard"}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition"
                style={{
                  background: active ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                }}
              >
                {content}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t px-3 py-3 lg:block hairline">
          <Link
            href={basePath || "/"}
            target="_blank"
            className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] muted"
          >
            <ExternalLink size={13} />
            {t("admin.viewStore")}
          </Link>
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-[12px] font-medium">{adminUsername}</p>
              <p className="text-[10px] muted">{t("admin.manager")}</p>
            </div>
            <LogoutButton
              kind="store"
              slug={slug}
              basePath={basePath}
              className="text-[11px] font-medium muted hover:opacity-70"
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
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("x.magaza-yonetimi")}
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
            <nav aria-label={t("x.magaza-yonetimi")} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
              {nav.map((item) => {
                const href = item.href ? `${basePath}/admin/${item.href}` : `${basePath}/admin`;
                const active = pathname === href;
                if (blocked) {
                  return (
                    <span
                      key={`drawer-${item.href || "dashboard"}`}
                      aria-disabled="true"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium opacity-50"
                    >
                      <item.icon size={15} strokeWidth={1.8} />
                      {item.label}
                    </span>
                  );
                }
                return (
                  <Link
                    key={`drawer-${item.href || "dashboard"}`}
                    href={href}
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
                href={basePath || "/"}
                target="_blank"
                className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] muted"
              >
                <ExternalLink size={13} />
                {t("admin.viewStore")}
              </Link>
              <div className="flex items-center justify-between rounded-lg px-3 py-2">
                <div>
                  <p className="text-[12px] font-medium">{adminUsername}</p>
                  <p className="text-[10px] muted">{t("admin.manager")}</p>
                </div>
                <LogoutButton
                  kind="store"
                  slug={slug}
                  basePath={basePath}
                  className="text-[11px] font-medium muted hover:opacity-70"
                  label={t("common.logout")}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <a href="#main" className="skip-link">{t("x.icerige-gec")}</a>
      <main id="main" tabIndex={-1} className="app-main min-w-0 px-4 py-6 sm:px-7 lg:py-7">
        {superView ? (
          <div className="note note-info mb-4">
            {t("admin.superView")} · <span className="mono">{storeName}</span>
          </div>
        ) : null}
        {blocked ? (
          <div
            className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center"
            style={{
              borderColor: "color-mix(in srgb, #dc2626 35%, transparent)",
              background: "color-mix(in srgb, #dc2626 7%, var(--bg-elevated))",
              color: "color-mix(in srgb, #dc2626 78%, var(--fg))",
            }}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "color-mix(in srgb, #dc2626 14%, transparent)" }}
            >
              <TriangleAlert size={26} />
            </span>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">
              {suspended ? t("admin.suspendedTitle") : t("admin.expiredTitle")}
            </h2>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed">{t("admin.blockedDesc")}</p>
            <a
              href={renewalUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-danger btn-lg mt-6 inline-flex min-w-[240px] items-center justify-center gap-2"
            >
              <Timer size={16} />
              {t("admin.blockedRenew")}
              <ArrowUpRight size={14} />
            </a>
            <p className="mt-4 flex items-center gap-1.5 text-[12px]">
              <Mail size={12} />
              {t("admin.blockedSupport")}:{" "}
              <a href={`mailto:${supportEmail ?? ""}`} className="underline underline-offset-2">
                {supportEmail || "destek@example.com"}
              </a>
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
