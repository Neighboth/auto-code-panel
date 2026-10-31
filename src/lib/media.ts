import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
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
/** Staging area: a body is written here first, so a broken upload leaves nothing behind. */
const TEMP_DIR = join(MEDIA_DIR, ".tmp");
const PUBLIC_PREFIX = "/media/";
/** Uploads older than this in the staging area are garbage from a killed request. */
const TEMP_MAX_AGE_MS = 10 * 60 * 1000;
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

async function ensureTempDir() {
  await mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Image preprocessing.
 *
 * A phone photo used as a logo is 3–5 MB and 4000 px wide; the shop header shows
 * it at 40 px. Serving the original made every page slow (the browser downloaded
 * megabytes before it could paint), so uploads are normalised here:
 *
 * - EXIF orientation is applied (phone photos were showing sideways),
 * - the image is capped at `maxSize` px on its longest edge,
 * - it is re-encoded as WebP (≈70–90 % smaller than PNG at this size),
 * - SVG/ICO keep their original bytes (vector, or an icon container WebP cannot express).
 *
 * `saving` is what the panel reports back ("3.4 MB → 41 KB").
 */
async function optimiseImage(
  buffer: Buffer,
  extension: string,
  maxSize: number,
): Promise<{ buffer: Buffer; extension: string; saving: number }> {
  if (extension === "svg" || extension === "ico" || extension === "gif") {
    return { buffer, extension, saving: 0 };
  }
  try {
    const pipeline = sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true });
    const output = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
    if (output.byteLength === 0 || output.byteLength >= buffer.byteLength) {
      return { buffer, extension, saving: 0 };
    }
    return { buffer: output, extension: "webp", saving: buffer.byteLength - output.byteLength };
  } catch {
    // Not a bitmap sharp understands (or an exotic codec): keep the original.
    return { buffer, extension, saving: 0 };
  }
}

/** Deletes staging files left behind by interrupted uploads. */
export async function pruneTempUploads(): Promise<number> {
  await ensureTempDir();
  let removed = 0;
  for (const file of await readdir(TEMP_DIR)) {
    const info = await stat(join(TEMP_DIR, file)).catch(() => null);
    if (!info) continue;
    if (Date.now() - info.mtimeMs < TEMP_MAX_AGE_MS) continue;
    await rm(join(TEMP_DIR, file), { force: true }).catch(() => null);
    removed += 1;
  }
  return removed;
}

/** Moves a staged file into the media library; the staged file never survives. */
async function commitTemp(tempPath: string, file: string): Promise<void> {
  const target = join(MEDIA_DIR, file);
  try {
    await rename(tempPath, target);
  } catch {
    // Cross-device rename (tmpfs staging): copy then delete.
    await writeFile(target, await readFile(tempPath));
    await rm(tempPath, { force: true }).catch(() => null);
  }
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
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength === 0 || raw.byteLength > MAX_BYTES) return source;
    // Covers are displayed at ≤460 px wide; the CDN often serves 2–3× that.
    const optimised = await optimiseImage(raw, extension, 920);
    const file = `${key}.${optimised.extension}`;
    await writeFile(join(MEDIA_DIR, file), optimised.buffer);
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
  options: { filename: string; mime?: string; kind: "image" | "font"; maxSize?: number },
): Promise<
  | { ok: true; path: string; bytes: number; originalBytes: number; saved: number }
  | { ok: false; reason: "type" | "size" | "empty" }
> {
  const original = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (original.byteLength === 0) return { ok: false, reason: "empty" };
  if (original.byteLength > UPLOAD_LIMIT[options.kind]) return { ok: false, reason: "size" };

  const allowed: readonly string[] = options.kind === "font" ? FONT_EXTENSIONS : IMAGE_EXTENSIONS;
  const rawExtension = (options.filename.split(".").pop() ?? "").toLowerCase();
  const declaredExtension = EXT_BY_TYPE[(options.mime ?? "").toLowerCase()];
  const extension = allowed.includes(rawExtension) ? rawExtension : declaredExtension;
  if (!extension || !allowed.includes(extension)) return { ok: false, reason: "type" };

  await ensureDir();
  await ensureTempDir();

  let buffer = original;
  let finalExtension: string = extension;
  let saved = 0;
  if (options.kind === "image") {
    const optimised = await optimiseImage(original, extension, options.maxSize ?? 1024);
    buffer = optimised.buffer;
    finalExtension = optimised.extension;
    saved = optimised.saving;
  }

  const file = `${createHash("sha1").update(buffer).digest("hex")}.${finalExtension}`;
  const tempPath = join(TEMP_DIR, `${randomUUID()}.part`);
  try {
    // Write to staging first: a crash or an aborted request can never leave a
    // half-written file in the public media directory.
    await writeFile(tempPath, buffer);
    await commitTemp(tempPath, file);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => null);
    throw error;
  }
  return {
    ok: true,
    path: `${PUBLIC_PREFIX}${file}`,
    bytes: buffer.byteLength,
    originalBytes: original.byteLength,
    saved,
  };
}

/**
 * Removes an uploaded file that a cancelled form left behind.
 *
 * The settings screen calls this when the owner uploads an image and then
 * abandons the form, so the disk does not fill with orphans; files that another
 * store still uses are kept.
 */
export async function discardUpload(path: string | null | undefined): Promise<boolean> {
  return releaseMedia(path);
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
