"use client";
import { useT } from "@/components/i18n-provider";

import { Fragment, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Filter, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Badge, Button, EmptyState, buttonClass, cn } from "@/components/ui";
import type { AuditPage } from "@/lib/audit";

const SEVERITY_LABEL: Record<string, string> = {
  info: "x.bilgi",
  warn: "x.uyar",
  critical: "x.kritik",
};

const ACTOR_LABEL: Record<string, string> = {
  super: "x.super-admin",
  store: "x.magaza-yoneticisi",
  customer: "x.musteri",
  system: "x.sistem",
};

/** Human readable action name: `store.product.create` → t("x.urun-olustur"). */
const ACTION_LABEL: Record<string, string> = {
  "store.product.create": "x.urun-eklendi",
  "store.product.update": "x.urun-guncellendi",
  "store.product.delete": "x.urun-silindi",
  "store.account.create": "Hesap eklendi",
  "store.account.update": "x.hesap-guncellendi",
  "store.account.delete": "Hesap silindi",
  "store.code.create": "x.kod-olusturuldu",
  "store.code.bulk": "x.toplu-kod-islemi",
  "store.code.delete": "Kod silindi",
  "store.settings.update": "x.magaza-ayarlar-guncellendi",
  "store.domain.add": "x.ozel-alan-ad-eklendi",
  "store.domain.remove": "x.ozel-alan-ad-kaldrld",
  "store.customer.create": "x.musteri-eklendi",
  "store.customer.update": "x.musteri-guncellendi",
  "store.customer.delete": "x.musteri-silindi",
  "store.customer.bulk": "x.toplu-musteri-islemi",
  "super.store.suspend": "x.magaza-askya-alnd",
  "super.store.resume": "x.magaza-aktiflestirildi",
  "super.store.extend": "x.lisans-suresi-uzatld",
  "super.accounts.reveal": "x.hesap-sifreleri-goruntulendi",
  "super.post.create": "x.duyuru-yaynland",
  "super.post.update": "x.duyuru-guncellendi",
  "super.post.delete": "Duyuru silindi",
  "super.post.pin": "Duyuru sabitlendi",
  "super.settings.update": "x.sistem-ayarlar-guncellendi",
  "super.reseller_keys.create": "x.bayilik-kodu-uretildi",
  "super.reseller_keys.revoke": "Bayilik kodu iptal edildi",
  "super.user.update": "x.kullanc-guncellendi",
  "super.user.delete": "x.kullanc-silindi",
  "auth.login": "x.giris-yapld",
  "auth.login.failed": "x.basarsz-giris",
  "auth.signup": "x.kayt-olundu",
  "auth.logout": "x.cks-yapld",
  "auth.password.change": "x.sifre-degistirildi",
  "email.verification.sent": "x.dogrulama-e-postas-gonderildi",
  "email.verification.failed": "x.dogrulama-basarsz",
  "mail.announcement.broadcast": "x.duyuru-e-postas-gonderildi",
  "security.factor.add": "x.2fa-faktoru-eklendi",
  "security.factor.remove": "x.2fa-faktoru-kaldrld",
  "code.redeem": "x.kod-kullanld",
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
  const t = useT();
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
              placeholder={t("x.ozet-varlk-ip-veya-yonetici-ara")}
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
            aria-label={t("x.islem-turu")}
          >
            <option value="">{" "}{t("x.tum-islemler")}</option>
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
            aria-label={t("x.onem")}
          >
            <option value="">{" "}{t("x.tum-onemler")}</option>
            <option value="info">{t("x.bilgi")}</option>
            <option value="warn">{t("x.uyar")}</option>
            <option value="critical">Kritik</option>
          </select>
          <input
            className="input w-auto"
            placeholder={t("x.yonetici-magaza")}
            defaultValue={filters.actor}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply({ actor: (event.target as HTMLInputElement).value });
            }}
            aria-label={t("x.yonetici")}
          />
          <input
            className="input w-auto"
            type="date"
            value={filters.from}
            onChange={(event) => apply({ from: event.target.value })}
            aria-label={t("x.baslangc")}
          />
          <input
            className="input w-auto"
            type="date"
            value={filters.to}
            onChange={(event) => apply({ to: event.target.value })}
            aria-label={t("x.bitis")}
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
            <RefreshCw size={14} />{t("x.sfrla")}</Button>
        </div>
        <p className="mt-2 text-[11.5px] muted">
          {pending ? t("x.yukleniyor") : t("x.total-kayt-sayfa-page-pages", { total: pageData.total, page: pageData.page, pages })} · {t("x.islem-3")}
          {t("x.kimligi-yonetici-ip-ve-tarayc-bilgisi-her-kaytta-saklanr")}
        </p>
      </div>

      {pageData.rows.length === 0 ? (
        <EmptyState
          title={t("x.henuz-kayt-yok")}
          description={t("x.panelde-yaplan-her-islem-burada-listelenir-filtreleri-sf")}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead className="border-b text-[11px] uppercase tracking-[0.08em] muted hairline">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t("x.zaman")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("x.islem")}</th>
                  <th className="px-4 py-2.5 font-semibold">Yapan</th>
                  <th className="px-4 py-2.5 font-semibold">{t("x.magaza")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("x.ozet")}</th>
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
                        <td className="max-w-[280px] px-4 py-2.5">{row.summaryKey ? t(row.summaryKey, row.summaryParams) : row.summary || "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] muted">{row.ip || "—"}</td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={t("x.detay")}
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
                                  <span className="muted">{t("x.varlk")}</span> {row.entity || "—"}
                                  {row.entityId ? ` #${row.entityId}` : ""}
                                </p>
                                <p>
                                  <span className="muted">{" "}{t("x.kayt-no")}</span> #{row.id}
                                </p>
                                <p className="break-all">
                                  <span className="muted">{t("x.tarayc")}</span>{" "}
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
          >{t("x.onceki")}</Button>
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
