"use client";

export type RateTable = Record<string, number>;

let cache: { rates: RateTable; fetchedAt: number } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function fetchRates(): Promise<RateTable> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;
  try {
    const response = await fetch("/api/fx", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const payload = (await response.json()) as { rates?: RateTable };
    if (!payload.rates) throw new Error("empty");
    cache = { rates: payload.rates, fetchedAt: Date.now() };
    return payload.rates;
  } catch {
    return {};
  }
}

export function convertLocal(
  value: string,
  from: string,
  to: string,
  rates: RateTable,
): string {
  const num = Number(value.replace(",", "."));
  if (!value.trim() || !Number.isFinite(num)) return value;
  const fromRate = rates[(from || "USD").toUpperCase()];
  const toRate = rates[(to || "USD").toUpperCase()];
  if (!fromRate || !toRate) return value;
  return ((num / fromRate) * toRate).toFixed(2);
}
