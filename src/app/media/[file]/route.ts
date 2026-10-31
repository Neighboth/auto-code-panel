import { readMedia } from "@/lib/media";

/**
 * Serves the local media cache.
 *
 * Files are content-addressed (SHA-1 of the source URL), so the response is
 * immutable: browsers and CDNs can cache it for a year without revalidating.
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const media = await readMedia(file);
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(media.buffer), {
    headers: {
      "Content-Type": media.type,
      "Content-Length": String(media.buffer.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
