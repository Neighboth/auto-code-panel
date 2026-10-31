export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <path
        d="M10 9.5v13M16 9.5v13M22 9.5v6.5"
        stroke="var(--bg-elevated)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="22" cy="21.5" r="1.9" fill="var(--bg-elevated)" />
    </svg>
  );
}

export function BrandLogo({
  logoUrl,
  size = 28,
  className,
  priority = true,
}: {
  logoUrl?: string;
  size?: number;
  className?: string;
  /**
   * Header logos are above the fold: `loading="lazy"` there made the store logo
   * pop in a second after the rest of the bar (the browser only started the
   * request once layout settled). Eager + explicit dimensions paints with the
   * rest of the header and reserves the box, so nothing shifts.
   */
  priority?: boolean;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={`shrink-0 rounded-md object-cover ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className={`shrink-0 ${className ?? ""}`}>
      <BrandMark size={size} />
    </span>
  );
}

export function Wordmark({
  name,
  subtitle,
  logoUrl,
  size = 28,
  subtitleClassName,
}: {
  name: string;
  subtitle?: string;
  logoUrl?: string;
  size?: number;
  subtitleClassName?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandLogo logoUrl={logoUrl} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
        {subtitle ? (
          <span
            className={`block truncate text-[10.5px] font-medium uppercase tracking-[0.11em] muted ${
              subtitleClassName ?? "hidden sm:block"
            }`}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
