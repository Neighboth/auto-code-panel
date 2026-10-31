import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { games, stores } from "@/db/schema";

/**
 * Local image cache ("media library").
 *
 * Steam's CDN (`shared.akamai.steamstatic.com`) is frequently slow or blocked in
 * some regions, which left product cards with a broken cover. Instead of linking
 * the remote URL, covers are downloaded once and served from this server:
 *
 * - the file name is the SHA-1 of the *source URL*, so two stores adding the
 *   same Steam game share one file (no duplicate downloads, no extra disk use);
 * - `releaseMedia()` deletes a file as soon as no game and no store references
 *   it, so removing a product from every store also frees the disk;
 * - downloads are best effort: if the fetch fails the remote URL is kept, so
 *   adding a product never fails because of a CDN hiccup.
 */

const MEDIA_DIR = join(process.cwd(), "data", "media");
const PUBLIC_PREFIX = "/media/";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Upload ceilings. Images are generous (a 4K logo is fine); fonts are huge. */
export const UPLOAD_LIMIT = {
  image: 5 * 1024 * 1024,
  font: 50 * 1024 * 1024,
} as const;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "application/x-font-ttf": "ttf",
  "application/x-font-opentype": "otf",
  "application/font-woff": "woff",
  "application/font-woff2": "woff2",
  "application/octet-stream": "", // resolved from the file extension below
};

/** Extension → MIME, used when a browser sends `application/octet-stream`. */
const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

export const FONT_EXTENSIONS = ["ttf", "otf", "woff", "woff2"] as const;
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg", "ico"] as const;

export function isLocalMedia(path: string | null | undefined): boolean {
  return Boolean(path && path.startsWith(PUBLIC_PREFIX));
}

/** `/media/<hash>.jpg` → absolute path on disk (or null when it escapes the dir). */
export function mediaFilePath(file: string): string | null {
  if (!/^[a-f0-9]{40}\.[a-z0-9]{2,5}$/i.test(file)) return null;
  return join(MEDIA_DIR, file);
}

export function mediaKeyFor(url: string): string {
  return createHash("sha1").update(url.trim()).digest("hex");
}

async function ensureDir() {
  await mkdir(MEDIA_DIR, { recursive: true });
}

/**
 * Downloads `url` into the media library and returns its public path.
 * Anything that is not a plain http(s) image is returned untouched.
 */
export async function cacheRemoteImage(
  url: string | null | undefined,
  options: { prefix?: string } = {},
): Promise<string> {
  const source = (url ?? "").trim();
  if (!source) return "";
  if (isLocalMedia(source) || source.startsWith("data:")) return source;
  if (!/^https?:\/\//i.test(source)) return source;

  const key = mediaKeyFor(options.prefix ? `${options.prefix}:${source}` : source);
  await ensureDir();

  const existing = (await readdir(MEDIA_DIR)).find((file) => file.startsWith(key));
  if (existing) return `${PUBLIC_PREFIX}${existing}`;

  try {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "image/*", "User-Agent": "PixelithShop media cache" },
      cache: "no-store",
    });
    if (!response.ok) return source;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const extension = EXT_BY_TYPE[type];
    if (!extension) return source;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return source;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return source;
    const file = `${key}.${extension}`;
    await writeFile(join(MEDIA_DIR, file), buffer);
    return `${PUBLIC_PREFIX}${file}`;
  } catch {
    // Offline or CDN refused: keep the remote URL so the card still renders.
    return source;
  }
}

/**
 * Stores an uploaded file in the media library and returns its public path.
 *
 * The name is the SHA-1 of the bytes, so re-uploading the same logo (or two
 * stores picking the same typeface) writes a single file. Rejections are
 * explicit: an unsupported extension, an empty file or anything above
 * `limits.*` returns `{ ok: false }` with a reason the caller can translate.
 */
export async function saveUpload(
  data: ArrayBuffer | Buffer,
  options: { filename: string; mime?: string; kind: "image" | "font" },
): Promise<{ ok: true; path: string; bytes: number } | { ok: false; reason: "type" | "size" | "empty" }> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.byteLength === 0) return { ok: false, reason: "empty" };
  if (buffer.byteLength > UPLOAD_LIMIT[options.kind]) return { ok: false, reason: "size" };

  const allowed: readonly string[] = options.kind === "font" ? FONT_EXTENSIONS : IMAGE_EXTENSIONS;
  const rawExtension = (options.filename.split(".").pop() ?? "").toLowerCase();
  const declaredExtension = EXT_BY_TYPE[(options.mime ?? "").toLowerCase()];
  const extension = allowed.includes(rawExtension) ? rawExtension : declaredExtension;
  if (!extension || !allowed.includes(extension)) return { ok: false, reason: "type" };

  await ensureDir();
  const file = `${createHash("sha1").update(buffer).digest("hex")}.${extension}`;
  await writeFile(join(MEDIA_DIR, file), buffer);
  return { ok: true, path: `${PUBLIC_PREFIX}${file}`, bytes: buffer.byteLength };
}

/** True when some product or store front still points at this media path. */
export async function isMediaReferenced(path: string): Promise<boolean> {
  if (!isLocalMedia(path)) return false;
  const [product] = await db.select({ id: games.id }).from(games).where(eq(games.coverImage, path)).limit(1);
  if (product) return true;
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.logoUrl, path)).limit(1);
  if (store) return true;
  const [favicon] = await db.select({ id: stores.id }).from(stores).where(eq(stores.faviconUrl, path)).limit(1);
  if (favicon) return true;
  const [font] = await db.select({ id: stores.id }).from(stores).where(eq(stores.fontUrl, path)).limit(1);
  return Boolean(font);
}

/**
 * Deletes an unreferenced media file. Called after a product update/delete and
 * after a store changes its logo: the image only disappears once the last
 * reference is gone.
 */
export async function releaseMedia(path: string | null | undefined): Promise<boolean> {
  if (!isLocalMedia(path)) return false;
  const file = mediaFilePath(String(path).slice(PUBLIC_PREFIX.length));
  if (!file) return false;
  try {
    if (await isMediaReferenced(String(path))) return false;
    await unlink(file);
    return true;
  } catch {
    return false;
  }
}

/** Downloads a cover (deduplicated) and releases the previous one if unused. */
export async function replaceGameCover(
  nextUrl: string | null | undefined,
  previousUrl?: string | null,
): Promise<string> {
  const cached = await cacheRemoteImage(nextUrl);
  if (previousUrl && previousUrl !== cached) {
    await releaseMedia(previousUrl);
  }
  return cached;
}

/** Entry point used by the admin panel: any remote cover becomes a local file. */
export async function localizeCover(url: string | null | undefined): Promise<string> {
  return cacheRemoteImage(url, { prefix: "cover" });
}

/** Housekeeping: drops orphaned files (e.g. after a bulk import is rolled back). */
export async function pruneMedia(): Promise<{ removed: number; kept: number }> {
  await ensureDir();
  let removed = 0;
  let kept = 0;
  for (const file of await readdir(MEDIA_DIR)) {
    const path = `${PUBLIC_PREFIX}${file}`;
    if (await isMediaReferenced(path)) {
      kept += 1;
      continue;
    }
    const info = await stat(join(MEDIA_DIR, file)).catch(() => null);
    // Give half-written files a grace period.
    if (info && Date.now() - info.mtimeMs < 60_000) {
      kept += 1;
      continue;
    }
    await unlink(join(MEDIA_DIR, file)).catch(() => null);
    removed += 1;
  }
  return { removed, kept };
}

export async function readMedia(file: string): Promise<{ buffer: Buffer; type: string } | null> {
  const path = mediaFilePath(file);
  if (!path) return null;
  try {
    const buffer = await readFile(path);
    const extension = file.split(".").pop() ?? "";
    const type =
      TYPE_BY_EXT[extension] ??
      Object.entries(EXT_BY_TYPE).find(([, ext]) => ext === extension)?.[0] ??
      "application/octet-stream";
    return { buffer, type };
  } catch {
    return null;
  }
}
