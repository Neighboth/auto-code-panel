"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { updateCustomerProfile } from "@/app/actions/auth";
import { Field } from "@/components/ui";

export function ProfileForm({
  slug,
  customer,
}: {
  slug: string;
  customer: { username: string; displayName: string; email: string; avatarUrl: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(customer.avatarUrl);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 160_000) {
      toast.error("Görsel en fazla 160 KB olabilir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    formData.set("avatarUrl", avatar);
    formData.set("currentUsername", customer.username);
    const result = await updateCustomerProfile(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Profil güncellenemedi.");
      return;
    }
    toast.success(result.message ?? "Profil güncellendi");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-[20px] font-semibold text-white"
          style={{ background: "var(--store-accent)" }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            customer.displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <label className="btn btn-outline btn-sm cursor-pointer">
            <Upload size={12} />
            Avatar yükle
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          </label>
          <p className="mt-1.5 text-[10.5px] muted">PNG/JPG, en fazla 160 KB. Hazır avatar URL&apos;si de girebilirsiniz.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto"
          onClick={() => setAvatar("")}
          disabled={!avatar}
        >
          Avatarı kaldır
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Kullanıcı Adı" hint="Benzersiz olmalıdır. Kütüphane erişiminde kullanılır.">
          <input name="username" defaultValue={customer.username} required minLength={3} maxLength={24} className="input" />
        </Field>
        <Field label="Görünen Ad">
          <input name="displayName" defaultValue={customer.displayName} className="input" />
        </Field>
        <Field label="E-posta (opsiyonel)">
          <input name="email" type="email" defaultValue={customer.email} className="input" />
        </Field>
        <Field label="Avatar URL">
          <input
            value={avatar.startsWith("data:") ? "" : avatar}
            onChange={(event) => setAvatar(event.target.value)}
            placeholder="https://..."
            className="input"
          />
        </Field>
      </div>

      <div className="mt-5 border-t pt-4 hairline">
        <p className="text-[12px] font-semibold">Şifre değiştir</p>
        <p className="mt-0.5 text-[11px] muted">Şifrenizi değiştirmek istemiyorsanız bu alanları boş bırakın.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Mevcut şifre">
            <input name="currentPassword" type="password" className="input" autoComplete="current-password" />
          </Field>
          <Field label="Yeni şifre">
            <input name="newPassword" type="password" className="input" autoComplete="new-password" />
          </Field>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-[12px]" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          Değişiklikleri kaydet
        </button>
      </div>
    </form>
  );
}
