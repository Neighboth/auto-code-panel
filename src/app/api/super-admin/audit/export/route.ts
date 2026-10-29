import { NextResponse } from "next/server";
import { getSuperSession } from "@/lib/session";
import { queryAudit } from "@/lib/audit";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** CSV export of the audit trail (super admin only). */
export async function GET(request: Request) {
  const { t } = await getTranslator();
  const session = await getSuperSession();
  if (!session) return new NextResponse(t("x.yetkisiz"), { status: 401 });

  const url = new URL(request.url);
  const value = (key: string) => (url.searchParams.get(key) ?? "").trim();
  const severity = value("severity");

  const rows: Awaited<ReturnType<typeof queryAudit>>["rows"] = [];
  let page = 1;
  for (;;) {
    const chunk = await queryAudit({
      query: value("q") || undefined,
      action: value("action") || undefined,
      severity: ["info", "warn", "critical"].includes(severity) ? severity : undefined,
      actor: value("actor") || undefined,
      from: value("from") ? new Date(`${value("from")}T00:00:00`) : null,
      to: value("to") ? new Date(`${value("to")}T23:59:59`) : null,
      page,
      pageSize: 200,
    });
    rows.push(...chunk.rows);
    if (rows.length >= chunk.total || chunk.rows.length === 0 || page >= 50) break;
    page += 1;
  }

  // Column names live in the dictionary, so the CSV matches the interface the
  // super admin is currently using.
  const header = [
    "id",
    t("x.audit-kolon-zaman"),
    t("x.audit-kolon-islem"),
    t("x.audit-kolon-yapan"),
    t("x.audit-kolon-yapan-tipi"),
    t("x.audit-kolon-magaza"),
    t("x.audit-kolon-varlik"),
    t("x.audit-kolon-varlik-id"),
    t("x.audit-kolon-onem"),
    t("x.audit-kolon-ozet"),
    t("x.audit-kolon-ip"),
    t("x.audit-kolon-tarayici"),
    t("x.audit-kolon-ek-veri"),
  ];
  const escape = (input: string) => `"${String(input).replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.createdAt,
        row.action,
        row.actorName,
        row.actorType,
        row.storeSlug,
        row.entity,
        row.entityId,
        row.severity,
        row.summaryKey ? t(row.summaryKey, row.summaryParams) : row.summary,
        row.ip,
        row.userAgent,
        row.metadata,
      ]
        .map((cell) => escape(String(cell ?? "")))
        .join(","),
    );
  }

  // Excel-friendly BOM so Turkish characters survive a double click.
  const body = `\uFEFF${lines.join("\r\n")}`;
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="islem-kayitlari-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
