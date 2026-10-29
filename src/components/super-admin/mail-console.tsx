"use client";
import { useT } from "@/components/i18n-provider";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { sendTestMail } from "@/app/actions/mail-admin";
import type { MailStats } from "@/app/actions/mail-admin";
import { Badge } from "@/components/ui";

const KIND_LABEL: Record<string, string> = {
  verification: "x.dogrulama",
  welcome: "x.karslama",
  license: "x.lisans-hatrlatma",
  announcement: "Duyuru",
  delivery: "x.teslim-fisi",
  security: "x.guvenlik",
  test: "Test",
  generic: "Genel",
};

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "blue" | "neutral"> = {
  sent: "green",
  skipped: "amber",
  failed: "red",
  duplicate: "blue",
};

export function MailConsole({ stats }: { stats: MailStats }) {
  const t = useT();
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    const result = await sendTestMail(to);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.gonderilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.gonderildi"));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">{" "}{t("x.toplam-kayt")}</p>
          <p className="mt-1 text-[22px] font-semibold tabular-nums">{stats.total}</p>
        </div>
        {stats.byStatus.length === 0 ? (
          <div className="card p-3.5 sm:col-span-3">
            <p className="text-[12px] muted">{" "}{t("x.henuz-e-posta-gonderilmedi")}</p>
          </div>
        ) : (
          stats.byStatus.map((row) => (
            <div key={row.status} className="card p-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">{row.status}</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums">{row.count}</p>
            </div>
          ))
        )}
      </div>

      <div className="card p-4">
        <h2 className="text-[13.5px] font-semibold">{" "}{t("x.test-e-postas")}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed muted">{t("x.smtp-bilgilerinin-dogru-oldugunu-buradan-kontrol-edebili")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            type="email"
            placeholder="ornek@adres.com"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Test e-posta adresi"
          />
          <button type="button" className="btn btn-dark btn-sm" onClick={send} disabled={pending}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {t("x.test-gonder")}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b px-4 py-3 hairline">
          <h2 className="text-[13.5px] font-semibold">{" "}{t("x.son-gonderimler")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>{t("x.zaman")}</th>
                <th>{t("x.tur")}</th>
                <th>{t("x.durum")}</th>
                <th>{t("x.alc")}</th>
                <th>{t("x.detay")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[12px] muted">{t("x.kayt-yok")}</td>
                </tr>
              ) : null}
              {stats.recent.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-[11.5px] tabular-nums">
                    {new Date(row.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-[12px]">{KIND_LABEL[row.kind] ?? row.kind}</td>
                  <td>
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>
                  </td>
                  <td className="text-[11.5px]">{row.recipient || "—"}</td>
                  <td className="max-w-[280px] truncate text-[11px] muted">{row.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
