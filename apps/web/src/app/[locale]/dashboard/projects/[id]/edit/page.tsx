import { notFound } from "next/navigation";
import { edlV1ViewOf, type TranscriptWord } from "@merai/core";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { EditorView } from "@/components/editor/editor-view";

export const dynamic = "force-dynamic";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  if (project.status !== "ready") {
    redirect({ href: `/dashboard/projects/${id}`, locale });
  }

  const [{ data: transcript }, { data: edlRow }, { data: upload }] =
    await Promise.all([
      supabase
        .from("transcripts")
        .select("words, language_code")
        .eq("project_id", id)
        .maybeSingle(),
      supabase
        .from("edl_versions")
        .select("id, edl, version")
        .eq("project_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("video_uploads")
        .select("storage_path, duration_seconds")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!transcript?.words || !edlRow?.edl || !upload) {
    redirect({ href: `/dashboard/projects/${id}`, locale });
  }

  // Version-aware ingestion (Build 5): v1 passes through, a v1-representable
  // v2 is downgraded for the single-track editor. A true multi-track EDL has
  // no editable view here yet — send the user back to the project page
  // rather than rendering a broken editor.
  const initialEdl = edlV1ViewOf(edlRow!.edl);
  if (!initialEdl) {
    redirect({ href: `/dashboard/projects/${id}`, locale });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <EditorView
        projectId={project.id}
        projectTitle={project.title}
        ownerId={user!.id}
        words={transcript!.words as TranscriptWord[]}
        languageCode={transcript!.language_code as string | null}
        initialEdl={initialEdl!}
        initialVersion={edlRow!.version as number}
        initialEdlVersionId={edlRow!.id as string}
        storagePath={upload!.storage_path as string}
        sourceDurationMs={Math.round(Number(upload!.duration_seconds ?? 0) * 1000)}
      />
    </div>
  );
}
