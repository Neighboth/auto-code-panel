"use client";
import { useT } from "@/components/i18n-provider";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MailX } from "lucide-react";
import { unsubscribeByToken } from "@/app/actions/mail-prefs";

export function UnsubscribeForm({ token }: { token: string }) {
  const t = useT();
  const [pending, setPending] = useState<"announcements" | "all" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(scope: "announcements" | "all") {
    setPending(scope);
    const result = await unsubscribeByToken(token, scope);
    setPending(null);
    if (!result.ok) {
      toast.error(result.message ?? t("x.islem-basarsz"));
      return;
    }
    setDone(result.message ?? t("x.tercihiniz-kaydedildi"));
  }

  if (done) {
    return (
      <div className="mt-5 flex items-start gap-2 rounded-xl border p-4 hairline">
        <CheckCircle2 size={16} className="mt-0.5" style={{ color: "#047857" }} />
        <p className="text-[12.5px] leading-relaxed">{done}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-2.5">
      <button
        type="button"
        className="btn btn-dark w-full justify-center"
        onClick={() => run("announcements")}
        disabled={pending !== null}
      >
        {pending === "announcements" ? <Loader2 size={14} className="animate-spin" /> : <MailX size={14} />}
        {t("x.duyuru-e-postalarn-kapat")}
      </button>
      <button
        type="button"
        className="btn btn-outline w-full justify-center"
        onClick={() => run("all")}
        disabled={pending !== null}
      >
        {pending === "all" ? <Loader2 size={14} className="animate-spin" /> : null}
        {t("x.tum-e-posta-bildirimlerini-kapat")}
      </button>
      <p className="pt-1 text-[11px] leading-relaxed muted">{t("x.hesap-guvenligiyle-ilgili-zorunlu-bildirimler-sifre-degi")}</p>
    </div>
  );
}
