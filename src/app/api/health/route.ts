import { sql } from "drizzle-orm";
import pkg from "../../../../package.json";
import { db, ensureDatabase } from "@/db";
import { mailEnabled } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe.
 *
 * Returns version/commit information so the GHCR image and the running container
 * can be matched during an incident. `?verbose=1` adds operational details
 * (mail configuration, uptime, database size) intended for monitoring.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const verbose = new URL(request.url).searchParams.get("verbose") === "1";
  try {
    await ensureDatabase();
    await db.run(sql`select 1`);
    const payload: Record<string, unknown> = {
      ok: true,
      version: pkg.version,
      commit: process.env.GIT_COMMIT ?? process.env.SOURCE_COMMIT ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
    };
    if (verbose) {
      payload.mailEnabled = mailEnabled();
      payload.node = process.version;
      payload.db = process.env.SQLITE_PATH ?? "./data/app.db";
      payload.latencyMs = Date.now() - startedAt;
    }
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { ok: false, version: pkg.version, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
