"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const t = useTranslations("common");
  const router = useRouter();

  async function onClick() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
    >
      {t("signOut")}
    </button>
  );
}
