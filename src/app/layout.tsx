import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { brand } from "@/lib/brand";
import { getLocale } from "@/lib/i18n/server";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n-provider";
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
  const cookieTheme = (await cookies()).get("pix-theme")?.value;
  const theme = cookieTheme === "dark" ? "dark" : "light";

  return (
    <html lang={locale.code} dir={locale.dir} data-theme={theme} suppressHydrationWarning>
      <head>
        {/*
          The cookie already produced the right `data-theme` on the server, so this
          script only repairs the rare case where localStorage and the cookie
          disagree (user cleared cookies but kept storage). It runs before paint,
          so there is still no flash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('pix-theme');if(!s)return;var d=document.documentElement;if(d.dataset.theme!==s){d.dataset.theme=s;document.cookie='pix-theme='+s+'; path=/; max-age=31536000; samesite=lax';}}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale.code}>
          <ThemeProvider>{children}</ThemeProvider>
        </I18nProvider>
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
