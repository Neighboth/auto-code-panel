"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  activateReseller,
  customerLogin,
  customerLogout,
  customerRegister,
  managerLogin,
  storeAdminLogin,
  storeAdminLogout,
  superAdminLogout,
} from "@/app/actions/auth";
import { slugify } from "@/lib/format";
import { Field } from "@/components/ui";
import { TwoFactorPrompt } from "@/components/security/two-factor-prompt";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-[12.5px]"
      style={{ borderColor: "#fca5a5", background: "#fef2f2", color: "#b91c1c" }}
    >
      {message}
    </div>
  );
}

type TwoFaState = {
  methods: { totp: boolean; passkey: boolean; question: boolean };
  redirectTo: string;
};

function useTwoFaState(): [
  TwoFaState | null,
  (value: TwoFaState | null) => void,
  () => void,
] {
  const [state, setState] = useState<TwoFaState | null>(null);
  return [state, setState, () => setState(null)];
}

/** Keeps redirects inside the store's current URL style (with or without the /slug prefix). */
function localizeStorePath(
  target: string | undefined,
  slug: string,
  basePath: string,
  fallback: string,
): string {
  const value = target ?? fallback;
  const prefix = `/${slug}`;
  if (value === prefix) return basePath || "/";
  if (value.startsWith(`${prefix}/`)) return `${basePath}${value.slice(prefix.length)}`;
  return value;
}

export function ActivationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await activateReseller(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Aktivasyon başarısız.");
      return;
    }
    toast.success(result.message ?? "Mağaza oluşturuldu");
    if (result.redirectTo) {
      router.push(result.redirectTo);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Bayilik Kodu"
        htmlFor="resellerCode"
        hint="Süper admin tarafından üretilen tek kullanımlık kod."
      >
        <input
          id="resellerCode"
          name="resellerCode"
          required
          autoComplete="off"
          placeholder="BAYI-XXXX-XXXX-XXXX"
          className="input mono uppercase tracking-wide"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mağaza Adı" htmlFor="storeName">
          <input
            id="storeName"
            name="storeName"
            required
            placeholder="Mağaza adı"
            className="input"
            onChange={(event) => {
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field
          label="Mağaza ID (slug)"
          htmlFor="slug"
          hint={`Adresiniz: /${slug || "magaza-id"}`}
        >
          <input
            id="slug"
            name="slug"
            required
            value={slug}
            placeholder="magaza-id"
            className="input mono"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Yönetici Kullanıcı Adı"
          htmlFor="adminUsername"
          hint="Tüm platformda benzersiz olmalıdır."
        >
          <input
            id="adminUsername"
            name="adminUsername"
            required
            minLength={3}
            placeholder="yonetici"
            className="input"
            autoComplete="username"
          />
        </Field>
        <Field label="Yönetici E-posta" htmlFor="adminEmail">
          <input
            id="adminEmail"
            name="adminEmail"
            type="email"
            required
            placeholder="owner@magaza.com"
            className="input"
            autoComplete="email"
          />
        </Field>
      </div>

      <Field label="Yönetici Şifresi" htmlFor="adminPassword" hint="En az 6 karakter.">
        <input
          id="adminPassword"
          name="adminPassword"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
          className="input"
          autoComplete="new-password"
        />
      </Field>

      <ErrorBox message={error} />

      <button type="submit" className="btn btn-dark w-full btn-lg" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : null}
        Mağazamı oluştur
      </button>
      <p className="text-center text-[11px] leading-relaxed muted">
        Aktivasyonu tamamlayarak platform kullanım koşullarını kabul etmiş olursunuz.
      </p>
    </form>
  );
}

/** Tek giriş noktası: süper admin ve tüm mağaza yöneticileri bu formdan girer. */
export function ManagerLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFa, setTwoFa] = useTwoFaState();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await managerLogin(new FormData(event.currentTarget));
      if (!result.ok) {
        setError(result.message ?? "Giriş başarısız.");
        return;
      }
      if (result.needs2fa && result.methods) {
        setTwoFa({
          methods: result.methods,
          redirectTo: result.redirectTo ?? "/super-admin",
        });
        return;
      }
      toast.success("Giriş başarılı, paneliniz açılıyor.");
      window.location.assign(result.redirectTo ?? "/super-admin");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Kullanıcı adı veya e-posta" htmlFor="username">
        <input
          id="username"
          name="username"
          required
          className="input"
          autoComplete="username"
          placeholder="Kullanıcı adı veya e-posta"
        />
      </Field>
      <Field label="Şifre" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          className="input"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </Field>
      <ErrorBox message={error} />
      <button type="submit" className="btn btn-gray w-full" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        Giriş yap
      </button>
      {twoFa ? (
        <TwoFactorPrompt
          methods={twoFa.methods}
          redirectTo={twoFa.redirectTo}
          onCancel={() => setTwoFa(null)}
        />
      ) : null}
    </form>
  );
}

export function StoreAdminLoginForm({
  slug,
  storeName,
  basePath,
}: {
  slug: string;
  storeName: string;
  basePath: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFa, setTwoFa] = useTwoFaState();
  const fallback = `${basePath}/admin`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    const result = await storeAdminLogin(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Giriş başarısız.");
      return;
    }
    if (result.needs2fa && result.methods) {
      setTwoFa({
        methods: result.methods,
        redirectTo: localizeStorePath(result.redirectTo, slug, basePath, fallback),
      });
      return;
    }
    toast.success(`${storeName} paneline giriş yapıldı`);
    router.push(localizeStorePath(result.redirectTo, slug, basePath, fallback));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Yönetici kullanıcı adı veya e-posta" htmlFor="username">
        <input id="username" name="username" required className="input" autoComplete="username" />
      </Field>
      <Field label="Şifre" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          className="input"
          autoComplete="current-password"
        />
      </Field>
      <ErrorBox message={error} />
      <button type="submit" className="btn btn-gray w-full" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        Mağaza paneline giriş
      </button>
      {twoFa ? (
        <TwoFactorPrompt
          methods={twoFa.methods}
          redirectTo={twoFa.redirectTo}
          slug={slug}
          basePath={basePath}
          onCancel={() => setTwoFa(null)}
        />
      ) : null}
    </form>
  );
}

export function CustomerAuthForm({
  slug,
  mode,
  autoMessage,
  basePath,
}: {
  slug: string;
  mode: "login" | "register";
  autoMessage?: string;
  basePath: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFa, setTwoFa] = useTwoFaState();
  const [showPassword, setShowPassword] = useState(false);
  const fallback = `${basePath}/kutuphane`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    const result =
      mode === "register" ? await customerRegister(formData) : await customerLogin(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "İşlem başarısız.");
      return;
    }
    if (result.needs2fa && result.methods) {
      setTwoFa({
        methods: result.methods,
        redirectTo: localizeStorePath(result.redirectTo, slug, basePath, fallback),
      });
      return;
    }
    toast.success(result.message ?? "Giriş başarılı");
    router.push(fallback);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {autoMessage ? (
        <p className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed hairline muted">
          {autoMessage}
        </p>
      ) : null}
      <Field label="Kullanıcı Adı" htmlFor="username" hint="3-24 karakter; harf, rakam, nokta, tire.">
        <input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={24}
          className="input"
          autoComplete="username"
        />
      </Field>
      {mode === "register" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Görünen Ad (opsiyonel)" htmlFor="displayName">
            <input id="displayName" name="displayName" className="input" />
          </Field>
          <Field label="E-posta (opsiyonel)" htmlFor="email">
            <input id="email" name="email" type="email" className="input" autoComplete="email" />
          </Field>
        </div>
      ) : null}
      <Field
        label="Şifre"
        htmlFor="password"
        hint={mode === "register" ? "En az 6 karakter." : undefined}
      >
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            className="input pr-16"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-medium muted"
          >
            {showPassword ? "Gizle" : "Göster"}
          </button>
        </div>
      </Field>
      <ErrorBox message={error} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        {mode === "register" ? "Hesap oluştur" : "Giriş yap"}
      </button>
      {twoFa ? (
        <TwoFactorPrompt
          methods={twoFa.methods}
          redirectTo={twoFa.redirectTo}
          slug={slug}
          basePath={basePath}
          onCancel={() => setTwoFa(null)}
        />
      ) : null}
    </form>
  );
}

/**
 * Storefront entry point with two tabs: customers and the store's own manager.
 * Shop owners can sign in from their storefront without hunting for /admin.
 */
export function StoreLoginTabs({
  slug,
  storeName,
  basePath,
  initialTab = "customer",
}: {
  slug: string;
  storeName: string;
  basePath: string;
  initialTab?: "customer" | "manager";
}) {
  const [tab, setTab] = useState<"customer" | "manager">(initialTab);

  return (
    <div>
      <div className="flex items-center gap-1 rounded-xl border p-1 hairline" role="tablist">
        {(["customer", "manager"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className="flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition"
            style={{
              background: tab === item ? "var(--store-primary)" : "transparent",
              color: tab === item ? "#fff" : "var(--fg-muted)",
            }}
          >
            {item === "customer" ? "Müşteri girişi" : "Mağaza yöneticisi"}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "customer" ? (
          <CustomerAuthForm slug={slug} mode="login" basePath={basePath} />
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed muted">
              {storeName} mağazasının yönetici hesabıyla giriş yapın. Bu giriş sizi doğrudan mağaza
              paneline yönlendirir.
            </p>
            <StoreAdminLoginForm slug={slug} storeName={storeName} basePath={basePath} />
          </div>
        )}
      </div>
    </div>
  );
}

export function LogoutButton({
  kind,
  slug,
  basePath,
  className,
  label = "Çıkış yap",
}: {
  kind: "super" | "store" | "customer";
  slug?: string;
  basePath?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    if (kind === "super") {
      const result = await superAdminLogout();
      router.push(result.redirectTo ?? "/super-admin");
    } else if (kind === "store" && slug) {
      await storeAdminLogout(slug);
      const base = basePath ?? `/${slug}`;
      router.push(`${base}/admin/giris`);
    } else if (slug) {
      const formData = new FormData();
      formData.set("slug", slug);
      await customerLogout(formData);
      router.push(basePath === undefined ? `/${slug}` : basePath || "/");
    }
    router.refresh();
    setPending(false);
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={className ?? "btn btn-ghost btn-sm"}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : null}
      {label}
    </button>
  );
}
