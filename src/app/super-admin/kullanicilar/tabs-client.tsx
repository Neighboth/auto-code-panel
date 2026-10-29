"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, Loader2, Store, Users } from "lucide-react";
import { setResellerBan } from "@/app/actions/super-admin";
import { formatDate } from "@/lib/format";

type Reseller = {
  key: number;
  id: number;
  username: string;
  email: string;
  status: string;
  createdAt: string;
  storeName: string;
  storeSlug: string;
};

type StoreCustomer = {
  key: number;
  id: number;
  username: string;
  displayName: string;
  email: string;
  status: string;
  createdAt: string;
  storeName: string;
  storeSlug: string;
};

export function UserTabs({
  resellers,
  customers,
}: {
  resellers: Reseller[];
  customers: StoreCustomer[];
}) {
  const [tab, setTab] = useState<"resellers" | "customers">("resellers");
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);

  async function toggleResellerBan(reseller: Reseller) {
    setPending(reseller.id);
    const result = await setResellerBan(reseller.id, reseller.status !== "banned");
    setPending(null);
    if (!result.ok) {
      toast.error(result.message ?? "Güncellenemedi");
      return;
    }
    toast.success(result.message ?? "Güncellendi");
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex gap-1 border-b p-2 hairline">
        <button
          type="button"
          onClick={() => setTab("resellers")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition"
          style={{
            background: tab === "resellers" ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
            color: tab === "resellers" ? "var(--fg)" : "var(--fg-muted)",
          }}
        >
          <Store size={13} />
          Bayi Hesapları ({resellers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("customers")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition"
          style={{
            background: tab === "customers" ? "color-mix(in srgb, var(--fg) 7%, transparent)" : "transparent",
            color: tab === "customers" ? "var(--fg)" : "var(--fg-muted)",
          }}
        >
          <Users size={13} />
          Mağaza Müşterileri ({customers.length})
        </button>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              {tab === "resellers" ? (
                <>
                  <th>Bayi hesabı</th>
                  <th>E-posta</th>
                  <th>Mağaza</th>
                  <th>Kayıt</th>
                  <th>Durum</th>
                  <th className="text-right">İşlem</th>
                </>
              ) : (
                <>
                  <th>Müşteri</th>
                  <th>E-posta</th>
                  <th>Bağlı mağaza</th>
                  <th>Kayıt</th>
                  <th>Durum</th>
                  <th className="text-right">İşlem</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tab === "resellers" ? (
              resellers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[12.5px] muted">
                    Henüz bayi hesabı yok.
                  </td>
                </tr>
              ) : (
                resellers.map((reseller) => (
                  <tr key={reseller.id}>
                    <td>
                      <p className="text-[12.5px] font-medium">{reseller.username}</p>
                    </td>
                    <td className="text-[12px]">{reseller.email}</td>
                    <td>
                      <a href={`/${reseller.storeSlug}`} target="_blank" rel="noreferrer" className="text-[12px] underline underline-offset-2">
                        {reseller.storeName}
                      </a>
                    </td>
                    <td className="text-[11.5px] muted">{formatDate(reseller.createdAt)}</td>
                    <td>
                      <span className={`badge ${reseller.status === "active" ? "badge-green" : "badge-red"}`}>
                        {reseller.status === "active" ? "Aktif" : "Askıda"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => toggleResellerBan(reseller)}
                          disabled={pending === reseller.id}
                        >
                          {pending === reseller.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Gavel size={12} />
                          )}
                          {reseller.status === "active" ? "Askıya al" : "Aktifleştir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[12.5px] muted">
                  Henüz mağaza müşterisi yok.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={`${customer.storeSlug}-${customer.id}`}>
                  <td>
                    <p className="text-[12.5px] font-medium">{customer.username}</p>
                    <p className="text-[10.5px] muted">{customer.displayName}</p>
                  </td>
                  <td className="text-[12px]">{customer.email || "—"}</td>
                  <td>
                    <a href={`/${customer.storeSlug}`} target="_blank" rel="noreferrer" className="text-[12px] underline underline-offset-2">
                      {customer.storeName}
                    </a>
                  </td>
                  <td className="text-[11.5px] muted">{formatDate(customer.createdAt)}</td>
                  <td>
                    <span className={`badge ${customer.status === "active" ? "badge-green" : "badge-red"}`}>
                      {customer.status === "active" ? "Aktif" : "Yasaklı"}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Link
                        href={`/${customer.storeSlug}/admin/kullanicilar/${customer.id}`}
                        className="btn btn-outline btn-sm"
                      >
                        Yönet
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
