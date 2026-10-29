import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { brand } from "@/lib/brand";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: `${brand.name} — ${brand.tagline}`,
      template: `%s · ${brand.name}`,
    },
    description:
      "Çoklu mağaza altyapısı: oyun ve hesap envanteri, 2FA/Steam Guard kod üretimi, otomatik teslimat ve bayilik yönetimi.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          position="top-center"
          theme="light"
          toastOptions={{
            style: {
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--fg)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
