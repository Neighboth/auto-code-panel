"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  Loader2,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Rocket,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  deletePlatformPost,
  savePlatformPost,
  setPlatformPostPinned,
} from "@/app/actions/super-admin";
import { Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export type PostItem = {
  id: number;
  kind: "announcement" | "update";
  title: string;
  body: string;
  version: string;
  pinned: boolean;
  publishedAt: string;
  updatedAt: string;
};

type Draft = {
  id: number | null;
  kind: "announcement" | "update";
  title: string;
  body: string;
  version: string;
  pinned: boolean;
};

const EMPTY: Draft = {
  id: null,
  kind: "announcement",
  title: "",
  body: "",
  version: "",
  pinned: false,
};

export function PostManager({ posts }: { posts: PostItem[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData();
    if (draft.id) formData.set("id", String(draft.id));
    formData.set("kind", draft.kind);
    formData.set("title", draft.title);
    formData.set("body", draft.body);
    formData.set("version", draft.version);
    if (draft.pinned) formData.set("pinned", "on");
    const result = await savePlatformPost(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Kaydedilemedi.");
      return;
    }
    toast.success(result.message ?? "Kayıt yayınlandı");
    setDraft(EMPTY);
    router.refresh();
  }

  async function onDelete(post: PostItem) {
    if (confirmDeleteId !== post.id) {
      setConfirmDeleteId(post.id);
      return;
    }
    setConfirmDeleteId(null);
    setBusyId(post.id);
    const formData = new FormData();
    formData.set("id", String(post.id));
    const result = await deletePlatformPost(formData);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "Silinemedi.");
      return;
    }
    toast.success("Kayıt silindi");
    if (draft.id === post.id) setDraft(EMPTY);
    router.refresh();
  }

  async function togglePin(post: PostItem) {
    setBusyId(post.id);
    const formData = new FormData();
    formData.set("id", String(post.id));
    formData.set("pinned", post.pinned ? "false" : "true");
    const result = await setPlatformPostPinned(formData);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "Güncellenemedi.");
      return;
    }
    toast.success(result.message ?? "Güncellendi");
    router.refresh();
  }

  function startEdit(post: PostItem) {
    setDraft({
      id: post.id,
      kind: post.kind,
      title: post.title,
      body: post.body,
      version: post.version,
      pinned: post.pinned,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <div className="card h-fit p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-semibold">
              {draft.id ? "Kaydı düzenle" : "Yeni kayıt yayınla"}
            </h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed muted">
              Duyurular ve güncelleme notları tüm mağaza yöneticilerinin panelinde iki büyük kutuda
              gösterilir.
            </p>
          </div>
          {draft.id ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDraft(EMPTY)}
              aria-label="Düzenlemeyi kapat"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
          <div>
            <p className="label">Tür</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => update("kind", "announcement")}
                className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-medium hairline"
                style={{
                  background:
                    draft.kind === "announcement" ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                }}
              >
                <Megaphone size={13} />
                Duyuru
              </button>
              <button
                type="button"
                onClick={() => update("kind", "update")}
                className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-medium hairline"
                style={{
                  background:
                    draft.kind === "update" ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
                }}
              >
                <Rocket size={13} />
                Güncelleme
              </button>
            </div>
          </div>

          <Field label="Başlık">
            <input
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              className="input"
              maxLength={120}
              required
              placeholder={draft.kind === "update" ? "Sürüm 2.4 yayında" : "Bakım duyurusu"}
            />
          </Field>

          {draft.kind === "update" ? (
            <Field label="Sürüm etiketi" hint="Opsiyonel, örn. v2.4.0">
              <input
                value={draft.version}
                onChange={(event) => update("version", event.target.value)}
                className="input mono"
                maxLength={24}
                placeholder="v2.4.0"
              />
            </Field>
          ) : null}

          <Field label="İçerik" hint="Markdown desteklenir. Boş bırakılabilir.">
            <textarea
              value={draft.body}
              onChange={(event) => update("body", event.target.value)}
              className="textarea min-h-40"
              maxLength={8000}
              placeholder={"- Yeni özellik\n- Hata düzeltmeleri\n- Performans iyileştirmeleri"}
            />
          </Field>

          <label className="flex items-center gap-2 text-[12px] muted">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(event) => update("pinned", event.target.checked)}
            />
            Panellerde en üstte sabitle
          </label>

          {error ? (
            <p className="rounded-md px-3 py-2 text-[12px]" style={{ background: "#fef2f2", color: "#b91c1c" }}>
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-dark w-full" disabled={pending}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {draft.id ? "Değişiklikleri kaydet" : "Yayınla"}
          </button>
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">Yayınlanan kayıtlar</h2>
            <p className="text-[11.5px] muted">{posts.length} kayıt · en yeni önce</p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center hairline">
            <Megaphone size={22} className="mx-auto muted" />
            <p className="mt-2 text-[13px] font-medium">Henüz duyuru veya güncelleme yok</p>
            <p className="mt-1 text-[11.5px] muted">Soldaki formdan ilk kaydı yayınlayabilirsiniz.</p>
          </div>
        ) : null}

        {posts.map((post) => {
          const isUpdate = post.kind === "update";
          return (
            <article key={post.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border hairline">
                    {isUpdate ? <Rocket size={14} /> : <Megaphone size={14} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${isUpdate ? "badge-blue" : "badge-amber"}`}>
                        {isUpdate ? "Güncelleme" : "Duyuru"}
                      </span>
                      {post.version ? <span className="badge mono">{post.version}</span> : null}
                      {post.pinned ? (
                        <span className="badge badge-green">
                          <Pin size={10} /> Sabit
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1.5 truncate text-[13.5px] font-semibold">{post.title}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[10.5px] muted">
                      <CalendarDays size={10} />
                      {formatDateTime(post.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => togglePin(post)}
                    disabled={busyId === post.id}
                    className="btn btn-ghost btn-sm"
                    title={post.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                  >
                    {post.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="btn btn-ghost btn-sm"
                    title="Düzenle"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(post)}
                    disabled={busyId === post.id}
                    className="btn btn-ghost btn-sm"
                    style={{ color: "#dc2626" }}
                    title="Sil"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {post.body ? (
                <p className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-[12px] leading-relaxed muted hairline scroll-thin">
                  {post.body}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
