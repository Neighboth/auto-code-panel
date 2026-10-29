"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({
  value,
  label,
  className,
  compact = false,
  hideOnMasked = false,
}: {
  value: string;
  label?: string;
  className?: string;
  compact?: boolean;
  hideOnMasked?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Kopyalandı");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Kopyalama başarısız oldu");
    }
  }

  if (hideOnMasked) return null;

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition hover:opacity-80 hairline ${
        className ?? ""
      }`}
      title="Kopyala"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {compact ? null : <span>{label ?? "Kopyala"}</span>}
    </button>
  );
}
