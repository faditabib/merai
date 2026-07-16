"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addTag,
  allTags,
  filterProjects,
  removeTag,
} from "@/lib/projects/organize";
import { createClient } from "@/lib/supabase/client";
import { ProjectCard } from "./project-card";

export interface ExplorerProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
  tags: string[];
  storagePath: string | null;
}

export interface ProjectsExplorerProps {
  initialProjects: ExplorerProject[];
}

/**
 * Project organization (Build 7.7): search (title OR tags) · tag filter
 * chips (OR) · bulk select with add/remove tag over the selection. Tag
 * writes go straight through the RLS-scoped client (owner-only column),
 * optimistically mirrored in state.
 */
export function ProjectsExplorer(props: ProjectsExplorerProps) {
  const t = useTranslations("dashboard.organize");
  const supabase = useMemo(() => createClient(), []);

  const [projects, setProjects] = useState(props.initialProjects);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDraft, setBulkDraft] = useState("");

  const tags = useMemo(() => allTags(projects), [projects]);
  const visible = useMemo(
    () => filterProjects(projects, { query, tags: activeTags }),
    [projects, query, activeTags],
  );

  const persistTags = (projectId: string, nextTags: readonly string[]) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, tags: [...nextTags] } : p)),
    );
    void supabase
      .from("projects")
      .update({ tags: nextTags })
      .eq("id", projectId)
      .then(({ error }) => {
        if (error) console.error("tag update failed", error);
      });
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApply = (mode: "add" | "remove") => {
    const raw = bulkDraft;
    for (const project of projects) {
      if (!selected.has(project.id)) continue;
      const next =
        mode === "add" ? addTag(project.tags, raw) : removeTag(project.tags, raw.trim());
      if (next !== project.tags) persistTags(project.id, next);
    }
    setBulkDraft("");
  };

  const exitBulk = () => {
    setBulkMode(false);
    setSelected(new Set());
    setBulkDraft("");
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Toolbar: search + bulk toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-xs rounded-xl border border-border bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
          className={`ms-auto rounded-lg border px-3 py-1.5 text-sm ${
            bulkMode
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-muted hover:border-accent"
          }`}
        >
          {bulkMode ? t("doneSelecting") : t("select")}
        </button>
      </div>

      {/* Tag filter chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTagFilter(tag)}
              className={`rounded-full border px-3 py-1 text-xs ${
                activeTags.includes(tag)
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags([])}
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {/* Bulk bar */}
      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
          <span className="font-medium">
            {t("selectedCount", { n: selected.size })}
          </span>
          <input
            type="text"
            value={bulkDraft}
            maxLength={24}
            onChange={(e) => setBulkDraft(e.target.value)}
            placeholder={t("bulkTagPlaceholder")}
            className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={selected.size === 0 || !bulkDraft.trim()}
            onClick={() => bulkApply("add")}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t("bulkAdd")}
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || !bulkDraft.trim()}
            onClick={() => bulkApply("remove")}
            className="rounded-lg border border-border px-3 py-1 text-sm disabled:opacity-50"
          >
            {t("bulkRemove")}
          </button>
        </div>
      )}

      {/* Grid */}
      {visible.length > 0 ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <li key={project.id}>
              <ProjectCard
                id={project.id}
                title={project.title}
                status={project.status}
                createdAt={project.created_at}
                storagePath={project.storagePath}
                tags={project.tags}
                onTagsChange={(next) => persistTags(project.id, next)}
                selectable={bulkMode}
                selected={selected.has(project.id)}
                onToggleSelect={() => toggleSelect(project.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {t("noMatches")}
        </p>
      )}
    </section>
  );
}
