"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Code2,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Palette,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";

const nav = [
  { href: "", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "oyunlar", label: "Oyunlar & Ürünler", icon: Boxes },
  { href: "hesaplar", label: "Hesaplar", icon: KeyRound },
  { href: "kodlar", label: "Kodlar", icon: Code2 },
  { href: "kullanicilar", label: "Kullanıcılar", icon: Users },
  { href: "istatistikler", label: "İstatistikler", icon: BarChart3 },
  { href: "ayarlar", label: "Görünüm ve Ayarlar", icon: Palette },
];

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
  children: ReactNode;
}) {
  const pathname = usePathname();
  const usagePercent = accountMax ? Math.min(100, Math.round((accountUsed / accountMax) * 100)) : 6;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[254px_1fr]">
      <aside className="border-b lg:min-h-dvh lg:border-b-0 lg:border-r hairline" style={{ background: "var(--bg-elevated)" }}>
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4 hairline">
          <Link href={basePath || "/"} className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={storeName} className="h-7 w-7 shrink-0 rounded-md object-cover" />
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
              <span className="block text-[10px] uppercase tracking-[0.1em] muted">Mağaza paneli</span>
            </span>
          </Link>
        </div>

        <div className="px-3 py-3">
          <div className="rounded-xl border p-3 hairline" style={{ background: "var(--bg)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">Kalan süre</span>
              {suspended || expired ? (
                <span className="badge badge-red">{suspended ? "Askıda" : "Doldu"}</span>
              ) : (
                <span className="badge badge-green">
                  <span className="live-dot" /> Aktif
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[14px] font-semibold tracking-[-0.01em]">{remaining}</p>
            <a href={renewalUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm mt-2 w-full">
              <Timer size={12} />
              Süre Uzat
              <ArrowUpRight size={11} />
            </a>
          </div>

          <div className="mt-2 rounded-xl border p-3 hairline">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">Hesap limiti</span>
              <span className="text-[10.5px] font-medium tabular-nums">
                {accountUsed} / {accountMax ?? "∞"}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${usagePercent}%`, background: usagePercent >= 90 ? "#dc2626" : "var(--store-primary)" }}
              />
            </div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-y-auto">
          {nav.map((item) => {
            const href = item.href ? `${basePath}/admin/${item.href}` : `${basePath}/admin`;
            const active = pathname === href;
            return (
              <Link
                key={item.href || "dashboard"}
                href={href}
                className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition"
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

        <div className="hidden border-t px-3 py-3 lg:block hairline">
          <Link
            href={basePath || "/"}
            target="_blank"
            className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] muted"
          >
            <ExternalLink size={13} />
            Vitrini görüntüle
          </Link>
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-[12px] font-medium">{adminUsername}</p>
              <p className="text-[10px] muted">Mağaza yöneticisi</p>
            </div>
            <LogoutButton
              kind="store"
              slug={slug}
              basePath={basePath}
              className="text-[11px] font-medium muted hover:opacity-70"
              label="Çıkış"
            />
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-7 lg:py-7">
        {suspended || expired ? (
          <div
            className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center"
            style={{ borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b" }}
          >
            <TriangleAlert size={28} className="shrink-0" />
            <h2 className="mt-3 text-[18px] font-semibold tracking-[-0.01em]">
              {suspended ? "Mağaza askıya alındı" : "Bayilik süresi doldu"}
            </h2>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed">
              {suspended
                ? "Vitrin ve teslimatlar durduruldu. Süre eklemek için süre uzatma linkini kullanın."
                : "Bayilik süresi sona erdi. Vitrin ve teslimatlar otomatik olarak durduruldu."}
            </p>
            <a
              href={renewalUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-danger mt-5 inline-flex items-center gap-2"
            >
              Süre Uzat
              <ArrowUpRight size={12} />
            </a>
            <p className="mt-3 text-[11.5px] leading-relaxed">
              Destek:{" "}
              <a href={`mailto:${supportEmail ?? ""}`} className="underline">
                {supportEmail ?? "destek@pixguard.com"}
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
