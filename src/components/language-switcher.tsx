"use client";
import { useT } from "@/components/i18n-provider";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, findLocale, flagUrl } from "@/lib/i18n/config";

export function Flag({ flag, size = 20 }: { flag: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[3px] border hairline text-[8px] font-bold uppercase"
        style={{ width: size * 1.4, height: size }}
      >
        {flag.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagUrl(flag, size > 24 ? "w40" : "w20")}
      decoding="async"
      alt=""
      width={Math.round(size * 1.4)}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="inline-block shrink-0 rounded-[3px] object-cover"
      style={{ height: size, width: size * 1.4 }}
    />
  );
}

export function LanguageSwitcher({
  locale,
  align = "right",
  compact = false,
}: {
  locale: string;
  align?: "left" | "right";
  compact?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = findLocale(locale) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return LOCALES;
    return LOCALES.filter(
      (item) =>
        item.nativeName.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.code.includes(term),
    );
  }, [query]);

  async function choose(code: string) {
    setPending(true);
    const result = await setLocale(code);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("ui.languageError"));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[12px] font-medium hairline"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.nativeName}
      >
        <Flag flag={active.flag} size={14} />
        {compact ? null : <span className="hidden sm:inline">{active.nativeName}</span>}
        <ChevronDown size={11} className="muted" />
      </button>

      {open ? (
        <div
          className={`absolute z-[70] mt-2 w-[248px] overflow-hidden rounded-xl border shadow-lg hairline ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ background: "var(--bg-elevated)" }}
          role="listbox"
        >
          <div className="relative border-b px-2 py-2 hairline">
            <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("ui.searchLanguage")}
              className="input h-8 pl-7 text-[12px]"
              autoFocus
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1 scroll-thin">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-[12px] muted">{" "}{t("x.sonuc-yok")}</p>
            ) : null}
            {filtered.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => choose(item.code)}
                disabled={pending}
                role="option"
                aria-selected={item.code === active.code}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition hover:opacity-80"
                style={{
                  background:
                    item.code === active.code
                      ? "color-mix(in srgb, var(--fg) 7%, transparent)"
                      : "transparent",
                }}
              >
                <Flag flag={item.flag} size={14} />
                <span className="min-w-0 flex-1 truncate">{item.nativeName}</span>
                <span className="text-[10px] uppercase muted">{item.code}</span>
                {item.code === active.code ? <Check size={12} /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
