"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, findLocale } from "@/lib/i18n/config";
import type { ActionResult } from "@/lib/types";

export async function setLocale(locale: string): Promise<ActionResult<{ locale: string }>> {
  const target = findLocale(locale);
  if (!target) return { ok: false, message: "Desteklenmeyen dil." };
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, target.code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true, message: target.nativeName, data: { locale: target.code } };
}
