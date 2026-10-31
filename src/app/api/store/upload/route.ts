import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getStoreAdminSession } from "@/lib/session";
import { UPLOAD_LIMIT, saveUpload } from "@/lib/media";
import { logAudit } from "@/lib/audit";

/**
 * Store asset upload endpoint (logo, favicon, custom typeface).
 *
 * This is a route handler rather than a server action on purpose: server action
 * bodies are capped at 1 MB, which cannot carry a 5 MB logo or a 50 MB font.
 * Route handlers stream the multipart body, so the stated ceilings really work.
 *
 * Auth: the caller must hold a valid store-admin session; the file is written to
 * the content-addressed media library and the public `/media/…` path is
 * returned. Rejections come back as a machine-readable `reason` so the client
 * can translate them.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getStoreAdminSession();
  if (!session) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const [store] = await db.select().from(stores).where(eq(stores.id, session.storeId)).limit(1);
  if (!store) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (store.status === "suspended") {
    return NextResponse.json({ ok: false, reason: "suspended" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }

  const kind = form.get("kind") === "font" ? "font" : "image";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });
  }
  if (file.size > UPLOAD_LIMIT[kind]) {
    return NextResponse.json({ ok: false, reason: "size" }, { status: 413 });
  }

  const saved = await saveUpload(await file.arrayBuffer(), {
    filename: file.name,
    mime: file.type,
    kind,
  });
  if (!saved.ok) {
    return NextResponse.json({ ok: false, reason: saved.reason }, { status: saved.reason === "size" ? 413 : 400 });
  }

  await logAudit({
    action: "store.asset.upload",
    entity: "store",
    entityId: store.id,
    summaryKey: "x.dosya-yuklendi",
    storeId: store.id,
    storeSlug: store.slug,
    metadata: { kind, path: saved.path, bytes: saved.bytes },
  });

  return NextResponse.json({ ok: true, path: saved.path, bytes: saved.bytes, kind });
}
