"use client";
import { useT } from "@/components/i18n-provider";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, ShieldAlert, Store, Users } from "lucide-react";
import { setStoreLoginPassword, viewStoreLogins, type LoginView } from "@/app/actions/super-admin";
import { CopyButton } from "@/components/copy-button";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";

/**
 * Platform owner: view and reset the store manager / customer passwords of one
 * store. The values come from the encrypted recovery vault; rows that predate
 * it show a "set a new password" action instead.
 */
export function StoreLoginsButton({ storeId, storeName }: { storeId: number; storeName: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LoginView[] | null>(null);
  const [tab, setTab] = useState<"admin" | "customer">("admin");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LoginView | null>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    const result = await viewStoreLogins(storeId);
    setLoading(false);
    if (!result.ok || !result.data) {
      toast.error(result.message ?? t("x.goruntulenemedi"));
      setRows(null);
      return;
    }
    setRows(result.data);
  }

  const key = (row: LoginView) => `${row.kind}:${row.id}`;
  function toggle(row: LoginView) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(key(row))) next.delete(key(row));
      else next.add(key(row));
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setPending(true);
    const formData = new FormData();
    formData.set("kind", editing.kind);
    formData.set("id", String(editing.id));
    formData.set("password", password);
    const result = await setStoreLoginPassword(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.sifre-guncellendi"));
    setEditing(null);
    setPassword("");
    await load();
  }

  const list = (rows ?? []).filter((row) => row.kind === tab);

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={load}>
        <KeyRound size={12} />
        {t("x.giris-bilgileri")}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("x.store-giris-bilgileri", { store: storeName })}
        description={t("x.yonetici-ve-musteri-sifreleri-yalnzca-platform-sahibine-acktr")}
        size="lg"
      >
        <div className="note note-warn flex items-start gap-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p className="text-[11.5px] font-medium leading-relaxed">{t("x.sifreler-destek-amacyla-cozulur-her-erisim-kaydedilir")}</p>
        </div>

        <div className="mt-3 flex gap-1">
          {(["admin", "customer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: tab === value ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                color: tab === value ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {value === "admin" ? <Store size={13} /> : <Users size={13} />}
              {value === "admin" ? t("x.yonetici-hesaplar") : t("x.magaza-musterileri")}
              <span className="text-[10.5px] muted">{(rows ?? []).filter((row) => row.kind === value).length}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] muted">
            <Loader2 size={14} className="animate-spin" />
            {t("common.loading")}
          </p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] muted">{t("x.kayt-bulunamad")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto scroll-thin">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>{t("x.kullanc")}</th>
                  <th>{t("common.password")}</th>
                  <th className="text-right">{t("x.islem")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const shown = revealed.has(key(row));
                  return (
                    <tr key={key(row)}>
                      <td>
                        <p className="text-[12.5px] font-medium">{row.username}</p>
                        <p className="text-[10.5px] muted">{row.email || "—"}</p>
                      </td>
                      <td>
                        {row.password ? (
                          <div className="flex items-center gap-1.5">
                            <span className="mono text-[12px]">
                              {shown ? row.password : "•".repeat(Math.min(12, Math.max(6, row.password.length)))}
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={shown ? t("x.gizle") : t("x.goster")}
                              onClick={() => toggle(row)}
                            >
                              {shown ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <CopyButton value={row.password} />
                          </div>
                        ) : (
                          <span className="text-[11px] muted">{t("x.kaytl-degil-sifre-belirleyin")}</span>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setEditing(row);
                              setPassword("");
                            }}
                          >
                            {row.password ? t("x.sifre-degistir") : t("x.sifre-belirle")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.password ? t("x.sifre-degistir") : t("x.sifre-belirle")}
        description={editing ? `${editing.username} · ${storeName}` : undefined}
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label={t("x.yeni-sifre")} hint={t("x.en-az-8-karakter-buyuk-kucuk-harf-ve-rakam")}>
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input mono"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
