"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, Mail } from "lucide-react";
import type { ActionResult } from "@/lib/types";
import type { MailPrefs } from "@/lib/mail-prefs";

const ITEMS: { key: keyof MailPrefs; label: string; hint: string }[] = [
  { key: "announcements", label: "Duyurular ve güncellemeler", hint: "Yeni özellik, bakım ve sürüm notları." },
  { key: "delivery", label: "Teslimat fişleri", hint: "Kod kullandığınızda ürün özeti e-postası." },
  { key: "license", label: "Lisans uyarıları", hint: "Bayilik süresi dolmadan 3 ve 1 gün önce." },
  { key: "security", label: "Güvenlik bildirimleri", hint: "Giriş, şifre ve 2FA değişiklikleri." },
];

/**
 * Notification switches. Used both by the customer profile and the store
 * settings page; the parent passes the server action so the same UI works for
 * both audiences.
 */
export function MailPreferences({
  audience,
  initial,
  action,
}: {
  audience: "customer" | "store_admin";
  initial: MailPrefs;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [prefs, setPrefs] = useState<MailPrefs>(initial);
  const [pending, setPending] = useState(false);

  function toggle(key: keyof MailPrefs) {
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  async function save() {
    setPending(true);
    const formData = new FormData();
    for (const item of ITEMS) formData.set(item.key, prefs[item.key] ? "on" : "off");
    const result = await action(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Kaydedilemedi");
      return;
    }
    toast.success(result.message ?? "Kaydedildi");
  }

  return (
    <section className="card p-4" aria-labelledby="mail-prefs-title">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg border hairline">
          <BellRing size={15} />
        </span>
        <div>
          <h2 id="mail-prefs-title" className="text-[14px] font-semibold">
            E-posta bildirimleri
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed muted">
            {audience === "customer"
              ? "Hangi e-postaları almak istediğinizi seçin. Her mesajın altında tek tıkla kapatma bağlantısı da bulunur."
              : "Mağaza yöneticisi adresinize hangi e-postaların gideceğini seçin."}
          </p>
        </div>
      </div>

      <div className="mt-3 divide-y rounded-lg border hairline">
        {ITEMS.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 transition hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]"
          >
            <span>
              <span className="block text-[12.5px] font-medium">{item.label}</span>
              <span className="mt-0.5 block text-[11px] muted">{item.hint}</span>
            </span>
            <input
              type="checkbox"
              className="checkbox mt-1"
              checked={prefs[item.key]}
              onChange={() => toggle(item.key)}
              aria-label={item.label}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] muted">
          <Mail size={12} /> Zorunlu güvenlik uyarıları hesap güvenliği için önerilir.
        </p>
        <button type="button" className="btn btn-dark btn-sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : null}
          Kaydet
        </button>
      </div>
    </section>
  );
}
