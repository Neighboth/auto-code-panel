import type { ReactNode } from "react";

export function BarChart({
  data,
  height = 132,
  tone = "var(--store-accent)",
  emptyText = "Bu aralıkta veri yok",
}: {
  data: { key?: string; label: string; value: number }[];
  height?: number;
  tone?: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const hasData = total > 0;
  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((point, index) => (
          <div
            key={point.key ?? `${point.label}-${index}`}
            className="group flex h-full min-w-[3px] flex-1 flex-col justify-end"
            title={`${point.label}: ${point.value}`}
          >
            <div
              className="w-full rounded-t-[3px] transition-opacity"
              style={{
                height: hasData ? `${Math.max(point.value > 0 ? 3 : 1, (point.value / max) * 100)}%` : "1px",
                background: tone,
                opacity: point.value > 0 ? 1 : 0.12,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9.5px] muted">
        {data.map((point, index) =>
          index % labelStep === 0 || index === data.length - 1 ? (
            <span key={`label-${point.key ?? index}`}>{point.label}</span>
          ) : null,
        )}
      </div>
      {!hasData ? <p className="mt-2 text-center text-[11px] muted">{emptyText}</p> : null}
    </div>
  );
}

export function HourHeatmap({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
      {hours.map((value, hour) => (
        <div
          key={hour}
          className="rounded-md border py-1.5 text-center hairline"
          title={`${String(hour).padStart(2, "0")}:00 — ${value} redemption`}
          style={{
            background:
              value > 0
                ? `color-mix(in srgb, var(--store-accent) ${Math.max(10, Math.round((value / max) * 70))}%, transparent)`
                : "transparent",
          }}
        >
          <p className="text-[9px] muted">{String(hour).padStart(2, "0")}</p>
          <p className="text-[11px] font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function UsageDonut({
  used,
  total,
  label,
  centerLabel,
}: {
  used: number;
  total: number;
  label: string;
  centerLabel?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-24 w-24 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(var(--store-primary) ${percent}%, color-mix(in srgb, var(--border) 90%, transparent) 0)`,
        }}
      >
        <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)" }}>
          <span className="text-[19px] font-semibold leading-none tabular-nums">{percent}%</span>
          <span className="mt-1 text-[9px] uppercase tracking-[0.08em] muted">{centerLabel ?? "kullanım"}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] muted">
          {used.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
          <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--store-primary)" }} />
        </div>
      </div>
    </div>
  );
}

export function ProgressRow({
  label,
  value,
  total,
  suffix,
  tone = "var(--store-primary)",
}: {
  label: string;
  value: number;
  total: number;
  suffix?: ReactNode;
  tone?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums muted">
          {value.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")}
          {suffix ? <span className="ml-1.5">· {suffix}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: tone }} />
      </div>
    </div>
  );
}
