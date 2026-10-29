"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal-panel ${widths[size]}`}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4 hairline">
          <div>
            {title ? <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3> : null}
            {description ? <p className="mt-1 text-[12.5px] leading-relaxed muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 transition hover:opacity-70"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5 hairline">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
