"use client";

import { MailPreferences } from "@/components/mail-preferences";
import { saveCustomerMailPrefs, saveStoreMailPrefs } from "@/app/actions/mail-prefs";
import type { MailPrefs } from "@/lib/mail-prefs";

export function CustomerMailPrefsCard({ slug, initial }: { slug: string; initial: MailPrefs }) {
  return (
    <MailPreferences
      audience="customer"
      initial={initial}
      action={(formData) => saveCustomerMailPrefs(slug, formData)}
    />
  );
}

export function StoreMailPrefsCard({ slug, initial }: { slug: string; initial: MailPrefs }) {
  return (
    <MailPreferences
      audience="store_admin"
      initial={initial}
      action={(formData) => saveStoreMailPrefs(slug, formData)}
    />
  );
}
