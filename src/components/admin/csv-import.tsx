"use client";
import { useT } from "@/components/i18n-provider";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import type { ActionResult } from "@/lib/types";

type ImportResult = { created: number; skipped: number; errors: string[] };

/**
 * Bulk import dialog shared by products and accounts.
 * The template is generated client-side so the user can fill it in Excel and
 * drop it back in without leaving the panel.
 */
export function CsvImportButton({
  kind,
  action,
}: {
  kind: "products" | "accounts";
  action: (csv: string) => Promise<ActionResult<ImportResult>>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const template =
    kind === "products"
      ? t("x.title-ourprice-currency-originalprice-steamurl-salesurl")
      : "platform,platformLabel,productLabel,username,email,password,guardType,steamSecret,totpSecret,mailEmail,mailPassword,notes\nsteam,Steam,Steam Oyunu,demo_user,demo@mail.com,Sifre123!,steam_guard,K4TQ2WX7Y9ZP3M8N,,demo@mail.com,MailPass123!,Not\n";

  async function submit() {
    if (!csv.trim()) {
      toast.error(t("x.csv-icerigi-bos"));
      return;
    }
    setPending(true);
    const response = await action(csv);
    setPending(false);
    if (!response.ok) {
      toast.error(response.message ?? t("x.ice-aktarlamad"));
      setResult(response.data ?? null);
      return;
    }
    toast.success(response.message ?? t("x.ice-aktarld"));
    setResult(response.data ?? null);
    setCsv("");
  }

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${template}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = kind === "products" ? "urun-sablonu.csv" : "hesap-sablonu.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    toast.success(t("x.name-yuklendi", { name: file.name }));
  }

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        <Upload size={12} />{t("x.csv-ice-aktar")}</button>
      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={kind === "products" ? t("x.urunleri-csv-ile-ekle") : t("x.hesaplar-csv-ile-ekle")}
        description={t("x.excel-den-kopyalayp-yapstrn-veya-sablonu-indirip-dolduru")}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={downloadTemplate}>
              <Download size={13} />{t("x.sablonu-indir")}</button>
            <span className="flex-1" />
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={pending}>
              Kapat
            </button>
            <button type="button" className="btn btn-dark" onClick={submit} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
              {t("x.ice-aktar")}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={12} />{t("x.dosya-sec")}</button>
            <span className="text-[11px] muted">{" "}{t("x.veya-asagya-yapstrn-en-fazla-300-satr")}</span>
          </div>
          <Field label={t("x.csv-icerigi")} htmlFor="csv" hint={t("x.ilk-satr-baslk-olmaldr-baslk-adlar-sablonla-ayn-olmal")}>
            <textarea
              id="csv"
              className="textarea font-mono text-[11.5px]"
              rows={9}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={template}
            />
          </Field>
          {result ? (
            <div className="rounded-lg border p-3 text-[12px] hairline">
              <p className="font-medium">
                {t("x.created-kayt-eklendi-skipped-satr-atland", { created: result.created, skipped: result.skipped })}
              </p>
              {result.errors.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11.5px] muted">
                  {result.errors.slice(0, 8).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
