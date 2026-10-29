"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ExternalLink, Megaphone, Settings2, Store, Users } from "lucide-react";
import { LogoutButton } from "@/components/auth-forms";
import { BrandLogo } from "@/components/brand";

const nav = [
  { href: "/super-admin", label: "Bayilik Yönetimi", icon: Store },
  { href: "/super-admin/kullanicilar", label: "Kullanıcılar", icon: Users },
  { href: "/super-admin/duyurular", label: "Duyurular", icon: Megaphone },
  { href: "/super-admin/ayarlar", label: "Sistem Ayarları", icon: Settings2 },
];

export function SuperAdminShell({
  username,
  brandName,
  brandLogoUrl,
  children,
}: {
  username: string;
  brandName: string;
  brandLogoUrl?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b lg:min-h-dvh lg:border-b-0 lg:border-r hairline" style={{ background: "var(--bg-elevated)" }}>
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4 hairline">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLogo logoUrl={brandLogoUrl} size={24} />
            <span>
              <span className="block text-[13px] font-semibold leading-tight">{brandName}</span>
              <span className="block text-[10px] uppercase tracking-[0.1em] muted">Süper Admin</span>
            </span>
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
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
            Tanıtım sitesi
          </Link>
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-[12px] font-medium">{username}</p>
              <p className="text-[10.5px] muted">Platform sahibi</p>
            </div>
            <LogoutButton kind="super" className="text-[11.5px] font-medium muted hover:opacity-70" label="Çıkış" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-7 lg:py-8">{children}</main>
    </div>
  );
}
