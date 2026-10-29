"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Filter, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Badge, Button, EmptyState, buttonClass, cn } from "@/components/ui";
import type { AuditPage } from "@/lib/audit";

const SEVERITY_LABEL: Record<string, string> = {
  info: "Bilgi",
  warn: "Uyarı",
  critical: "Kritik",
};

const ACTOR_LABEL: Record<string, string> = {
  super: "Süper admin",
  store: "Mağaza yöneticisi",
  customer: "Müşteri",
  system: "Sistem",
};

/** Human readable action name: `store.product.create` → "Ürün oluştur". */
const ACTION_LABEL: Record<string, string> = {
  "store.product.create": "Ürün eklendi",
  "store.product.update": "Ürün güncellendi",
  "store.product.delete": "Ürün silindi",
  "store.account.create": "Hesap eklendi",
  "store.account.update": "Hesap güncellendi",
  "store.account.delete": "Hesap silindi",
  "store.code.create": "Kod oluşturuldu",
  "store.code.bulk": "Toplu kod işlemi",
  "store.code.delete": "Kod silindi",
  "store.settings.update": "Mağaza ayarları güncellendi",
  "store.domain.add": "Özel alan adı eklendi",
  "store.domain.remove": "Özel alan adı kaldırıldı",
  "store.customer.create": "Müşteri eklendi",
  "store.customer.update": "Müşteri güncellendi",
  "store.customer.delete": "Müşteri silindi",
  "store.customer.bulk": "Toplu müşteri işlemi",
  "super.store.suspend": "Mağaza askıya alındı",
  "super.store.resume": "Mağaza aktifleştirildi",
  "super.store.extend": "Lisans süresi uzatıldı",
  "super.accounts.reveal": "Hesap şifreleri görüntülendi",
  "super.post.create": "Duyuru yayınlandı",
  "super.post.update": "Duyuru güncellendi",
  "super.post.delete": "Duyuru silindi",
  "super.post.pin": "Duyuru sabitlendi",
  "super.settings.update": "Sistem ayarları güncellendi",
  "super.reseller_keys.create": "Bayilik kodu üretildi",
  "super.reseller_keys.revoke": "Bayilik kodu iptal edildi",
  "super.user.update": "Kullanıcı güncellendi",
  "super.user.delete": "Kullanıcı silindi",
  "auth.login": "Giriş yapıldı",
  "auth.login.failed": "Başarısız giriş",
  "auth.signup": "Kayıt olundu",
  "auth.logout": "Çıkış yapıldı",
  "auth.password.change": "Şifre değiştirildi",
  "email.verification.sent": "Doğrulama e-postası gönderildi",
  "email.verification.failed": "Doğrulama başarısız",
  "mail.announcement.broadcast": "Duyuru e-postası gönderildi",
  "security.factor.add": "2FA faktörü eklendi",
  "security.factor.remove": "2FA faktörü kaldırıldı",
  "code.redeem": "Kod kullanıldı",
};

function labelFor(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

export function AuditLogView({
  pageData,
  filters,
}: {
  pageData: AuditPage;
  filters: {
    q: string;
    action: string;
    severity: string;
    actor: string;
    from: string;
    to: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<number | null>(null);
  const [term, setTerm] = useState(filters.q);
  const [pending, startTransition] = useTransition();

  const pages = Math.max(1, Math.ceil(pageData.total / pageData.pageSize));

  const query = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    return next;
  }, [params]);

  function apply(patch: Record<string, string>) {
    const next = new URLSearchParams(query.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const exportHref = `/api/super-admin/audit/export?${query.toString()}`;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
            <input
              className="input pl-9"
              placeholder="Özet, varlık, IP veya yönetici ara…"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") apply({ q: term });
              }}
            />
          </div>
          <select
            className="input w-auto min-w-[180px]"
            value={filters.action}
            onChange={(event) => apply({ action: event.target.value })}
            aria-label="İşlem türü"
          >
            <option value="">Tüm işlemler</option>
            {pageData.actions.map((item) => (
              <option key={item.action} value={item.action}>
                {labelFor(item.action)} ({item.count})
              </option>
            ))}
          </select>
          <select
            className="input w-auto min-w-[130px]"
            value={filters.severity}
            onChange={(event) => apply({ severity: event.target.value })}
            aria-label="Önem"
          >
            <option value="">Tüm önemler</option>
            <option value="info">Bilgi</option>
            <option value="warn">Uyarı</option>
            <option value="critical">Kritik</option>
          </select>
          <input
            className="input w-auto"
            placeholder="Yönetici / mağaza"
            defaultValue={filters.actor}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply({ actor: (event.target as HTMLInputElement).value });
            }}
            aria-label="Yönetici"
          />
          <input
            className="input w-auto"
            type="date"
            value={filters.from}
            onChange={(event) => apply({ from: event.target.value })}
            aria-label="Başlangıç"
          />
          <input
            className="input w-auto"
            type="date"
            value={filters.to}
            onChange={(event) => apply({ to: event.target.value })}
            aria-label="Bitiş"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => apply({ q: term })}>
            <Filter size={14} /> Filtrele
          </Button>
          <a className={buttonClass("ghost", "sm")} href={exportHref}>
            <Download size={14} /> CSV
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTerm("");
              startTransition(() => router.push(pathname));
            }}
          >
            <RefreshCw size={14} /> Sıfırla
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] muted">
          {pending ? "Yükleniyor…" : `${pageData.total} kayıt · sayfa ${pageData.page}/${pages}`} · İşlem
          kimliği, yönetici, IP ve tarayıcı bilgisi her kayıtta saklanır.
        </p>
      </div>

      {pageData.rows.length === 0 ? (
        <EmptyState
          title="Henüz kayıt yok"
          description="Panelde yapılan her işlem burada listelenir. Filtreleri sıfırlayarak tüm kayıtları görebilirsiniz."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead className="border-b text-[11px] uppercase tracking-[0.08em] muted hairline">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Zaman</th>
                  <th className="px-4 py-2.5 font-semibold">İşlem</th>
                  <th className="px-4 py-2.5 font-semibold">Yapan</th>
                  <th className="px-4 py-2.5 font-semibold">Mağaza</th>
                  <th className="px-4 py-2.5 font-semibold">Özet</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pageData.rows.map((row) => {
                  const expanded = open === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={cn("border-b align-top transition hairline", expanded && "bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]")}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                          {new Date(row.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" })}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{labelFor(row.action)}</span>
                            {row.severity !== "info" ? (
                              <Badge tone={row.severity === "critical" ? "red" : "amber"}>
                                {row.severity === "critical" ? <ShieldAlert size={11} /> : null}
                                {SEVERITY_LABEL[row.severity] ?? row.severity}
                              </Badge>
                            ) : null}
                          </div>
                          <span className="mt-0.5 block font-mono text-[10.5px] muted">{row.action}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.actorName}
                          <span className="mt-0.5 block text-[10.5px] muted">
                            {ACTOR_LABEL[row.actorType] ?? row.actorType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {row.storeSlug ? <span className="font-mono text-[11.5px]">/{row.storeSlug}</span> : <span className="muted">—</span>}
                        </td>
                        <td className="max-w-[280px] px-4 py-2.5">{row.summary || "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] muted">{row.ip || "—"}</td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label="Detay"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : row.id)}
                          >
                            <ChevronDown
                              size={14}
                              className={cn("transition-transform", expanded && "rotate-180")}
                            />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b hairline">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">
                                  Ek veri
                                </p>
                                <pre className="max-h-56 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed hairline">
                                  {pretty(row.metadata)}
                                </pre>
                              </div>
                              <div className="space-y-1 text-[11.5px]">
                                <p>
                                  <span className="muted">Varlık:</span> {row.entity || "—"}
                                  {row.entityId ? ` #${row.entityId}` : ""}
                                </p>
                                <p>
                                  <span className="muted">Kayıt no:</span> #{row.id}
                                </p>
                                <p className="break-all">
                                  <span className="muted">Tarayıcı:</span>{" "}
                                  {row.userAgent || "—"}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageData.page <= 1}
            onClick={() => apply({ page: String(pageData.page - 1) })}
          >
            Önceki
          </Button>
          <span className="text-[12px] muted">
            {pageData.page} / {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageData.page >= pages}
            onClick={() => apply({ page: String(pageData.page + 1) })}
          >
            Sonraki
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function pretty(value: string): string {
  if (!value || value === "{}") return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
