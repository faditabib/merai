"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Topbar menus (refinement 2026-07-18): the user dropdown (account,
 * subscription, language, theme, logout) and the notifications bell.
 * Product navigation stays in the sidebar; account concerns live here.
 */

type Theme = "system" | "light" | "dark";
const THEME_KEY = "merai.theme";

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}

export function UserMenu({ name }: { name: string }) {
  const t = useTranslations("userMenu");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("open")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border py-1 pe-1 ps-3 text-sm transition hover:border-accent"
      >
        <span className="max-w-28 truncate">{name}</span>
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent"
        >
          {name.slice(0, 1) || "م"}
        </span>
      </button>
      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 flex w-56 flex-col gap-0.5 rounded-xl border border-border bg-card p-2 text-sm shadow-lg">
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 transition hover:bg-border/40">
            {t("settings")}
          </Link>
          <Link href="/dashboard/billing" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 transition hover:bg-border/40">
            {t("subscription")}
          </Link>
          <Link
            href={pathname}
            locale={locale === "ar" ? "en" : "ar"}
            className="rounded-lg px-3 py-2 transition hover:bg-border/40"
          >
            {t("language")}
          </Link>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-muted">{t("theme")}</span>
            <span className="flex gap-1">
              {(["system", "light", "dark"] as Theme[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTheme(option);
                    applyTheme(option);
                  }}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    theme === option
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {t(`themes.${option}`)}
                </button>
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg px-3 py-2 text-start text-red-500 transition hover:bg-red-500/10"
          >
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export interface NotificationItem {
  id: string;
  /** i18n key under notifications.kinds.* */
  kind: "projectReady" | "exportDone";
  title: string;
  at: string;
}

/** Bell + dropdown fed by REAL recent events (server-fetched). */
export function NotificationsMenu({ items }: { items: NotificationItem[] }) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("open")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-border p-2 text-muted transition hover:border-accent hover:text-accent"
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 003.4 0" />
        </svg>
        {items.length > 0 && (
          <span aria-hidden className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" />
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-card p-2 text-sm shadow-lg">
          <p className="px-3 py-1.5 text-xs font-semibold text-muted">{t("title")}</p>
          {items.length === 0 ? (
            <p className="px-3 py-3 text-muted">{t("empty")}</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-lg px-3 py-2 hover:bg-border/30">
                <p className="font-medium">{t(`kinds.${item.kind}`)}</p>
                <p className="truncate text-xs text-muted">{item.title}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
