import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Code2,
  Globe2,
  KeyRound,
  Megaphone,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { db } from "@/db";
import { accounts, codes, customers, platformPosts, redemptions } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { getStoreBasePath, getStoreState, requireStoreAdmin } from "@/lib/tenant";
import { Markdown } from "@/components/markdown";
import { Stat } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.genel-baks") };
}

type PostRow = typeof platformPosts.$inferSelect;

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function postList(rows: PostRow[], kind: "announcement" | "update") {
  return rows.filter((post) => post.kind === kind).slice(0, 8);
}

async function PostBox({
  title,
  description,
  icon,
  tone,
  posts,
  emptyText,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  tone: string;
  posts: PostRow[];
  emptyText: string;
}) {
  const { t } = await getTranslator();
  return (
    <section className="card flex min-h-[220px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4 hairline">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
          >
            {icon}
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            <p className="text-[11px] muted">{description}</p>
          </div>
        </div>
        <span className="badge">{t("x.count-kayt", { count: posts.length })}</span>
      </div>
      <div className="max-h-[130px] flex-1 space-y-3 overflow-y-auto p-4 scroll-thin">
        {posts.length === 0 ? (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center hairline">
            <Sparkles size={20} className="muted" />
            <p className="mt-2 text-[12.5px] font-medium">{emptyText}</p>
            <p className="mt-1 text-[11px] muted">{" "}{t("x.platform-yonetimi-yeni-bir-kayt-yaynladgnda-burada-gorun")}</p>
          </div>
        ) : null}
        {posts.map((post) => (
          <article key={post.id} className="rounded-xl border p-4 hairline" style={{ background: "var(--bg)" }}>
            <div className="flex flex-wrap items-center gap-1.5">
              {post.version ? <span className="badge mono">{post.version}</span> : null}
              {post.pinned ? <span className="badge badge-green">Sabit</span> : null}
              <span className="text-[10.5px] muted">{formatDateTime(post.publishedAt)}</span>
            </div>
            <h3 className="mt-1.5 text-[13.5px] font-semibold">{post.title}</h3>
            {post.body ? (
              <div className="mt-2 text-[12px] leading-relaxed muted">
                <Markdown content={post.body} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ magazaSlug: string }>;
}) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) {
    const state = await getStoreState(magazaSlug);
    const basePath = state ? await getStoreBasePath(state.store) : `/${magazaSlug.toLowerCase()}`;
    redirect(`${basePath}/admin/giris`);
  }
  if (!guard.state) notFound();

  const { store } = guard.state;
  const basePath = await getStoreBasePath(store);
  const todayStart = startOfToday();
  const weekStart = daysAgo(7);

  const [postRows, codeStats, customerCount, todayRedemptions, weekRedemptions, availableAccounts] =
    await Promise.all([
      db
        .select()
        .from(platformPosts)
        .orderBy(desc(platformPosts.pinned), desc(platformPosts.publishedAt))
        .limit(40),
      db
        .select({
          total: sql<number>`count(*)`,
          redeemed: sql<number>`sum(case when ${codes.redeemedAt} is null then 0 else 1 end)`,
        })
        .from(codes)
        .where(eq(codes.storeId, store.id)),
      db
        .select({ value: count() })
        .from(customers)
        .where(eq(customers.storeId, store.id)),
      db
        .select({ value: count() })
        .from(redemptions)
        .where(and(eq(redemptions.storeId, store.id), gte(redemptions.createdAt, todayStart))),
      db
        .select({ value: count() })
        .from(redemptions)
        .where(and(eq(redemptions.storeId, store.id), gte(redemptions.createdAt, weekStart))),
      db
        .select({ value: count() })
        .from(accounts)
        .where(and(eq(accounts.storeId, store.id), eq(accounts.status, "available"))),
    ]);

  const announcements = postList(postRows, "announcement");
  const updates = postList(postRows, "update");
  const codeTotal = Number(codeStats[0]?.total ?? 0);
  const codeRedeemed = Number(codeStats[0]?.redeemed ?? 0);
  const codeAvailable = Math.max(0, codeTotal - codeRedeemed);
  const domainActive = Boolean(store.customDomain && store.customDomainVerifiedAt);

  const actions = [
    {
      href: `${basePath}/admin/oyunlar`,
      icon: Boxes,
      title: t("x.urun-ekle"),
      text: t("x.steam-linkiyle-veya-manuel-urun-tanmla"),
    },
    {
      href: `${basePath}/admin/kodlar`,
      icon: Code2,
      title: t("x.kod-uret"),
      text: t("x.tekli-secmeli-veya-paket-teslimat-kodu-olustur"),
    },
    {
      href: `${basePath}/admin/istatistikler`,
      icon: BarChart3,
      title: t("x.istatistikler"),
      text: t("x.detayl-sats-ve-teslimat-raporlarn-incele"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.magaza-paneli")}</p>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">{t("x.hos-geldiniz-name", { name: guard.session.username })}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] muted">
            {t("x.store-magazasnn-genel-durumu-ve-platform-duyurular", { store: store.name })}
            {domainActive ? (
              <span className="badge badge-green">
                <Globe2 size={10} /> {store.customDomain}
              </span>
            ) : store.customDomain ? (
              <Link href={`${basePath}/admin/ayarlar`} className="badge badge-amber">
                <Globe2 size={10} /> {store.customDomain} · {t("x.dogrulama-bekliyor-2")}
              </Link>
            ) : null}
          </p>
        </div>
        <Link href={basePath || "/"} target="_blank" className="btn btn-outline btn-sm">{t("x.vitrini-goruntule")}<ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("x.bugunku-kod-kullanm")}
          value={Number(todayRedemptions[0]?.value ?? 0)}
          sub={t("x.bugun-kullanlan-kod-says")}
        />
        <Stat
          label={t("x.son-7-gun")}
          value={Number(weekRedemptions[0]?.value ?? 0)}
          sub={t("x.haftalk-redemption")}
        />
        <Stat
          label={t("x.kullanlabilir-kod")}
          value={codeAvailable}
          sub={t("x.used-total-kod-kullanld", { used: codeRedeemed, total: codeTotal })}
        />
        <Stat
          label={t("x.musteri-envanter")}
          value={Number(customerCount[0]?.value ?? 0)}
          sub={t("x.count-hesap-teslimata-hazr", { count: Number(availableAccounts[0]?.value ?? 0) })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PostBox
          title={t("x.duyurular")}
          description={t("x.platform-yonetiminden-onemli-bilgilendirmeler")}
          icon={<Megaphone size={18} />}
          tone="#d97706"
          posts={announcements}
          emptyText={t("x.henuz-duyuru-yok")}
        />
        <PostBox
          title={t("x.guncelleme-notlar")}
          description={t("x.yeni-ozellikler-ve-surum-degisiklikleri")}
          icon={<Rocket size={18} />}
          tone="#2563eb"
          posts={updates}
          emptyText={t("x.henuz-guncelleme-notu-yok")}
        />
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">{" "}{t("x.hzl-islemler")}</h2>
            <p className="text-[11.5px] muted">{" "}{t("x.en-sk-kullanlan-magaza-yonetimi-ksayollar")}</p>
          </div>
          <span className="hidden text-[11px] muted sm:block">
            <KeyRound size={11} className="mr-1 inline" />
            {guard.session.username}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="card group p-4 transition hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
                <action.icon size={16} strokeWidth={1.8} />
              </span>
              <p className="mt-3 flex items-center gap-1 text-[13px] font-semibold">
                {action.title}
                <ArrowUpRight size={12} className="opacity-0 transition group-hover:opacity-100" />
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed muted">{action.text}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <Users size={15} className="muted" />
          <p className="text-[12px] muted">
            {t("x.kullanc-listesi-teslimat-gecmisi-ve-musteri-detaylar-ici")}{" "}
            <Link href={`${basePath}/admin/kullanicilar`} className="underline underline-offset-2" style={{ color: "var(--fg)" }}>{t("x.kullanclar-2")}</Link>{" "}
            {t("x.sayfasn-kullann")}
          </p>
        </div>
        <Link href={`${basePath}/admin/istatistikler`} className="btn btn-dark btn-sm">
          <BarChart3 size={13} />{t("x.detayl-istatistikler")}</Link>
      </div>
    </div>
  );
}
