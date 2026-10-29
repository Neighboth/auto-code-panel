"use client";
import { useT } from "@/components/i18n-provider";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand";

const links = [
  { href: "#ozellikler", label: "x.ozellikler" },
  { href: "#nasil-calisir", label: "x.nasl-calsr" },
  { href: "#fiyatlandirma", label: "x.fiyatlandrma" },
  { href: "#sss", label: "SSS" },
];

export function SiteHeader({
  name,
  tagline,
  logoUrl,
}: {
  name: string;
  tagline: string;
  logoUrl?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl hairline"
      style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-4 sm:px-5">
        <Link href="/" className="min-w-0 flex-1 md:flex-none">
          <Wordmark name={name} subtitle={tagline} logoUrl={logoUrl} size={26} />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium muted transition hover:opacity-70"
            >
              {t(link.label)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 md:ml-auto">
          <Link href="/super-admin" className="btn btn-gray btn-sm hidden md:inline-flex">{t("x.giris")}</Link>
          <Link href="/bayi" className="btn btn-dark btn-sm">
            <span className="sm:hidden">{t("x.bayilik")}</span>
            <span className="hidden sm:inline">{t("x.bayilik-aktivasyonu")}</span>
            <ArrowRight size={13} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg border p-1.5 hairline md:hidden"
            aria-label={open ? t("x.menuyu-kapat") : t("x.menuyu-ac")}
            aria-expanded={open}
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t px-4 pb-4 pt-3 md:hidden hairline">
          <nav className="grid gap-0.5">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[13.5px] font-medium muted active:opacity-60"
              >
                {t(link.label)}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2 border-t pt-3 hairline">
            <Link href="/super-admin" onClick={() => setOpen(false)} className="btn btn-gray btn-sm flex-1">{t("x.giris")}</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
