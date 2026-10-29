import type { ComponentProps, ReactNode } from "react";

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export function buttonClass(
  variant: "primary" | "accent" | "outline" | "ghost" | "danger" | "dark" | "gray" = "primary",
  size: "sm" | "md" | "lg" = "md",
  extra?: string,
): string {
  return cn(
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "accent" | "outline" | "ghost" | "danger" | "dark" | "gray";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "blue";
  className?: string;
}) {
  return (
    <span className={cn("badge", tone !== "neutral" && `badge-${tone}`, className)}>{children}</span>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[11.5px] leading-relaxed muted">{hint}</p> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] muted">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center hairline">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-[12.5px] leading-relaxed muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] muted">{label}</p>
      <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      {sub ? <p className="mt-2 text-[11.5px] muted">{sub}</p> : null}
    </div>
  );
}
