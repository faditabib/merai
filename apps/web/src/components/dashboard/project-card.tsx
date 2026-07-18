"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { addTag, removeTag } from "@/lib/projects/organize";
import { Link } from "@/i18n/navigation";
import { ProjectThumbnail } from "./project-thumbnail";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-600",
  error: "bg-red-500/15 text-red-500",
  draft: "bg-border/40 text-muted",
};

export interface ProjectCardProps {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  /** Latest ready upload path for the thumbnail; null if none. */
  storagePath: string | null;
  /** Organization (Build 7.7). */
  tags: readonly string[];
  onTagsChange: (tags: readonly string[]) => void;
  /** Lifecycle (Functional Readiness sprint). */
  archived: boolean;
  onRename: (title: string) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  /** Bulk mode: when selectable, the card toggles selection, not navigation. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}

/**
 * A premium project card (Build 6C.1; client since 7.7 for tags/selection):
 * poster thumbnail + title + status + tag chips + a small tag editor. In
 * bulk mode the card becomes a selection target.
 */
export function ProjectCard(props: ProjectCardProps) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const [editingTags, setEditingTags] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(props.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ready = props.status === "ready";

  const commitRename = () => {
    const next = titleDraft.trim();
    if (next && next !== props.title) props.onRename(next);
    setRenaming(false);
  };

  const commitDraft = () => {
    const next = addTag(props.tags, draft);
    if (next !== props.tags) props.onTagsChange(next);
    setDraft("");
  };

  const body = (
    <>
      <ProjectThumbnail
        storagePath={ready ? props.storagePath : null}
        seed={props.title}
        className="aspect-video w-full"
      />
      <div className="flex items-center gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{props.title}</h2>
          {props.archived && (
            <span className="mt-0.5 inline-block rounded-full bg-border/50 px-2 py-0.5 text-[11px] text-muted">
              {t("organize.archivedBadge")}
            </span>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {format.dateTime(new Date(props.createdAt), { dateStyle: "medium" })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
            STATUS_STYLES[props.status] ?? "animate-pulse bg-accent/15 text-accent"
          }`}
        >
          {t(`statuses.${props.status}`)}
        </span>
      </div>
    </>
  );

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition ${
        props.selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent"
      }`}
    >
      {props.selectable ? (
        <button type="button" onClick={props.onToggleSelect} className="text-start">
          {body}
        </button>
      ) : (
        <Link href={`/dashboard/projects/${props.id}`}>{body}</Link>
      )}

      {/* Selection check (bulk mode) */}
      {props.selectable && (
        <span
          aria-hidden
          className={`absolute end-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
            props.selected
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-card/80 text-muted"
          }`}
        >
          {props.selected ? "✓" : ""}
        </span>
      )}

      {/* Tags (7.7) */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {props.tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-border/40 px-2 py-0.5 text-[11px] text-muted"
          >
            {tag}
            {editingTags && (
              <button
                type="button"
                aria-label={t("organize.removeTag", { tag })}
                onClick={() => props.onTagsChange(removeTag(props.tags, tag))}
                className="hover:text-red-500"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {editingTags && (
          <input
            autoFocus
            type="text"
            value={draft}
            maxLength={24}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
              if (e.key === "Escape") setEditingTags(false);
            }}
            onBlur={() => {
              commitDraft();
              setEditingTags(false);
            }}
            placeholder={t("organize.addTagPlaceholder")}
            className="w-24 rounded-full border border-border bg-transparent px-2 py-0.5 text-[11px]"
          />
        )}
        {!props.selectable && !editingTags && (
          <button
            type="button"
            onClick={() => setEditingTags(true)}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted transition hover:border-accent hover:text-accent"
          >
            + {t("organize.tagsLabel")}
          </button>
        )}

        {/* Lifecycle menu (Functional Readiness sprint) */}
        {!props.selectable && (
          <div className="relative ms-auto">
            <button
              type="button"
              aria-label={t("organize.menu")}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((open) => !open);
                setConfirmingDelete(false);
                setRenaming(false);
              }}
              className="rounded-full px-2 py-0.5 text-sm text-muted transition hover:text-accent"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute end-0 bottom-full z-20 mb-1 flex w-48 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                {renaming ? (
                  <input
                    autoFocus
                    type="text"
                    value={titleDraft}
                    maxLength={120}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                        setMenuOpen(false);
                      }
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    onBlur={() => {
                      commitRename();
                      setMenuOpen(false);
                    }}
                    className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(props.title);
                      setRenaming(true);
                    }}
                    className="rounded-lg px-2 py-1.5 text-start text-sm transition hover:bg-border/30"
                  >
                    {t("organize.rename")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    props.onArchiveToggle();
                    setMenuOpen(false);
                  }}
                  className="rounded-lg px-2 py-1.5 text-start text-sm transition hover:bg-border/30"
                >
                  {props.archived ? t("organize.restore") : t("organize.archive")}
                </button>
                {confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      props.onDelete();
                      setMenuOpen(false);
                    }}
                    className="rounded-lg bg-red-500 px-2 py-1.5 text-start text-sm font-semibold text-white"
                  >
                    {t("organize.confirmDelete")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="rounded-lg px-2 py-1.5 text-start text-sm text-red-500 transition hover:bg-red-500/10"
                  >
                    {t("organize.delete")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
