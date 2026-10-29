import { redirect } from "next/navigation";
import { getSuperSession } from "@/lib/session";
import { getMailStats } from "@/app/actions/mail-admin";
import { MailConsole } from "@/components/super-admin/mail-console";
import { mailStatus } from "@/lib/mail-events";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-posta Merkezi" };

export default async function SuperAdminMailPage() {
  const session = await getSuperSession();
  if (!session) redirect("/super-admin");
  const stats = await getMailStats();
  const status = mailStatus();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">İletişim altyapısı</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">E-posta merkezi</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed muted">
          Doğrulama kodları, karşılama, duyuru, lisans hatırlatma ve teslim fişleri buradan izlenir.
          Gönderim kayıtları tekrar gönderimi engelleyen benzersiz anahtarlarla saklanır.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">SMTP durumu</p>
          <p className="mt-1 text-[13px] font-medium">{status.enabled ? "Yapılandırıldı" : "Kapalı (opsiyonel)"}</p>
          <p className="mt-0.5 text-[11px] muted">{status.host || "SMTP_HOST boş"}</p>
        </div>
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">Gönderen</p>
          <p className="mt-1 truncate text-[13px] font-medium">{status.from || "—"}</p>
          <p className="mt-0.5 text-[11px] muted">SMTP_FROM / SMTP_USER</p>
        </div>
        <div className="card p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">Doğrulama modu</p>
          <p className="mt-1 text-[13px] font-medium">
            {status.verification ? "Aktif" : "Kapalı"} · {env.mailVerificationMode}
          </p>
          <p className="mt-0.5 text-[11px] muted">MAIL_VERIFICATION</p>
        </div>
      </div>

      {stats.ok && stats.data ? (
        <MailConsole stats={stats.data} />
      ) : (
        <p className="text-[12.5px] muted">{stats.message ?? "Veri okunamadı."}</p>
      )}
    </div>
  );
}
