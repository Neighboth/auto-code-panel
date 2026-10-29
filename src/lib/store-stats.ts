const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type StatsCode = {
  id: number;
  code: string;
  type: string;
  label: string;
  createdAt: Date;
  redeemedAt: Date | null;
};

export type StatsRedemption = {
  id: number;
  codeId: number;
  customerId: number | null;
  guestUsername: string | null;
  createdAt: Date;
  accessExpiresAt: Date | null;
};

export type StatsEntitlement = {
  id: number;
  redemptionId: number;
  customerId: number | null;
  kind: string;
  gameId: number | null;
  accountId: number | null;
  title: string;
  grantedAt: Date;
  expiresAt: Date | null;
};

export type StatsCustomer = {
  id: number;
  username: string;
  displayName: string;
  status: string;
  createdAt: Date;
};

export type StatsGame = {
  id: number;
  title: string;
  ourPrice: string;
  currency: string;
};

export type StatsAccount = {
  id: number;
  platformLabel: string;
  status: string;
  createdAt: Date;
};

export type StoreStatsInput = {
  codes: StatsCode[];
  redemptions: StatsRedemption[];
  entitlements: StatsEntitlement[];
  customers: StatsCustomer[];
  games: StatsGame[];
  accounts: StatsAccount[];
};

export type StoreStats = {
  rangeDays: number;
  totals: {
    codes: number;
    codesRedeemed: number;
    codesAvailable: number;
    redemptionRate: number;
    deliveries: number;
    activeDeliveries: number;
    expiringSoon: number;
    expiredDeliveries: number;
    customers: number;
    newCustomers: number;
    bannedCustomers: number;
    guestRedemptions: number;
    registeredRedemptions: number;
    accountsAvailable: number;
    accountsAssigned: number;
    accountsRetired: number;
    avgDeliveriesPerRedemption: number;
    rangeRedemptions: number;
    rangeDeliveries: number;
  };
  daily: { key: string; label: string; redemptions: number; customers: number; deliveries: number }[];
  codeTypes: { type: string; label: string; total: number; redeemed: number; rate: number }[];
  topProducts: { title: string; count: number; value: number; currency: string }[];
  topCustomers: { name: string; count: number }[];
  hours: number[];
  weekdays: { label: string; count: number }[];
  inventory: { platform: string; available: number; assigned: number; retired: number; total: number }[];
  deliveredValue: { currency: string; value: number }[];
  recent: {
    id: number;
    code: string;
    buyer: string;
    items: number;
    createdAt: Date;
    accessExpiresAt: Date | null;
    expired: boolean;
  }[];
  expiring: { id: number; title: string; buyer: string; expiresAt: Date }[];
  peakHour: { hour: number; count: number };
  peakWeekday: { label: string; count: number };
};

/** Monday-first dictionary keys for the weekly heatmap. */
const WEEKDAY_LABELS = ["x.pzt", "x.sal", "x.car", "x.per", "x.cum", "x.cmt", "x.paz"];
const CODE_TYPE_LABELS: Record<string, string> = {
  single: "x.tekli",
  choice: "x.secmeli",
  bundle: "x.paket",
};

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}

function shortDay(value: Date, locale: string): string {
  return value.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

export async function computeStoreStats(
  input: StoreStatsInput,
  requestedRange: number,
  now: Date = new Date(),
  /**
   * Translator injected by the caller so the fallback labels (`Dijital teslimat`,
   * `Misafir`) follow the interface language. Defaults to identity for scripts.
   */
  t: (key: string) => string = (key) => key,
  /** BCP-47 tag used for day labels (`29 Eki` / `29 Oct`). */
  locale = "tr",
): Promise<StoreStats> {
  const rangeDays = [7, 30, 90].includes(requestedRange) ? requestedRange : 30;
  const nowMs = now.getTime();
  const today = startOfDay(now);
  const rangeStart = new Date(today.getTime() - (rangeDays - 1) * DAY_MS);
  const rangeEnd = new Date(today.getTime() + DAY_MS);
  const inRange = (date: Date) => date.getTime() >= rangeStart.getTime() && date.getTime() < rangeEnd.getTime();

  const gameById = new Map(input.games.map((game) => [game.id, game]));
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const codeById = new Map(input.codes.map((code) => [code.id, code]));

  const redemptionsInRange = input.redemptions.filter((row) => inRange(row.createdAt));
  const deliveriesInRange = input.entitlements.filter((row) => inRange(row.grantedAt));

  const codesRedeemed = input.codes.filter((code) => code.redeemedAt !== null).length;
  const activeDeliveries = input.entitlements.filter(
    (row) => !row.expiresAt || row.expiresAt.getTime() > nowMs,
  );
  const expiringSoon = input.entitlements.filter(
    (row) =>
      row.expiresAt !== null &&
      row.expiresAt.getTime() > nowMs &&
      row.expiresAt.getTime() <= nowMs + WEEK_MS,
  );
  const expiredDeliveries = input.entitlements.filter(
    (row) => row.expiresAt !== null && row.expiresAt.getTime() <= nowMs,
  );
  const guestRedemptions = input.redemptions.filter((row) => row.customerId === null).length;

  const accountsAvailable = input.accounts.filter((row) => row.status === "available").length;
  const accountsAssigned = input.accounts.filter((row) => row.status === "assigned").length;
  const accountsRetired = input.accounts.filter((row) => row.status === "retired").length;

  const dailyMap = new Map<
    string,
    { key: string; label: string; redemptions: number; customers: number; deliveries: number }
  >();
  for (let index = 0; index < rangeDays; index += 1) {
    const date = new Date(rangeStart.getTime() + index * DAY_MS);
    const key = dayKey(date);
    dailyMap.set(key, { key, label: shortDay(date, locale), redemptions: 0, customers: 0, deliveries: 0 });
  }
  for (const row of redemptionsInRange) {
    const bucket = dailyMap.get(dayKey(row.createdAt));
    if (bucket) bucket.redemptions += 1;
  }
  for (const row of input.customers) {
    if (!inRange(row.createdAt)) continue;
    const bucket = dailyMap.get(dayKey(row.createdAt));
    if (bucket) bucket.customers += 1;
  }
  for (const row of deliveriesInRange) {
    const bucket = dailyMap.get(dayKey(row.grantedAt));
    if (bucket) bucket.deliveries += 1;
  }

  const codeTypes = ["single", "choice", "bundle"].map((type) => {
    const rows = input.codes.filter((code) => code.type === type);
    const redeemed = rows.filter((code) => code.redeemedAt !== null).length;
    return {
      type,
      label: t(CODE_TYPE_LABELS[type] ?? type),
      total: rows.length,
      redeemed,
      rate: rows.length ? Math.round((redeemed / rows.length) * 100) : 0,
    };
  });

  const productMap = new Map<
    string,
    { title: string; count: number; value: number; currency: string }
  >();
  for (const row of input.entitlements) {
    const game = row.gameId ? gameById.get(row.gameId) : undefined;
    const account = row.accountId ? accountById.get(row.accountId) : undefined;
    const key = game ? `g:${game.id}` : account ? `a:${account.id}` : `t:${row.title}`;
    const title = game?.title || account?.platformLabel || row.title || t("x.dijital-teslimat");
    const current = productMap.get(key) ?? {
      title,
      count: 0,
      value: 0,
      currency: game?.currency || "TRY",
    };
    current.count += 1;
    if (game) {
      const price = Number(game.ourPrice);
      if (Number.isFinite(price) && price > 0) current.value += price;
    }
    productMap.set(key, current);
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const customerCounts = new Map<number, number>();
  for (const row of redemptionsInRange) {
    if (row.customerId === null) continue;
    customerCounts.set(row.customerId, (customerCounts.get(row.customerId) ?? 0) + 1);
  }
  const topCustomers = [...customerCounts.entries()]
    .map(([id, count]) => {
      const customer = customerById.get(id);
      return { name: customer?.displayName || customer?.username || `Müşteri #${id}`, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = WEEKDAY_LABELS.map((key) => ({ label: t(key), count: 0 }));
  for (const row of redemptionsInRange) {
    hours[row.createdAt.getHours()] += 1;
    weekdays[(row.createdAt.getDay() + 6) % 7].count += 1;
  }
  const peakHourIndex = hours.reduce((best, value, index) => (value > hours[best] ? index : best), 0);
  const peakWeekdayIndex = weekdays.reduce(
    (best, value, index) => (value.count > weekdays[best].count ? index : best),
    0,
  );

  const inventoryMap = new Map<
    string,
    { platform: string; available: number; assigned: number; retired: number; total: number }
  >();
  for (const row of input.accounts) {
    const platform = row.platformLabel || t("x.diger");
    const current = inventoryMap.get(platform) ?? {
      platform,
      available: 0,
      assigned: 0,
      retired: 0,
      total: 0,
    };
    current.total += 1;
    if (row.status === "assigned") current.assigned += 1;
    else if (row.status === "retired") current.retired += 1;
    else current.available += 1;
    inventoryMap.set(platform, current);
  }
  const inventory = [...inventoryMap.values()].sort((a, b) => b.total - a.total);

  const valueMap = new Map<string, number>();
  for (const row of input.entitlements) {
    if (!row.gameId) continue;
    const game = gameById.get(row.gameId);
    if (!game) continue;
    const price = Number(game.ourPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    valueMap.set(game.currency, (valueMap.get(game.currency) ?? 0) + price);
  }
  const deliveredValue = [...valueMap.entries()]
    .map(([currency, value]) => ({ currency, value }))
    .sort((a, b) => b.value - a.value);

  const itemsByRedemption = new Map<number, number>();
  for (const row of input.entitlements) {
    itemsByRedemption.set(row.redemptionId, (itemsByRedemption.get(row.redemptionId) ?? 0) + 1);
  }

  const recent = [...input.redemptions]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12)
    .map((row) => {
      const customer = row.customerId !== null ? customerById.get(row.customerId) : undefined;
      return {
        id: row.id,
        code: codeById.get(row.codeId)?.code ?? "—",
        buyer: customer?.displayName || customer?.username || row.guestUsername || "Misafir",
        items: itemsByRedemption.get(row.id) ?? 0,
        createdAt: row.createdAt,
        accessExpiresAt: row.accessExpiresAt,
        expired: row.accessExpiresAt !== null && row.accessExpiresAt.getTime() <= nowMs,
      };
    });

  const expiring = [...input.entitlements]
    .filter(
      (row) =>
        row.expiresAt !== null &&
        row.expiresAt.getTime() > nowMs &&
        row.expiresAt.getTime() <= nowMs + WEEK_MS,
    )
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
    .slice(0, 10)
    .map((row) => {
      const game = row.gameId ? gameById.get(row.gameId) : undefined;
      const account = row.accountId ? accountById.get(row.accountId) : undefined;
      const customer = row.customerId !== null ? customerById.get(row.customerId) : undefined;
      return {
        id: row.id,
        title: game?.title || row.title || account?.platformLabel || t("x.teslimat"),
        buyer: customer?.displayName || customer?.username || t("x.misafir"),
        expiresAt: row.expiresAt as Date,
      };
    });

  return {
    rangeDays,
    totals: {
      codes: input.codes.length,
      codesRedeemed,
      codesAvailable: Math.max(0, input.codes.length - codesRedeemed),
      redemptionRate: input.codes.length
        ? Math.round((codesRedeemed / input.codes.length) * 100)
        : 0,
      deliveries: input.entitlements.length,
      activeDeliveries: activeDeliveries.length,
      expiringSoon: expiringSoon.length,
      expiredDeliveries: expiredDeliveries.length,
      customers: input.customers.length,
      newCustomers: input.customers.filter((row) => inRange(row.createdAt)).length,
      bannedCustomers: input.customers.filter((row) => row.status === "banned").length,
      guestRedemptions,
      registeredRedemptions: input.redemptions.length - guestRedemptions,
      accountsAvailable,
      accountsAssigned,
      accountsRetired,
      avgDeliveriesPerRedemption: input.redemptions.length
        ? Math.round((input.entitlements.length / input.redemptions.length) * 10) / 10
        : 0,
      rangeRedemptions: redemptionsInRange.length,
      rangeDeliveries: deliveriesInRange.length,
    },
    daily: [...dailyMap.values()],
    codeTypes,
    topProducts,
    topCustomers,
    hours,
    weekdays,
    inventory,
    deliveredValue,
    recent,
    expiring,
    peakHour: { hour: peakHourIndex, count: hours[peakHourIndex] },
    peakWeekday: { label: weekdays[peakWeekdayIndex].label, count: weekdays[peakWeekdayIndex].count },
  };
}
