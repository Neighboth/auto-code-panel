import { sendLicenseReminders } from "@/lib/mail-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled licence reminders (3 days and 1 day before expiry).
 *
 * This is the endpoint a real cron job should call — the dashboard trigger was
 * only a stop-gap and did nothing while nobody opened the panel:
 *   GET /api/cron/reminders?secret=...      (also accepts Bearer auth / POST)
 *
 * Sending is idempotent: `mail_events` keeps one row per store, bucket and expiry
 * date, so calling this every hour never produces duplicates.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ ok: false, error: "cron secret not configured" }, { status: 503 });
  }
  if (secret) {
    const url = new URL(request.url);
    const provided =
      url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== secret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await sendLicenseReminders();
  return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
