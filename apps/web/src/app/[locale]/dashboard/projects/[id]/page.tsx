import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import {
  ProjectStatusView,
  type ProjectSnapshot,
  type TranscriptSnapshot,
} from "@/components/project-status-view";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
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

  // RLS scopes to owner — a foreign id simply returns no row.
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("status, text, words, language_code, provider, error")
    .eq("project_id", project.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <h1 className="truncate text-2xl font-bold">{project.title}</h1>
        <ProjectStatusView
          initialProject={project as ProjectSnapshot}
          initialTranscript={(transcript as TranscriptSnapshot | null) ?? null}
        />
      </main>
    </div>
  );
}
