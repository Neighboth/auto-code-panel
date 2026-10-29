"use client";

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
    title: "Seçili müşterileri yasakla",
    body: "Yasaklanan müşteriler mağazaya giriş yapamaz ancak kayıtları ve teslimatları silinmez. İşlemi istediğiniz zaman geri alabilirsiniz.",
    cta: "Yasakla",
    danger: false,
  },
  unban: {
    title: "Yasağı kaldır",
    body: "Seçili müşteriler yeniden giriş yapabilecek. Mevcut teslimatları etkilenmez.",
    cta: "Yasağı kaldır",
    danger: false,
  },
  delete: {
    title: "Müşterileri kalıcı olarak sil",
    body: "Seçili müşteriler, kütüphaneleri ve 2FA kayıtları kalıcı olarak silinir. Bu işlem geri alınamaz.",
    cta: "Kalıcı olarak sil",
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
      toast.error(result.message ?? "İşlem başarısız");
      return;
    }
    toast.success(result.message ?? "İşlem tamamlandı");
    setSelected([]);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-2.5 shadow-sm hairline">
          <span className="text-[12px] font-medium">{selected.length} müşteri seçildi</span>
          <span className="flex-1" />
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPendingAction("unban")}>
            <CheckCircle2 size={13} /> Yasağı kaldır
          </button>
          <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPendingAction("ban")}>
            <Ban size={13} /> Yasakla
          </button>
          <button type="button" className={buttonClass("danger", "sm")} onClick={() => setPendingAction("delete")}>
            <Trash2 size={13} /> Sil
          </button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setSelected([])}>
            Seçimi temizle
          </button>
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
                    aria-label="Tümünü seç"
                    checked={allSelected}
                    onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
                <th>Müşteri</th>
                <th>E-posta</th>
                <th>Kayıt tarihi</th>
                <th>Teslimat</th>
                <th>Durum</th>
                <th className="text-right">İşlem</th>
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
                        aria-label={`${row.username} seç`}
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
                        {row.status === "active" ? "Aktif" : "Yasaklı"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <Link href={`${basePath}/admin/kullanicilar/${row.id}`} className="btn btn-outline btn-sm">
                          <Users size={12} />
                          Yönet
                        </Link>
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
        description={pendingAction ? `${selectedRows.length} müşteri: ${selectedRows.map((row) => row.username).join(", ")}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPendingAction(null)} disabled={busy}>
              Vazgeç
            </button>
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
