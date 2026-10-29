"use client";
import { useT } from "@/components/i18n-provider";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Unlock } from "lucide-react";
import { viewStoreAccounts, type StoreAccountView } from "@/app/actions/super-admin";
import { CopyButton } from "@/components/copy-button";
import { Modal } from "@/components/modal";

export function StoreAccountsButton({ storeId, storeName }: { storeId: number; storeName: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<StoreAccountView[] | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  async function openModal() {
    setOpen(true);
    setLoading(true);
    const result = await viewStoreAccounts(storeId);
    setLoading(false);
    if (!result.ok || !result.data) {
      toast.error(result.message ?? t("x.goruntulenemedi"));
      setAccounts(null);
      return;
    }
    setAccounts(result.data);
  }

  function toggleReveal(id: number) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={openModal}>
        <Unlock size={12} />
        Hesaplar
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("x.store-envanter-hesaplar", { store: storeName })}
        description={t("x.yalnzca-platform-sahibine-acktr")}
        size="lg"
      >
        <div className="note note-warn flex items-start gap-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p className="text-[11.5px] font-medium leading-relaxed">{t("x.uyari-bu-veriler-yalnzca-teknik-destek-amacyla-goruntule")}</p>
        </div>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[12.5px] muted">
            <Loader2 size={14} className="animate-spin" />{t("x.hesaplar-cozuluyor")}</p>
        ) : accounts && accounts.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border hairline scroll-thin">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>{" "}{t("x.platform-kullanc")}</th>
                  <th>{t("x.sifre")}</th>
                  <th>Koruma / secret</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const shown = revealed.has(account.id);
                  return (
                    <tr key={account.id}>
                      <td>
                        <p className="text-[12.5px] font-medium">{account.username || account.email || `Hesap #${account.id}`}</p>
                        <p className="text-[10.5px] muted">{account.platformLabel} · #{account.id}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <code className="mono text-[11px]">
                            {shown && account.password ? (account.password.length > 10 ? `••••${account.password.slice(-4)}` : account.password) : "••••"}
                          </code>
                          <CopyButton value={account.password} compact />
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px]">
                            {account.guardType === "steam_guard"
                              ? `Steam Guard${shown && account.steamSecret ? ` · ••••${account.steamSecret.slice(-4)}` : ""}`
                              : account.guardType === "totp"
                                ? `TOTP${shown && account.totpSecret ? ` · ••••${account.totpSecret.slice(-4)}` : ""}`
                                : t("x.korumasz")}
                          </span>
                          {account.steamSecret || account.totpSecret ? (
                            <CopyButton
                              value={account.steamSecret || account.totpSecret}
                              compact
                              hideOnMasked={!shown}
                            />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => toggleReveal(account.id)}
                            className="text-[10.5px] font-medium underline underline-offset-2 muted"
                          >
                            {shown ? "Gizle" : t("x.goster")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 py-6 text-center text-[12.5px] muted">{" "}{t("x.bu-magazada-envanter-hesab-yok")}</p>
        )}
      </Modal>
    </>
  );
}
