"use client";
import { useT } from "@/components/i18n-provider";

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
  sessionReady,
  storeAdminLogin,
  storeAdminLogout,
  superAdminLogout,
} from "@/app/actions/auth";
import { slugify } from "@/lib/format";
import { Field } from "@/components/ui";
import { TwoFactorPrompt } from "@/components/security/two-factor-prompt";
import { EmailVerifyCard } from "@/components/store/email-verify";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="note note-danger text-[12.5px]">{message}</div>;
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

/**
 * Verifies server-side that the session cookie survived, and returns an error
 * text when the browser dropped it.
 *
 * Without this check a blocked cookie looks like a successful login followed by
 * a mysterious bounce back to the form ("panel opens for a second and closes").
 */
async function cookieBlockedMessage(kind: "super" | "store" | "customer"): Promise<string | null> {
  const result = await sessionReady(kind);
  if (result.data?.kept) return null;
  return result.message || "cookie";
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
  const t = useT();
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
      setError(result.message ?? t("x.aktivasyon-basarsz"));
      return;
    }
    toast.success(result.message ?? t("x.magaza-olusturuldu"));
    if (result.redirectTo) {
      router.push(result.redirectTo);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label={t("x.bayilik-kodu")}
        htmlFor="resellerCode"
        hint={t("x.super-admin-tarafndan-uretilen-tek-kullanmlk-kod")}
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
        <Field label={t("x.magaza-ad")} htmlFor="storeName">
          <input
            id="storeName"
            name="storeName"
            required
            placeholder={t("x.magaza-ad-2")}
            className="input"
            onChange={(event) => {
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field
          label={t("x.magaza-id-slug")}
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
          label={t("x.yonetici-kullanc-ad")}
          htmlFor="adminUsername"
          hint={t("x.tum-platformda-benzersiz-olmaldr")}
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
        <Field label={t("x.yonetici-e-posta")} htmlFor="adminEmail">
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

      <Field label={t("x.yonetici-sifresi")} htmlFor="adminPassword" hint="En az 6 karakter.">
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
        {t("x.magazam-olustur")}
      </button>
      <p className="text-center text-[11px] leading-relaxed muted">{t("x.aktivasyonu-tamamlayarak-platform-kullanm-kosullarn-kabu")}</p>
    </form>
  );
}

/** Tek giriş noktası: süper admin ve tüm mağaza yöneticileri bu formdan girer. */
export function ManagerLoginForm() {
  const t = useT();
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
        setError(result.message ?? t("x.giris-basarsz"));
        return;
      }
      if (result.needs2fa && result.methods) {
        setTwoFa({
          methods: result.methods,
          redirectTo: result.redirectTo ?? "/super-admin",
        });
        return;
      }
      const blocked = await cookieBlockedMessage("super");
      if (blocked) {
        setError(blocked);
        return;
      }
      toast.success(t("x.giris-basarl-paneliniz-aclyor"));
      // Hard navigation: the panel must be rendered by the server with the new
      // cookie, never from the client router cache (that cache is what showed the
      // panel for a second before sending the user back to the form).
      window.location.assign(result.redirectTo ?? "/super-admin");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={t("x.kullanc-ad-veya-e-posta")} htmlFor="username">
        <input
          id="username"
          name="username"
          required
          className="input"
          autoComplete="username"
          placeholder={t("x.kullanc-ad-veya-e-posta")}
        />
      </Field>
      <Field label={t("x.sifre")} htmlFor="password">
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
        {t("x.giris-yap")}
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
  locale = "tr",
}: {
  slug: string;
  storeName: string;
  basePath: string;
  locale?: string;
}) {
  const t = useT();
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
      setError(result.message ?? t("x.giris-basarsz"));
      return;
    }
    if (result.needs2fa && result.methods) {
      setTwoFa({
        methods: result.methods,
        redirectTo: localizeStorePath(result.redirectTo, slug, basePath, fallback),
      });
      return;
    }
    const blocked = await cookieBlockedMessage("store");
    if (blocked) {
      setError(blocked);
      return;
    }
    toast.success(`${storeName} ${t("auth.storeLoginSuccess")}`);
    window.location.assign(localizeStorePath(result.redirectTo, slug, basePath, fallback));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={t("auth.managerUsername")} htmlFor="username">
        <input id="username" name="username" required className="input" autoComplete="username" />
      </Field>
      <Field label={t("auth.password")} htmlFor="password">
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
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        {t("auth.managerLogin")}
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
  locale = "tr",
}: {
  slug: string;
  mode: "login" | "register";
  autoMessage?: string;
  basePath: string;
  locale?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFa, setTwoFa] = useTwoFaState();
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState<{
    id: number | null;
    email: string | null;
  } | null>(null);
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
      setError(result.message ?? t("x.islem-basarsz-2"));
      return;
    }
    if (result.needsEmailVerification || result.verificationId) {
      setVerification({
        id: result.verificationId ?? null,
        email: result.verificationEmail ?? result.data?.email ?? null,
      });
      toast.success(result.message ?? t("x.dogrulama-kodu-gonderildi"));
      return;
    }
    if (result.needs2fa && result.methods) {
      setTwoFa({
        methods: result.methods,
        redirectTo: localizeStorePath(result.redirectTo, slug, basePath, fallback),
      });
      return;
    }
    const blocked = await cookieBlockedMessage("customer");
    if (blocked) {
      setError(blocked);
      return;
    }
    toast.success(result.message ?? t("x.giris-basarl"));
    window.location.assign(fallback);
  }

  if (verification) {
    return (
      <EmailVerifyCard
        slug={slug}
        basePath={basePath}
        email={verification.email ?? undefined}
        verificationId={verification.id}
        redirectTo={fallback}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {autoMessage ? (
        <p className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed hairline muted">
          {autoMessage}
        </p>
      ) : null}
      <Field label={t("auth.username")} htmlFor="username" hint={t("auth.usernameHint")}>
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
          <Field label={t("auth.displayNameOptional")} htmlFor="displayName">
            <input id="displayName" name="displayName" className="input" />
          </Field>
          <Field label={t("auth.emailOptional")} htmlFor="email">
            <input id="email" name="email" type="email" className="input" autoComplete="email" />
          </Field>
        </div>
      ) : null}
      <Field
        label={t("auth.password")}
        htmlFor="password"
        hint={mode === "register" ? t("auth.passwordHint") : undefined}
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
            {showPassword ? t("auth.hide") : t("auth.show")}
          </button>
        </div>
      </Field>
      <ErrorBox message={error} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        {mode === "register" ? t("auth.createAccount") : t("auth.login")}
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
  locale = "tr",
}: {
  slug: string;
  storeName: string;
  basePath: string;
  initialTab?: "customer" | "manager";
  locale?: string;
}) {
  const [tab, setTab] = useState<"customer" | "manager">(initialTab);
  const t = useT();

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
            {item === "customer" ? t("auth.customerTab") : t("auth.managerTab")}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "customer" ? (
          <CustomerAuthForm slug={slug} mode="login" basePath={basePath} locale={locale} />
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed muted">
              {storeName} {t("auth.managerNote")}
            </p>
            <StoreAdminLoginForm
              slug={slug}
              storeName={storeName}
              basePath={basePath}
              locale={locale}
            />
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
  label,
}: {
  kind: "super" | "store" | "customer";
  slug?: string;
  basePath?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    let target = "/";
    if (kind === "super") {
      const result = await superAdminLogout();
      target = result.redirectTo ?? "/super-admin";
    } else if (kind === "store" && slug) {
      await storeAdminLogout(slug);
      target = `${basePath ?? `/${slug}`}/admin/giris`;
    } else if (slug) {
      const formData = new FormData();
      formData.set("slug", slug);
      await customerLogout(formData);
      target = basePath === undefined ? `/${slug}` : basePath || "/";
    }
    setPending(false);
    // Full reload so no cached panel markup survives the logout.
    window.location.assign(target);
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={className ?? "btn btn-ghost btn-sm"}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : null}
      {label ?? t("x.cks-yap")}
    </button>
  );
}
