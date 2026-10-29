import { NextResponse } from "next/server";
import { getUsdRates } from "@/lib/currency";

export const dynamic = "force-dynamic";

/** Cached USD-based FX table for the dashboard price converter. */
export async function GET() {
  const { rates, source } = await getUsdRates();
  return NextResponse.json(
    { base: "USD", source, rates },
    { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } },
  );
}
