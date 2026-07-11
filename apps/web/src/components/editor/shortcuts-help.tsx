"use client";

import { useTranslations } from "next-intl";

/**
 * Keyboard shortcut discovery (Build 6A). Lists ONLY the shortcuts that
 * already exist in the editor — no new bindings. Opened with ? (or ؟ on
 * Arabic layouts) or the header button; closed with Esc/backdrop/button.
 * The kbd column is pinned LTR (key combos read left→right universally);
 * the labels follow the UI language.
 */
export function ShortcutsHelp(props: { open: boolean; onClose: () => void }) {
  const t = useTranslations("editor.shortcuts");
  if (!props.open) return null;

  const rows: Array<{ keys: string[]; label: string }> = [
    { keys: ["Space"], label: t("items.play") },
    { keys: ["Delete"], label: t("items.deleteSelection") },
    { keys: ["Ctrl", "Z"], label: t("items.undo") },
    { keys: ["Ctrl", "Shift", "Z"], label: t("items.redo") },
    { keys: [t("keys.click")], label: t("items.seek") },
    { keys: [t("keys.shiftClick")], label: t("items.range") },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-border px-3 py-1 text-sm text-muted hover:border-accent hover:text-accent"
          >
            {t("close")}
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm">{row.label}</span>
              <span dir="ltr" className="flex shrink-0 items-center gap-1">
                {row.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-border bg-border/30 px-2 py-0.5 text-xs font-semibold"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">{t("hint")}</p>
      </div>
    </div>
  );
}
