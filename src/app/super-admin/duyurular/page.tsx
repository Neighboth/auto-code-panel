import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { platformPosts } from "@/db/schema";
import { getSuperSession } from "@/lib/session";
import { PostManager, type PostItem } from "@/components/super-admin/posts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyurular & Güncellemeler" };

export default async function SuperAdminPostsPage() {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");

  const rows = await db
    .select()
    .from(platformPosts)
    .orderBy(desc(platformPosts.pinned), desc(platformPosts.publishedAt))
    .limit(100);

  const posts: PostItem[] = rows.map((post) => ({
    id: post.id,
    kind: post.kind === "update" ? "update" : "announcement",
    title: post.title,
    body: post.body,
    version: post.version,
    pinned: post.pinned,
    publishedAt: post.publishedAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">İletişim merkezi</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">Duyurular & güncellemeler</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed muted">
          Burada yayınladığınız kayıtlar tüm mağaza yöneticilerinin panelinde iki büyük kutu içinde
          görünür. Sabitlenen kayıtlar listenin en üstünde gösterilir.
        </p>
      </div>

      <PostManager posts={posts} />
    </div>
  );
}
