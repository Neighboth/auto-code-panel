import { redirect } from "next/navigation";
import { getSuperSession } from "@/lib/session";
import { queryAudit } from "@/lib/audit";
import { AuditLogView } from "@/components/super-admin/audit-log";

export const dynamic = "force-dynamic";
export const metadata = { title: "İşlem Kayıtları" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function SuperAdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");

  const params = await searchParams;
  const q = single(params.q).trim().slice(0, 120);
  const action = single(params.action).trim().slice(0, 120);
  const severity = single(params.severity).trim();
  const actor = single(params.actor).trim().slice(0, 120);
  const from = single(params.from);
  const to = single(params.to);
  const page = Math.max(1, Number(single(params.page)) || 1);

  const pageData = await queryAudit({
    query: q || undefined,
    action: action || undefined,
    severity: ["info", "warn", "critical"].includes(severity) ? severity : undefined,
    actor: actor || undefined,
    from: from ? new Date(`${from}T00:00:00`) : null,
    to: to ? new Date(`${to}T23:59:59`) : null,
    page,
    pageSize: 50,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">Denetim</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">İşlem kayıtları</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed muted">
          Girişler, ürün ve hesap değişiklikleri, kod işlemleri, toplu işlemler, mail gönderimleri ve
          sistem ayarları dâhil her işlem yönetici, IP ve tarayıcı bilgisiyle saklanır. Kayıtlar
          silinemez; CSV olarak dışa aktarabilirsiniz.
        </p>
      </div>

      <AuditLogView pageData={pageData} filters={{ q, action, severity, actor, from, to }} />
    </div>
  );
}
