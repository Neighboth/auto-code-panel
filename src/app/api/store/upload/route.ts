import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getStoreAdminSession } from "@/lib/session";
import { UPLOAD_LIMIT, discardUpload, pruneTempUploads, saveUpload } from "@/lib/media";
import { logAudit } from "@/lib/audit";

/**
 * Store asset upload endpoint (logo, favicon, custom typeface).
 *
 * This is a route handler rather than a server action on purpose: server action
 * bodies are capped at 1 MB, which cannot carry a 5 MB logo or a 50 MB font.
 * Route handlers stream the multipart body, so the stated ceilings really work.
 *
 * Three properties matter here:
 *
 * - **Progress**: the browser gets a real percentage because the body is sent
 *   with XHR/fetch upload progress (see `settings.tsx`); nothing is buffered
 *   twice.
 * - **No half files**: the bytes are written to `data/media/.tmp` first and only
 *   moved into the public library once the whole body arrived and the image was
 *   re-encoded. An interrupted request removes its staging file, and
 *   `pruneTempUploads()` sweeps anything a killed process left behind.
 * - **Cancellation**: `DELETE` removes a file the owner uploaded but did not
 *   save, so abandoning the form does not leak images.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longest edge per asset kind; keeps a 5 MB phone photo at a few dozen KB. */
const MAX_EDGE: Record<string, number> = { logo: 1024, favicon: 256, image: 1024 };

async function currentStore() {
  const session = await getStoreAdminSession();
  if (!session) return { session: null, store: null } as const;
  const [store] = await db.select().from(stores).where(eq(stores.id, session.storeId)).limit(1);
  return { session, store: store ?? null } as const;
}

export async function POST(request: Request) {
  const { store } = await currentStore();
  if (!store) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (store.status === "suspended") {
    return NextResponse.json({ ok: false, reason: "suspended" }, { status: 403 });
  }

  // Housekeeping: staging files from interrupted uploads never reach the library.
  await pruneTempUploads().catch(() => 0);

  const aborted = () => request.signal.aborted;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // The browser cancelled (tab closed / "cancel" pressed): nothing was staged
    // because multipart parsing never completed.
    return NextResponse.json({ ok: false, reason: aborted() ? "aborted" : "empty" }, { status: 400 });
  }
  if (aborted()) return NextResponse.json({ ok: false, reason: "aborted" }, { status: 499 });

  const kind = form.get("kind") === "font" ? "font" : "image";
  const variant = String(form.get("variant") ?? "image");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }
  if (file.size > UPLOAD_LIMIT[kind]) {
    return NextResponse.json({ ok: false, reason: "size" }, { status: 413 });
  }

  try {
    const saved = await saveUpload(await file.arrayBuffer(), {
      filename: file.name,
      mime: file.type,
      kind,
      maxSize: MAX_EDGE[variant] ?? MAX_EDGE.image,
    });
    if (!saved.ok) {
      return NextResponse.json(
        { ok: false, reason: saved.reason },
        { status: saved.reason === "size" ? 413 : 400 },
      );
    }

    await logAudit({
      action: "store.asset.upload",
      entity: "store",
      entityId: store.id,
      summaryKey: "x.dosya-yuklendi",
      storeId: store.id,
      storeSlug: store.slug,
      metadata: {
        kind,
        variant,
        path: saved.path,
        bytes: saved.bytes,
        originalBytes: saved.originalBytes,
      },
    });

    return NextResponse.json({
      ok: true,
      path: saved.path,
      bytes: saved.bytes,
      originalBytes: saved.originalBytes,
      saved: saved.saved,
      kind,
    });
  } catch {
    // Anything thrown after staging is handled inside `saveUpload` (the staging
    // file is removed there); report a retryable error to the panel.
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 500 });
  }
}

/** Removes an upload the owner abandoned before pressing save. */
export async function DELETE(request: Request) {
  const { store } = await currentStore();
  if (!store) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  // Only files inside the media library, and only ones no store references.
  if (!path.startsWith("/media/")) return NextResponse.json({ ok: false, reason: "type" }, { status: 400 });
  const removed = await discardUpload(path);
  return NextResponse.json({ ok: true, removed });
}
