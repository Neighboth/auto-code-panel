"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, KeySquare, Loader2, Plus, ShieldOff, Trash2 } from "lucide-react";
import {
  addCustomerEntitlement,
  deleteCustomer,
  editCustomer,
  removeCustomerEntitlement,
  resetCustomerFactors,
  setCustomerBan,
} from "@/app/actions/store-customers";
import { DURATION_PRESETS } from "@/lib/format";
import { Field } from "@/components/ui";
import { Modal } from "@/components/modal";

export function CustomerDetailActions({
  slug,
  basePath,
  customerId,
  banned,
  games,
}: {
  slug: string;
  basePath: string;
  customerId: number;
  banned: boolean;
  games: { id: number; title: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    fallback: string,
    after?: () => void,
  ) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? fallback);
      return;
    }
    toast.success(result.message ?? fallback);
    after?.();
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-4 hairline">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() =>
          run(() => setCustomerBan(slug, customerId, !banned), "Güncellendi")
        }
        disabled={pending}
      >
        <Gavel size={12} />
        {banned ? "Yasağı kaldır" : "Yasakla"}
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditOpen(true)}>
        Düzenle / şifre sıfırla
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddOpen(true)}>
        <Plus size={12} />
        Kütüphaneye ekle
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setBanOpen(true)}>
        <ShieldOff size={12} />
        2FA&apos;yı sıfırla
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ color: "#dc2626" }}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 size={12} />
        Sil
      </button>
      {banOpen ? (
        <FactorResetModal
          slug={slug}
          customerId={customerId}
          onClose={() => setBanOpen(false)}
          onDone={() => setBanOpen(false)}
          busy={pending}
          onRun={run}
        />
      ) : null}
      {deleteOpen ? (
        <Modal
          open
          onClose={() => setDeleteOpen(false)}
          title="Müşteriyi sil"
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setDeleteOpen(false)}>
                Vazgeç
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={() =>
                  run(() => deleteCustomer(slug, customerId), "Silindi", () => {
                    setDeleteOpen(false);
                    router.push(`${basePath}/admin/kullanicilar`);
                  })
                }
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : null}
                Kalıcı olarak sil
              </button>
            </>
          }
        >
          <p className="text-[13px]">
            Müşteri, kütüphanesi ve güvenlik yöntemleri kalıcı olarak silinecek. Bu işlem geri
            alınamaz.
          </p>
        </Modal>
      ) : null}
      {editOpen ? (
        <EditCustomerModal
          slug={slug}
          customerId={customerId}
          onClose={() => setEditOpen(false)}
          busy={pending}
          onRun={run}
        />
      ) : null}
      {addOpen ? (
        <AddDeliveryModal
          slug={slug}
          customerId={customerId}
          games={games}
          onClose={() => setAddOpen(false)}
          busy={pending}
          onRun={run}
        />
      ) : null}
    </div>
  );
}

type Runner = (
  action: () => Promise<{ ok: boolean; message?: string }>,
  fallback: string,
  after?: () => void,
) => void;

function FactorResetModal({
  slug,
  customerId,
  onClose,
  onDone,
  busy,
  onRun,
}: {
  slug: string;
  customerId: number;
  onClose: () => void;
  onDone: () => void;
  busy: boolean;
  onRun: Runner;
}) {
  const kinds = [
    { id: "totp", label: "TOTP 2FA" },
    { id: "passkey", label: "Passkey" },
    { id: "question", label: "Güvenlik sorusu" },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title="2FA sıfırla"
      footer={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Kapat
        </button>
      }
    >
      <p className="mb-3 text-[12.5px] muted">
        Müşterinin kayıtlı güvenlik yöntemlerini tek tek kaldırın. Müşteri istediğinde
        profilinden yeniden kurar.
      </p>
      <div className="grid gap-2">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() =>
              onRun(() => resetCustomerFactors(slug, customerId, kind.id), "Sıfırlandı", onDone)
            }
          >
            <ShieldOff size={13} />
            {kind.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function EditCustomerModal({
  slug,
  customerId,
  onClose,
  busy,
  onRun,
}: {
  slug: string;
  customerId: number;
  onClose: () => void;
  busy: boolean;
  onRun: Runner;
}) {
  return (
    <Modal open onClose={onClose} title="Müşteri düzenle">
      <EditCustomerForm
        slug={slug}
        customerId={customerId}
        busy={busy}
        onDone={onClose}
        onRun={onRun}
      />
    </Modal>
  );
}

function EditCustomerForm({
  slug,
  customerId,
  busy,
  onDone,
  onRun,
}: {
  slug: string;
  customerId: number;
  busy: boolean;
  onDone: () => void;
  onRun: Runner;
}) {
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRun(() => editCustomer(slug, customerId, formData), "Güncellendi", onDone);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Kullanıcı adı">
        <input name="username" required minLength={3} maxLength={24} className="input" />
      </Field>
      <Field label="Görünen ad">
        <input name="displayName" className="input" />
      </Field>
      <Field label="E-posta">
        <input name="email" type="email" className="input" />
      </Field>
      <Field label="Yeni şifre" hint="Boş bırakılırsa şifre değişmez.">
        <input name="newPassword" type="text" className="input mono" />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <KeySquare size={13} />}
          Kaydet
      </button>
      </div>
    </form>
  );
}

function AddDeliveryModal({
  slug,
  customerId,
  games,
  onClose,
  busy,
  onRun,
}: {
  slug: string;
  customerId: number;
  games: { id: number; title: string }[];
  onClose: () => void;
  busy: boolean;
  onRun: Runner;
}) {
  const [selected, setSelected] = useState(games[0]?.id ?? 0);
  const [durationIndex, setDurationIndex] = useState("0");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration =
      durationIndex === "0"
        ? null
        : DURATION_PRESETS[Number(durationIndex)]?.minutes ?? null;
    onRun(
      () => addCustomerEntitlement(slug, customerId, selected, duration),
      "Kütüphaneye eklendi",
      onClose,
    );
  }

  return (
    <Modal open onClose={onClose} title="Kütüphaneye teslimat ekle">
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Ürün">
          <select className="select" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {games.length === 0 ? <option value={0}>Ürün yok</option> : null}
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Erişim süresi">
          <select className="select" value={durationIndex} onChange={(event) => setDurationIndex(event.target.value)}>
            <option value="0">Süresiz / Sınırsız</option>
            {DURATION_PRESETS.slice(1).map((preset, index) => (
              <option key={preset.label} value={index + 1}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={busy || games.length === 0}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={13} />}
            Ekle
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CustomerRemoveButton({
  slug,
  customerId,
  entitlementId,
}: {
  slug: string;
  customerId: number;
  entitlementId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  async function onClick() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    setPending(true);
    const result = await removeCustomerEntitlement(slug, entitlementId, customerId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Kaldırılamadı");
      return;
    }
    toast.success(result.message ?? "Kaldırıldı");
    router.refresh();
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#dc2626" }} onClick={onClick} disabled={pending}>
      {pending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
      Kaldır
    </button>
  );
}
