import { notFound } from "next/navigation";
import {
  brandKitRowSchema,
  edlV1ViewOf,
  type BrandExportConfig,
  type TranscriptWord,
} from "@merai/core";
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

  const [{ data: transcript }, { data: edlRow }, { data: upload }, { data: kitRow }] =
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
      supabase
        .from("brand_kits")
        .select(
          "id, owner_id, name, logo_path, primary_color, secondary_color, accent_color, caption_style_default, overlay_default, lower_third_default",
        )
        .eq("owner_id", user!.id)
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

  // Compile the owner's Brand Kit into an export snapshot (gradient +
  // lower third). A layer is included only when configured; when neither
  // is, brandConfig is null and the export panel shows the "set up" prompt.
  let brandConfig: BrandExportConfig | null = null;
  if (kitRow) {
    const parsedKit = brandKitRowSchema.safeParse(kitRow);
    if (parsedKit.success) {
      const kit = parsedKit.data;
      const config: BrandExportConfig = {};
      if (kit.overlay_default) config.gradient = kit.overlay_default;
      if (kit.lower_third_default?.name.trim()) {
        config.lowerThird = {
          ...kit.lower_third_default,
          name: kit.lower_third_default.name.trim(),
        };
      }
      if (config.gradient || config.lowerThird) brandConfig = config;
    }
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
        brandConfig={brandConfig}
      />
    </div>
  );
}
