import type { ReactNode } from "react";
import { getSuperSession } from "@/lib/session";
import { brand } from "@/lib/brand";
import { SuperAdminShell } from "@/components/super-admin/shell";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const session = await getSuperSession();
  if (!session) return <>{children}</>;
  return (
    <SuperAdminShell username={session.username} brandName={brand.name} brandLogoUrl={brand.logoUrl}>
      {children}
    </SuperAdminShell>
  );
}
