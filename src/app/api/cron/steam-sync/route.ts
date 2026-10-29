import { syncSteamGames } from "@/lib/steam";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled Steam price/cover synchronisation for products with auto-sync enabled.
 * Protect with CRON_SECRET in production, e.g.:
 *   GET /api/cron/steam-sync?secret=...
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ ok: false, error: "cron secret not configured" }, { status: 503 });
  }
  if (secret) {
    const url = new URL(request.url);
    const provided = url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== secret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await syncSteamGames();
  return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
