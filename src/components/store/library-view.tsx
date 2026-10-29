"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Fingerprint, KeyRound, Loader2, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import { getTwoFactorCode } from "@/app/actions/storefront";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { Modal } from "@/components/modal";

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

type CodeState = { code: string; seconds: number; kind: "steam" | "totp"; digits: number };

function remainingText(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "Sınırsız erişim";
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Süre doldu";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days} gün ${hours} saat kaldı`;
  if (hours > 0) return `${hours} saat ${minutes} dk kaldı`;
  return `${minutes} dk kaldı`;
}

export function LibraryView({ slug, basePath, items }: { slug: string; basePath: string; items: LibraryItem[] }) {
  const [active, setActive] = useState<LibraryItem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [codes, setCodes] = useState<Record<number, CodeState>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [live, setLive] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const fetchCode = useCallback(
    async (item: LibraryItem) => {
      setLoadingId(item.entitlementId);
      setError(null);
      const response = await getTwoFactorCode(slug, item.entitlementId);
      setLoadingId(null);
      if (!response.ok || !response.data) {
        setError(response.message ?? "Kod üretilemedi.");
        return;
      }
      setCodes((current) => ({
        ...current,
        [item.entitlementId]: {
          code: response.data!.code,
          seconds: response.data!.secondsRemaining,
          kind: response.data!.kind,
          digits: response.data!.digits,
        },
      }));
      setLive((current) => ({ ...current, [item.entitlementId]: true }));
    },
    [slug],
  );

  useEffect(() => {
    if (!active) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCodes((current) => {
        const entry = current[active.entitlementId];
        if (!entry) return current;
        if (entry.seconds <= 1) {
          if (live[active.entitlementId]) void fetchCode(active);
          return current;
        }
        return { ...current, [active.entitlementId]: { ...entry, seconds: entry.seconds - 1 } };
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [active, fetchCode, live]);

  const activeCode = active ? codes[active.entitlementId] : undefined;
  const activeLoading = active ? loadingId === active.entitlementId : false;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-9">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5 hairline">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Hesabım</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.025em]">Kütüphanem</h1>
          <p className="mt-1 text-[12.5px] muted">
            {items.length} aktif teslimat. Erişim süresi dolan ürünler otomatik olarak kaldırılır.
          </p>
        </div>
        <span className="badge badge-green">
          <span className="live-dot" /> Canlı kod üretimi aktif
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed px-6 py-16 text-center hairline">
          <KeyRound size={22} className="mx-auto muted" />
          <p className="mt-2 text-[13px] font-medium">Kütüphaneniz boş</p>
          <p className="mt-1 text-[11.5px] muted">
            Bir redeem kodu kullanarak oyun ve hesap teslimatı alabilirsiniz.
          </p>
          <a href={`${basePath}/kod-gir`} className="btn btn-primary btn-sm mt-4">
            Kod kullan
          </a>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.entitlementId}
              type="button"
              onClick={() => {
                setActive(item);
                setError(null);
              }}
              className="card overflow-hidden text-left transition hover:-translate-y-0.5"
            >
              <div className="relative aspect-[460/215]" style={{ background: "var(--bg)" }}>
                {item.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverImage} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center muted">
                    <KeyRound size={24} />
                  </div>
                )}
                <span className="absolute right-2 top-2 badge" style={{ background: "var(--bg-elevated)" }}>
                  {item.platformLabel}
                </span>
              </div>
              <div className="p-4">
                <p className="truncate text-[13.5px] font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[10.5px] muted">{item.subtitle}</p>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] muted">
                  <Clock3 size={11} />
                  {remainingText(item.expiresAt, now)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.title}
        description={active ? `${active.platformLabel} · ${active.subtitle}` : undefined}
        size="lg"
      >
        {active ? (
          <div className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {active.username ? (
                <Credential label="Kullanıcı adı" value={active.username} />
              ) : null}
              {active.email ? <Credential label="E-posta" value={active.email} /> : null}
              {active.password ? <Credential label="Şifre" value={active.password} mono /> : null}
              {active.mailEmail ? <Credential label="Bağlı e-posta" value={active.mailEmail} /> : null}
              {active.mailPassword ? <Credential label="E-posta şifresi" value={active.mailPassword} mono /> : null}
            </div>

            {active.guardType !== "none" ? (
              <div className="rounded-xl border p-4 hairline" style={{ background: "color-mix(in srgb, var(--store-accent) 4%, transparent)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Fingerprint size={15} />
                    <div>
                      <p className="text-[12px] font-semibold">
                        {active.guardType === "steam_guard" ? "Steam Guard kodu" : "2FA (TOTP) kodu"}
                      </p>
                      <p className="text-[10.5px] muted">
                        Kod sunucuda üretilir · secret tarayıcıya gönderilmez
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => fetchCode(active)}
                    disabled={activeLoading}
                  >
                    {activeLoading ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                    {active.guardType === "steam_guard" ? "Steam Guard Kodu Al" : "2FA Kodu Al"}
                  </button>
                </div>

                {activeCode ? (
                  <div className="mt-3">
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="mono text-[30px] font-semibold leading-none tracking-[0.22em]">
                          {activeCode.code}
                        </span>
                        <CopyButton value={activeCode.code} compact />
                      </div>
                      <div className="text-right">
                        <p className="mono text-[12px] font-semibold tabular-nums">{activeCode.seconds}s</p>
                        <p className="text-[10px] muted">
                          {activeCode.kind === "steam" ? "5 haneli Steam Guard" : "6 haneli TOTP"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${(activeCode.seconds / 30) * 100}%`,
                          background: "var(--store-accent)",
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10.5px] muted">
                        {live[active.entitlementId] ? "Canlı mod açık, kod otomatik yenilenir." : "Canlı mod kapalı."}
                      </span>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[10.5px] font-medium muted"
                        onClick={() =>
                          setLive((current) => ({ ...current, [active.entitlementId]: !current[active.entitlementId] }))
                        }
                      >
                        <RefreshCw size={11} />
                        {live[active.entitlementId] ? "Canlı modu kapat" : "Canlı modu aç"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[11px] muted">
                    <Timer size={11} />
                    Kodu görüntülemek için yukarıdaki butona basın.
                  </p>
                )}
                {error ? (
                  <p className="mt-2 text-[11.5px]" style={{ color: "#dc2626" }}>
                    {error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border px-3 py-2.5 text-[11.5px] muted hairline">
                Bu hesap için 2FA/Guard tanımlı değil. Kullanıcı adı ve şifre ile giriş yapabilirsiniz.
              </p>
            )}

            {active.notes ? (
              <div className="rounded-lg border px-3.5 py-3 hairline">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">
                  Ek notlar / kurallar
                </p>
                <Markdown content={active.notes} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 hairline">
              <span className="flex items-center gap-1.5 text-[11px] muted">
                <Clock3 size={11} />
                {remainingText(active.expiresAt, now)}
                {active.expiresAt ? ` · ${new Date(active.expiresAt).toLocaleString("tr-TR")}` : ""}
              </span>
              <span className="badge badge-green">
                <ShieldCheck size={11} /> Aktif teslimat
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Credential({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hairline">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">{label}</p>
        <p className={`mt-0.5 truncate text-[12.5px] font-medium ${mono ? "mono" : ""}`}>{value}</p>
      </div>
      <CopyButton value={value} compact />
    </div>
  );
}
