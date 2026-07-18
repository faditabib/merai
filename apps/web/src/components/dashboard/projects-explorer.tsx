"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addTag,
  allTags,
  filterProjects,
  removeTag,
} from "@/lib/projects/organize";
import { deleteProject } from "@/app/actions/projects";
import { createClient } from "@/lib/supabase/client";
import { ProjectCard } from "./project-card";

export interface ExplorerProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
  tags: string[];
  storagePath: string | null;
  archived_at: string | null;
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
  // Lifecycle (Functional Readiness): archived projects live behind a toggle.
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(
    () => projects.filter((p) => p.archived_at != null).length,
    [projects],
  );
  const tags = useMemo(() => allTags(projects), [projects]);
  const visible = useMemo(
    () =>
      filterProjects(projects, { query, tags: activeTags }).filter((p) =>
        showArchived ? p.archived_at != null : p.archived_at == null,
      ),
    [projects, query, activeTags, showArchived],
  );

  // Lifecycle handlers (Functional Readiness): rename/archive are RLS-scoped
  // owner-column updates (the tags precedent); delete goes through the server
  // action (storage sweep needs the service role).
  const renameProject = (projectId: string, title: string) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, title } : p)));
    void supabase
      .from("projects")
      .update({ title })
      .eq("id", projectId)
      .then(({ error }) => {
        if (error) console.error("rename failed", error);
      });
  };

  const toggleArchive = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const next = project?.archived_at ? null : new Date().toISOString();
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, archived_at: next } : p)),
    );
    void supabase
      .from("projects")
      .update({ archived_at: next })
      .eq("id", projectId)
      .then(({ error }) => {
        if (error) console.error("archive toggle failed", error);
      });
  };

  const removeProject = (projectId: string) => {
    // Optimistic removal; restore on failure so nothing silently vanishes.
    const snapshot = projects;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    void deleteProject({ projectId }).then((result) => {
      if (!result.ok) {
        console.error("delete failed", result.error);
        setProjects(snapshot);
      }
    });
  };

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
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              showArchived
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:border-accent"
            }`}
          >
            {t("archivedFilter", { n: archivedCount })}
          </button>
        )}
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
                archived={project.archived_at != null}
                onRename={(title) => renameProject(project.id, title)}
                onArchiveToggle={() => toggleArchive(project.id)}
                onDelete={() => removeProject(project.id)}
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
