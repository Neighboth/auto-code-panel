"use client";
import { useT } from "@/components/i18n-provider";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, Loader2, Trash2, Users } from "lucide-react";
import { bulkCustomerAction } from "@/app/actions/store-customers";
import { Modal } from "@/components/modal";
import { buttonClass, cn } from "@/components/ui";

export type CustomerRow = {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  deliveryCount: number;
  status: string;
};

type BulkAction = "ban" | "unban" | "delete";

const CONFIRM: Record<BulkAction, { title: string; body: string; cta: string; danger: boolean }> = {
  ban: {
    title: "x.secili-musterileri-yasakla",
    body: "x.yasaklanan-musteriler-magazaya-giris-yapamaz-ancak-kaytl",
    cta: "Yasakla",
    danger: false,
  },
  unban: {
    title: "x.yasag-kaldr",
    body: "x.secili-musteriler-yeniden-giris-yapabilecek-mevcut-tesli",
    cta: "x.yasag-kaldr",
    danger: false,
  },
  delete: {
    title: "x.musterileri-kalc-olarak-sil",
    body: "x.secili-musteriler-kutuphaneleri-ve-2fa-kaytlar-kalc-olar",
    cta: "x.kalc-olarak-sil",
    danger: true,
  },
};

export function CustomersTable({
  slug,
  basePath,
  rows,
  formattedDates,
}: {
  slug: string;
  basePath: string;
  rows: CustomerRow[];
  formattedDates: Record<number, string>;
}) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected]);

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function run(action: BulkAction) {
    setBusy(true);
    const result = await bulkCustomerAction(slug, selected, action);
    setBusy(false);
    setPendingAction(null);
    if (!result.ok) {
      toast.error(result.message ?? t("x.islem-basarsz"));
      return;
    }
    toast.success(result.message ?? t("x.islem-tamamland"));
    setSelected([]);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-2.5 shadow-sm hairline">
          <span className="text-[12px] font-medium">{t("x.count-musteri-secildi", { count: selected.length })}</span>
          <span className="flex-1" />
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPendingAction("unban")}>
            <CheckCircle2 size={13} />{t("x.yasag-kaldr")}</button>
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPendingAction("ban")}>
            <Ban size={13} /> Yasakla
          </button>
          <button type="button" className={buttonClass("danger", "sm")} onClick={() => setPendingAction("delete")}>
            <Trash2 size={13} /> Sil
          </button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setSelected([])}>{t("x.secimi-temizle")}</button>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th className="w-9">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label={t("x.tumunu-sec")}
                    checked={allSelected}
                    onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
                <th>{t("x.musteri")}</th>
                <th>E-posta</th>
                <th>{" "}{t("x.kayt-tarihi")}</th>
                <th>Teslimat</th>
                <th>{t("x.durum")}</th>
                <th className="text-right">{t("x.islem")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const checked = selected.includes(row.id);
                return (
                  <tr key={row.id} className={cn(checked && "bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]")}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label={t("x.name-sec", { name: row.username })}
                        checked={checked}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td>
                      <p className="text-[12.5px] font-medium">{row.username}</p>
                      <p className="text-[10.5px] muted">{row.displayName}</p>
                    </td>
                    <td className="text-[12px]">{row.email ?? "—"}</td>
                    <td className="text-[11.5px] muted">{formattedDates[row.id] ?? ""}</td>
                    <td className="text-[12px] tabular-nums">{row.deliveryCount}</td>
                    <td>
                      <span className={`badge ${row.status === "active" ? "badge-green" : "badge-red"}`}>
                        {row.status === "active" ? "Aktif" : t("x.yasakl")}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Link href={`${basePath}/admin/kullanicilar/${row.id}`} className="btn btn-outline btn-sm">
                          <Users size={12} />{t("x.yonet")}</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={pendingAction !== null}
        onClose={() => (busy ? undefined : setPendingAction(null))}
        title={pendingAction ? CONFIRM[pendingAction].title : ""}
        description={pendingAction ? t("x.count-musteri-names", { count: selectedRows.length, names: selectedRows.map((row) => row.username).join(", ") }) : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPendingAction(null)} disabled={busy}>{t("x.vazgec")}</button>
            <button
              type="button"
              className={pendingAction && CONFIRM[pendingAction].danger ? "btn btn-danger" : "btn btn-dark"}
              onClick={() => pendingAction && run(pendingAction)}
              disabled={busy}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}
              {pendingAction ? CONFIRM[pendingAction].cta : ""}
            </button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed muted">
          {pendingAction ? CONFIRM[pendingAction].body : ""}
        </p>
      </Modal>
    </div>
  );
}
