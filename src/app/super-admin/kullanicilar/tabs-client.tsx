"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Settings2, Store, Users } from "lucide-react";
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
  storeStatus: string;
  storeExpiresAt: string | null;
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
  initialTab = "resellers",
}: {
  resellers: Reseller[];
  customers: StoreCustomer[];
  initialTab?: "resellers" | "customers";
}) {
  const [tab, setTab] = useState<"resellers" | "customers">(initialTab);
  const [query, setQuery] = useState("");
  // Snapshot of "now" so the render stays pure.
  const [now] = useState(() => Date.now());

  const filteredResellers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return resellers;
    return resellers.filter((item) =>
      `${item.username} ${item.email} ${item.storeName} ${item.storeSlug}`.toLowerCase().includes(term),
    );
  }, [query, resellers]);

  const filteredCustomers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((item) =>
      `${item.username} ${item.displayName} ${item.email} ${item.storeName} ${item.storeSlug}`
        .toLowerCase()
        .includes(term),
    );
  }, [query, customers]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b p-2 hairline">
        <div className="flex gap-1">
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
            Bayi hesapları ({resellers.length})
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
            Mağaza müşterileri ({customers.length})
          </button>
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kullanıcı, e-posta veya mağaza ara"
            className="input h-8 pl-7 text-[12px]"
          />
        </div>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="table min-w-[820px]">
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
              filteredResellers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[12.5px] muted">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredResellers.map((reseller) => {
                  const storeBlocked =
                    reseller.storeStatus === "suspended" ||
                    (reseller.storeExpiresAt !== null &&
                      new Date(reseller.storeExpiresAt).getTime() <= now);
                  return (
                    <tr key={reseller.id}>
                      <td>
                        <p className="text-[12.5px] font-medium">{reseller.username}</p>
                        <p className="text-[10.5px] muted">Yönetici hesabı</p>
                      </td>
                      <td className="text-[12px]">{reseller.email}</td>
                      <td>
                        <a
                          href={`/${reseller.storeSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] underline underline-offset-2"
                        >
                          {reseller.storeName}
                        </a>
                      </td>
                      <td className="text-[11.5px] muted">{formatDate(reseller.createdAt)}</td>
                      <td>
                        <span className={`badge ${storeBlocked ? "badge-red" : "badge-green"}`}>
                          {storeBlocked ? "Mağaza kapalı" : "Aktif"}
                        </span>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <Link href="/super-admin" className="btn btn-outline btn-sm">
                            <Settings2 size={12} />
                            Mağazayı yönet
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[12.5px] muted">
                  Kayıt bulunamadı.
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <tr key={`${customer.storeSlug}-${customer.id}`}>
                  <td>
                    <p className="text-[12.5px] font-medium">{customer.username}</p>
                    <p className="text-[10.5px] muted">{customer.displayName}</p>
                  </td>
                  <td className="text-[12px]">{customer.email || "—"}</td>
                  <td>
                    <a
                      href={`/${customer.storeSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] underline underline-offset-2"
                    >
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
                        href={`/super-admin/kullanicilar/${customer.storeSlug}/${customer.id}`}
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
