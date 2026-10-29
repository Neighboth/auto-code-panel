import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { headers } from "next/headers";
import { db, ensureDatabase } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCustomerSession, getStoreAdminSession, getSuperSession } from "@/lib/session";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * Audit trail.
 *
 * The platform owner has to be able to see *every* action, down to a single
 * toggle. To make that reliable instead of best-effort, the helper resolves the
 * actor itself (super admin / store manager / customer / system), pulls the
 * request metadata (IP, user agent) and never throws: a failed audit write must
 * not break the user-facing operation, but it is reported on stderr.
 */

export type ActorType = "super" | "store" | "customer" | "system";
export type Severity = "info" | "warn" | "critical";

export type AuditInput = {
  action: string;
  entity?: string;
  entityId?: string | number | null;
  /**
   * Prefer `summaryKey` + `summaryParams`: the row then carries the dictionary
   * key and the translator renders it in the reader's language. `summary` stays
   * supported for already-written rows and is still filled from the key so the
   * search box and the CSV export keep working.
   */
  summaryKey?: string;
  summaryParams?: Record<string, string | number>;
  summary?: string;
  severity?: Severity;
  storeId?: number | null;
  storeSlug?: string | null;
  actorType?: ActorType;
  actorId?: number | null;
  actorName?: string;
  metadata?: Record<string, unknown> | null;
};

export type ResolvedActor = {
  actorType: ActorType;
  actorId: number | null;
  actorName: string;
  storeId: number | null;
  storeSlug: string;
  ip: string;
  userAgent: string;
};

const MAX_METADATA = 4000;

async function requestMeta(): Promise<{ ip: string; userAgent: string }> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for") ?? "";
    const ip =
      forwarded.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      headerStore.get("cf-connecting-ip") ||
      "";
    return { ip, userAgent: (headerStore.get("user-agent") ?? "").slice(0, 300) };
  } catch {
    return { ip: "", userAgent: "" };
  }
}

/** Who is performing the current request? Cheap enough to call per action. */
export async function resolveActor(): Promise<ResolvedActor> {
  const { ip, userAgent } = await requestMeta();
  const superSession = await getSuperSession();
  if (superSession) {
    return {
      actorType: "super",
      actorId: superSession.id ?? 1,
      actorName: superSession.username,
      storeId: null,
      storeSlug: "",
      ip,
      userAgent,
    };
  }
  const storeSession = await getStoreAdminSession();
  if (storeSession) {
    return {
      actorType: "store",
      actorId: storeSession.adminId,
      actorName: storeSession.username,
      storeId: storeSession.storeId,
      storeSlug: storeSession.slug,
      ip,
      userAgent,
    };
  }
  const customerSession = await getCustomerSession();
  if (customerSession) {
    return {
      actorType: "customer",
      actorId: customerSession.customerId,
      actorName: customerSession.username,
      storeId: customerSession.storeId,
      storeSlug: "",
      ip,
      userAgent,
    };
  }
  return { actorType: "system", actorId: null, actorName: "system", storeId: null, storeSlug: "", ip, userAgent };
}

function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return "{}";
  try {
    const json = JSON.stringify(metadata, (_key, value) => {
      if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
      return value;
    });
    return json.length > MAX_METADATA ? `${json.slice(0, MAX_METADATA - 1)}…` : json;
  } catch {
    return "{}";
  }
}

/**
 * Renders the audit summary. `summaryKey` wins, so a row written today is
 * readable in every interface language; older rows keep their stored text.
 */
function summaryText(
  input: Pick<AuditInput, "summaryKey" | "summaryParams" | "summary">,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (input.summaryKey) return t(input.summaryKey, input.summaryParams);
  return input.summary ?? "";
}

function serializeParams(params: Record<string, string | number> | undefined): string {
  if (!params) return "{}";
  try {
    const json = JSON.stringify(params);
    return json.length > 2000 ? `${json.slice(0, 1999)}…` : json;
  } catch {
    return "{}";
  }
}

/** Parses the stored params back into an object (never throws). */
export function parseSummaryParams(raw: string): Record<string, string | number> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string | number> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "string" || typeof item === "number") out[key] = item;
      else if (item !== null && item !== undefined) out[key] = String(item);
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes one audit row. Never throws. */
export async function logAudit(input: AuditInput): Promise<void> {
  const t = createTranslator("tr");
  try {
    await ensureDatabase();
    const actor = await resolveActor();
    await db.insert(auditLogs).values({
      actorType: input.actorType ?? actor.actorType,
      actorId: input.actorId ?? actor.actorId,
      actorName: input.actorName ?? actor.actorName,
      storeId: input.storeId ?? actor.storeId,
      storeSlug: input.storeSlug ?? actor.storeSlug,
      action: input.action.slice(0, 120),
      entity: (input.entity ?? "").slice(0, 60),
      entityId: input.entityId === null || input.entityId === undefined ? "" : String(input.entityId).slice(0, 60),
      severity: input.severity ?? "info",
      summary: summaryText(input, t).slice(0, 500),
      summaryKey: (input.summaryKey ?? "").slice(0, 160),
      summaryParams: serializeParams(input.summaryParams),
      metadata: serializeMetadata(input.metadata),
      ip: actor.ip.slice(0, 80),
      userAgent: actor.userAgent,
    });
  } catch (error) {
    console.error(t("x.audit-kayt-yazlamad"), error);
  }
}

/** Difference between two objects, used for settings change logs. */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

/* ------------------------------ Query side ------------------------------ */

export type AuditFilter = {
  actor?: string;
  storeId?: number | null;
  action?: string;
  severity?: string;
  query?: string;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
};

export type AuditRow = {
  id: number;
  actorType: string;
  actorName: string;
  storeSlug: string;
  action: string;
  entity: string;
  entityId: string;
  severity: string;
  summary: string;
  summaryKey: string;
  summaryParams: Record<string, string | number>;
  metadata: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export type AuditPage = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  actions: { action: string; count: number }[];
};

/** Paged, filterable read used by /super-admin/loglar and the CSV export. */
export async function queryAudit(filter: AuditFilter = {}): Promise<AuditPage> {
  await ensureDatabase();
  const pageSize = Math.min(200, Math.max(10, filter.pageSize ?? 50));
  const page = Math.max(1, filter.page ?? 1);

  const conditions: SQL[] = [];
  if (filter.actor) {
    conditions.push(
      or(
        like(auditLogs.actorName, `%${filter.actor}%`),
        like(auditLogs.storeSlug, `%${filter.actor}%`),
      ) as SQL,
    );
  }
  if (filter.storeId) conditions.push(eq(auditLogs.storeId, filter.storeId));
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.severity) conditions.push(eq(auditLogs.severity, filter.severity));
  if (filter.query) {
    const term = `%${filter.query}%`;
    conditions.push(
      or(
        like(auditLogs.summary, term),
        like(auditLogs.entity, term),
        like(auditLogs.metadata, term),
        like(auditLogs.actorName, term),
      ) as SQL,
    );
  }
  if (filter.from) conditions.push(gte(auditLogs.createdAt, filter.from));
  if (filter.to) conditions.push(lte(auditLogs.createdAt, filter.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows, actionRows] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(where),
    db
      .select({ action: auditLogs.action, count: sql<number>`count(*)` })
      .from(auditLogs)
      .groupBy(auditLogs.action)
      .orderBy(sql`count(*) desc`)
      .limit(60),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      actorType: row.actorType,
      actorName: row.actorName,
      storeSlug: row.storeSlug,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      severity: row.severity,
      summary: row.summary,
      summaryKey: row.summaryKey,
      summaryParams: parseSummaryParams(row.summaryParams),
      metadata: row.metadata,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    total: Number(totalRows[0]?.value ?? 0),
    page,
    pageSize,
    actions: actionRows.map((row) => ({ action: row.action, count: Number(row.count) })),
  };
}
