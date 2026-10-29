import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Clock3,
  Code2,
  Coins,
  PackageCheck,
  Trophy,
  Users,
  Warehouse,
} from "lucide-react";
import { db } from "@/db";
import { accounts, codes, customers, entitlements, games, redemptions } from "@/db/schema";
import { formatDateTime, formatMoney, remainingLabel } from "@/lib/format";
import { computeStoreStats } from "@/lib/store-stats";
import { getStoreBasePath, getStoreState, requireStoreAdmin } from "@/lib/tenant";
import { BarChart, HourHeatmap, ProgressRow, UsageDonut } from "@/components/admin/stats";
import { Stat } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.istatistikler") };
}

const RANGES = [
  { days: 7, label: "x.7-gun" },
  { days: 30, label: "x.30-gun" },
  { days: 90, label: "x.90-gun" },
];

export default async function AdminStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazaSlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const { range } = await searchParams;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) {
    const state = await getStoreState(magazaSlug);
    const basePath = state ? await getStoreBasePath(state.store) : `/${magazaSlug.toLowerCase()}`;
    redirect(`${basePath}/admin/giris`);
  }
  if (!guard.state) notFound();

  const { store } = guard.state;
  const basePath = await getStoreBasePath(store);
  const requestedRange = Number(range);
  const rangeDays = [7, 30, 90].includes(requestedRange) ? requestedRange : 30;

  const [codeRows, redemptionRows, entitlementRows, customerRows, gameRows, accountRows] =
    await Promise.all([
      db
        .select({
          id: codes.id,
          code: codes.code,
          type: codes.type,
          label: codes.label,
          createdAt: codes.createdAt,
          redeemedAt: codes.redeemedAt,
        })
        .from(codes)
        .where(eq(codes.storeId, store.id)),
      db
        .select({
          id: redemptions.id,
          codeId: redemptions.codeId,
          customerId: redemptions.customerId,
          guestUsername: redemptions.guestUsername,
          createdAt: redemptions.createdAt,
          accessExpiresAt: redemptions.accessExpiresAt,
        })
        .from(redemptions)
        .where(eq(redemptions.storeId, store.id)),
      db
        .select({
          id: entitlements.id,
          redemptionId: entitlements.redemptionId,
          customerId: entitlements.customerId,
          kind: entitlements.kind,
          gameId: entitlements.gameId,
          accountId: entitlements.accountId,
          title: entitlements.title,
          grantedAt: entitlements.grantedAt,
          expiresAt: entitlements.expiresAt,
        })
        .from(entitlements)
        .where(eq(entitlements.storeId, store.id)),
      db
        .select({
          id: customers.id,
          username: customers.username,
          displayName: customers.displayName,
          status: customers.status,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .where(eq(customers.storeId, store.id)),
      db
        .select({
          id: games.id,
          title: games.title,
          ourPrice: games.ourPrice,
          currency: games.currency,
        })
        .from(games)
        .where(eq(games.storeId, store.id)),
      db
        .select({
          id: accounts.id,
          platformLabel: accounts.platformLabel,
          status: accounts.status,
          createdAt: accounts.createdAt,
        })
        .from(accounts)
        .where(eq(accounts.storeId, store.id)),
    ]);

  const stats = await computeStoreStats(
    {
      codes: codeRows,
      redemptions: redemptionRows,
      entitlements: entitlementRows,
      customers: customerRows,
      games: gameRows,
      accounts: accountRows,
    },
    rangeDays,
  );

  const deliveredValue = stats.deliveredValue.length
    ? stats.deliveredValue.map((entry) => formatMoney(entry.value, entry.currency)).join(" · ")
    : "—";

  const lastRedemption = redemptionRows.reduce<Date | null>(
    (latest, row) => (!latest || row.createdAt.getTime() > latest.getTime() ? row.createdAt : latest),
    null,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{t("x.analitik")}</p>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">{" "}{t("x.detayl-istatistikler")}</h1>
          <p className="mt-1 text-[12.5px] muted">
            {t("x.kod-kullanm-teslimat-hacmi-musteri-buyumesi-ve-envanter-")}
            {lastRedemption ? t("x.son-islem-when", { when: formatDateTime(lastRedemption) }) : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1 hairline" style={{ background: "var(--bg-elevated)" }}>
          {RANGES.map((item) => (
            <Link
              key={item.days}
              href={`${basePath}/admin/istatistikler?range=${item.days}`}
              className="rounded-md px-3 py-1.5 text-[11.5px] font-medium"
              style={{
                background:
                  rangeDays === item.days ? "color-mix(in srgb, var(--fg) 8%, transparent)" : "transparent",
                color: rangeDays === item.days ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("x.kod-kullanm-oran")}
          value={`${stats.totals.redemptionRate}%`}
          sub={t("x.used-total-kod-kullanld", { used: stats.totals.codesRedeemed, total: stats.totals.codes })}
        />
        <Stat
          label={t("x.toplam-teslimat")}
          value={stats.totals.deliveries}
          sub={t("x.active-aktif-expiring-yaknda-bitiyor", { active: stats.totals.activeDeliveries, expiring: stats.totals.expiringSoon })}
        />
        <Stat
          label={t("x.musteri")}
          value={stats.totals.customers}
          sub={t("x.added-yeni-banned-yasakl", { added: stats.totals.newCustomers, banned: stats.totals.bannedCustomers })}
        />
        <Stat
          label={t("x.teslimata-hazr-hesap")}
          value={stats.totals.accountsAvailable}
          sub={t("x.assigned-atanms-retired-pasif", { assigned: stats.totals.accountsAssigned, retired: stats.totals.accountsRetired })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("x.days-gunluk-redemption", { days: rangeDays })}
          value={stats.totals.rangeRedemptions}
          sub={t("x.guest-misafir-registered-kaytl-tum-zamanlar", { guest: stats.totals.guestRedemptions, registered: stats.totals.registeredRedemptions })}
        />
        <Stat
          label={t("x.days-gunluk-teslimat", { days: rangeDays })}
          value={stats.totals.rangeDeliveries}
          sub={t("x.redemption-basna-avg-urun", { avg: stats.totals.avgDeliveriesPerRedemption })}
        />
        <Stat
          label={t("x.tahmini-teslim-degeri")}
          value={<span className="text-[17px] leading-tight">{deliveredValue}</span>}
          sub={t("x.oyun-liste-fiyatlaryla-tum-zamanlar")}
        />
        <Stat
          label={t("x.yogun-saat")}
          value={`${String(stats.peakHour.hour).padStart(2, "0")}:00`}
          sub={t("x.count-redemption-en-yogun-gun-day", { count: stats.peakHour.count, day: stats.peakWeekday.label })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <Activity size={15} />
                Redemption trendi
              </h2>
              <p className="mt-0.5 text-[11.5px] muted">{t("x.son-days-gun-gunluk-kullanlan-kod-says", { days: rangeDays })}</p>
            </div>
            <span className="badge badge-blue">{t("x.count-islem", { count: stats.totals.rangeRedemptions })}</span>
          </div>
          <div className="mt-4">
            <BarChart data={stats.daily.map((day) => ({ key: day.key, label: day.label, value: day.redemptions }))} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Code2 size={15} />{t("x.kod-kullanm")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.tum-zamanlar-tur-baznda-doluluk")}</p>
          <div className="mt-4">
            <UsageDonut
              used={stats.totals.codesRedeemed}
              total={stats.totals.codes}
              label={t("x.kullanlan-kod-toplam-kod")}
            />
          </div>
          <div className="mt-4 space-y-3">
            {stats.codeTypes.map((type) => (
              <ProgressRow
                key={type.type}
                label={type.label}
                value={type.redeemed}
                total={type.total}
                suffix={`%${type.rate}`}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Users size={15} />{t("x.musteri-buyumesi")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{t("x.son-days-gun-gunluk-yeni-kayt", { days: rangeDays })}</p>
          <div className="mt-4">
            <BarChart
              data={stats.daily.map((day) => ({ key: day.key, label: day.label, value: day.customers }))}
              tone="#16a34a"
              emptyText={t("x.bu-aralkta-yeni-musteri-yok")}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <PackageCheck size={15} />{t("x.gunluk-teslimat")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{t("x.son-days-gun-olusturulan-entitlement-says", { days: rangeDays })}</p>
          <div className="mt-4">
            <BarChart
              data={stats.daily.map((day) => ({ key: day.key, label: day.label, value: day.deliveries }))}
              tone="var(--store-primary)"
              emptyText={t("x.bu-aralkta-teslimat-yok")}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Clock3 size={15} />{t("x.saatlik-yogunluk")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.secili-aralktaki-redemption-saatleri")}</p>
          <div className="mt-4">
            <HourHeatmap hours={stats.hours} />
          </div>
          <div className="mt-4 border-t pt-4 hairline">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">{" "}{t("x.haftann-gunleri")}</p>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {stats.weekdays.map((day) => (
                <div key={day.label} className="text-center">
                  <div
                    className="mx-auto flex h-16 w-full max-w-10 items-end justify-center rounded-md border hairline"
                    style={{ background: "var(--bg)" }}
                    title={`${day.label}: ${day.count}`}
                  >
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${Math.max(day.count > 0 ? 8 : 2, Math.round((day.count / Math.max(1, ...stats.weekdays.map((item) => item.count))) * 100))}%`,
                        background: "var(--store-accent)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[9.5px] muted">{day.label}</p>
                  <p className="text-[10px] font-medium tabular-nums">{day.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Warehouse size={15} />{t("x.envanter-daglm")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.platforma-gore-hesap-stok-durumu")}</p>
          <div className="mt-4 space-y-3">
            {stats.inventory.length === 0 ? (
              <p className="text-[12px] muted">{" "}{t("x.henuz-envanter-hesab-yok")}</p>
            ) : null}
            {stats.inventory.map((item) => (
              <div key={item.platform} className="rounded-lg border p-3 hairline">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-medium">{item.platform}</span>
                  <span className="tabular-nums muted">{item.total} hesap</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                  <div style={{ width: `${(item.available / Math.max(1, item.total)) * 100}%`, background: "#16a34a" }} />
                  <div style={{ width: `${(item.assigned / Math.max(1, item.total)) * 100}%`, background: "#2563eb" }} />
                  <div style={{ width: `${(item.retired / Math.max(1, item.total)) * 100}%`, background: "#a1a1aa" }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] muted">
                  <span><span style={{ color: "#16a34a" }}>●</span> {t("x.count-musait", { count: item.available })}</span>
                  <span><span style={{ color: "#2563eb" }}>●</span> {t("x.count-atanms", { count: item.assigned })}</span>
                  <span><span style={{ color: "#a1a1aa" }}>●</span> {t("x.count-pasif", { count: item.retired })}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5 hairline">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <Trophy size={15} />{t("x.en-cok-teslim-edilen-urunler")}</h2>
              <p className="text-[11px] muted">{" "}{t("x.tum-zamanlar-tahmini-deger-oyun-liste-fiyatyla")}</p>
            </div>
            <span className="badge">{stats.topProducts.length}</span>
          </div>
          {stats.topProducts.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] muted">{" "}{t("x.henuz-teslimat-yok")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("x.urun")}</th>
                  <th className="text-right">{t("x.teslimat")}</th>
                  <th className="text-right">{t("x.deger")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.topProducts.map((product) => (
                  <tr key={`${product.title}-${product.currency}`}>
                    <td className="max-w-[240px] truncate text-[12.5px]">{product.title}</td>
                    <td className="text-right text-[12.5px] tabular-nums">{product.count}</td>
                    <td className="text-right text-[12px] tabular-nums muted">
                      {product.value > 0 ? formatMoney(product.value, product.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5 hairline">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <Coins size={15} />{t("x.en-aktif-musteriler")}</h2>
              <p className="text-[11px] muted">{" "}{t("x.secili-aralkta-redemption-says")}</p>
            </div>
            <span className="badge">{t("x.days-gun", { days: rangeDays })}</span>
          </div>
          {stats.topCustomers.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] muted">{" "}{t("x.bu-aralkta-kaytl-musteri-islemi-yok")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("x.musteri")}</th>
                  <th className="text-right">Redemption</th>
                </tr>
              </thead>
              <tbody>
                {stats.topCustomers.map((customer) => (
                  <tr key={customer.name}>
                    <td className="text-[12.5px]">{customer.name}</td>
                    <td className="text-right text-[12.5px] tabular-nums">{customer.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5 hairline">
          <div>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <BarChart3 size={15} />{t("x.son-redemption-islemleri")}</h2>
            <p className="text-[11px] muted">{" "}{t("x.en-yeni-12-kod-kullanm")}</p>
          </div>
          <span className="badge">{redemptionRows.length} toplam</span>
        </div>
        {stats.recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] muted">{" "}{t("x.henuz-kod-kullanlmad")}</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table min-w-[720px]">
              <thead>
                <tr>
                  <th>{t("x.kod")}</th>
                  <th>{t("x.alc")}</th>
                  <th>{t("x.urun")}</th>
                  <th>Tarih</th>
                  <th>{t("x.erisim")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="mono text-[11.5px]">{row.code}</td>
                    <td className="text-[12px]">{row.buyer}</td>
                    <td className="text-[12px] tabular-nums">{t("x.count-urun", { count: row.items })}</td>
                    <td className="text-[11.5px] muted">{formatDateTime(row.createdAt)}</td>
                    <td>
                      {row.accessExpiresAt === null ? (
                        <span className="badge badge-green">{t("x.suresiz")}</span>
                      ) : row.expired ? (
                        <span className="badge badge-red">Doldu</span>
                      ) : (
                        <span className="badge badge-blue">{remainingLabel(row.accessExpiresAt)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5 hairline">
            <div>
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <CalendarClock size={15} />{t("x.suresi-yaklasan-teslimatlar")}</h2>
              <p className="text-[11px] muted">{" "}{t("x.onumuzdeki-7-gun-icinde-kapanacak-erisimler")}</p>
            </div>
            <span className="badge badge-amber">{stats.totals.expiringSoon}</span>
          </div>
          {stats.expiring.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] muted">{" "}{t("x.yakn-zamanda-suresi-dolacak-teslimat-yok")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("x.urun")}</th>
                  <th>{t("x.alc")}</th>
                  <th className="text-right">Kalan</th>
                </tr>
              </thead>
              <tbody>
                {stats.expiring.map((row) => (
                  <tr key={row.id}>
                    <td className="max-w-[220px] truncate text-[12.5px]">{row.title}</td>
                    <td className="text-[12px] muted">{row.buyer}</td>
                    <td className="text-right">
                      <span className="badge badge-amber">{remainingLabel(row.expiresAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <PackageCheck size={15} />{t("x.teslimat-ozeti")}</h2>
          <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.aktiflik-ve-sure-daglm")}</p>
          <div className="mt-4 space-y-3">
            <ProgressRow
              label={t("x.aktif-teslimat")}
              value={stats.totals.activeDeliveries}
              total={Math.max(1, stats.totals.deliveries)}
              tone="#16a34a"
            />
            <ProgressRow
              label={t("x.suresi-dolan")}
              value={stats.totals.expiredDeliveries}
              total={Math.max(1, stats.totals.deliveries)}
              tone="#dc2626"
            />
            <ProgressRow
              label="Misafir redemption"
              value={stats.totals.guestRedemptions}
              total={Math.max(1, redemptionRows.length)}
              tone="#d97706"
            />
            <ProgressRow
              label={t("x.kullanlabilir-kod")}
              value={stats.totals.codesAvailable}
              total={Math.max(1, stats.totals.codes)}
              tone="#2563eb"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-[11.5px] hairline">
            <div className="rounded-lg border p-2.5 hairline">
              <p className="muted">{" "}{t("x.musteri-basna")}</p>
              <p className="mt-0.5 text-[14px] font-semibold tabular-nums">
                {stats.totals.customers > 0
                  ? (redemptionRows.filter((row) => row.customerId !== null).length / stats.totals.customers).toFixed(1)
                  : "0.0"}{" "}
                {t("x.islem-2")}
              </p>
            </div>
            <div className="rounded-lg border p-2.5 hairline">
              <p className="muted">{" "}{t("x.ortalama-urun")}</p>
              <p className="mt-0.5 text-[14px] font-semibold tabular-nums">
                {stats.totals.avgDeliveriesPerRedemption} / redemption
              </p>
            </div>
          </div>
        </section>
      </div>

      <p className="pb-2 text-center text-[10.5px] leading-relaxed muted">{t("x.tahmini-deger-yalnzca-oyun-teslimatlarn-ve-magazadaki-li")}</p>
    </div>
  );
}
