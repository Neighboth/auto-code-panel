"use client";

import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Dialog primitive.
 *
 * Performance notes:
 * - Children are only mounted while the dialog is open. Parents used to keep
 *   large forms (all products / accounts) in the tree permanently, which made
 *   every popup feel sluggish.
 * - Rendered in a portal so opening it never re-lays-out the whole page.
 * - No backdrop blur (see globals.css) and only transform/opacity animation.
 */
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
  const widths = useMemo(
    () => ({ sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }),
    [],
  );

  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);

    // Move focus into the dialog so keyboard and screen-reader users stay inside.
    const first = focusable()[0];
    (first ?? panelRef.current)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className={`modal-panel ${widths[size]}`}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4 hairline">
          <div>
            {title ? (
              <h3 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em]">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed muted">{description}</p>
            ) : null}
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
    </div>,
    document.body,
  );
}
