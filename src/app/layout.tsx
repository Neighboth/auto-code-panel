import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { brand } from "@/lib/brand";
import { getLocale } from "@/lib/i18n/server";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: `${brand.name} — ${brand.tagline}`,
      template: `%s · ${brand.name}`,
    },
    description:
      "Multi-tenant digital account and code delivery platform: inventory, 2FA/Steam Guard codes, automatic delivery and reseller management.",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale.code} dir={locale.dir} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint. Light is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('pix-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();",
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster
          position="top-center"
          theme="system"
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
