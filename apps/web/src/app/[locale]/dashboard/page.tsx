import { getTranslations } from "next-intl/server";
import { CREATOR_STYLE_IDS } from "@merai/core";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { OnboardingCallout, WorkflowSteps } from "@/components/onboarding-callout";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ProjectCard } from "@/components/dashboard/project-card";
import { BrandSetupNudge } from "@/components/dashboard/brand-setup-nudge";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const t = await getTranslations("dashboard");
  const tc = await getTranslations("creatorStyles");
  // Greeting: display name, else the mailbox part of the email.
  const name =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "";

  // "Your style" chip — only when the creator has explicitly applied one.
  const styleId = user?.user_metadata?.creator_style as string | undefined;
  const validStyleId =
    styleId && (CREATOR_STYLE_IDS as readonly string[]).includes(styleId)
      ? styleId
      : null;

  // Two bounded reads alongside projects: the Brand Kit (for the setup nudge)
  // and the latest ready upload per project (for client thumbnails). Deduped
  // in JS — no N+1, no SQL group tricks, no schema change.
  const [{ data: projects }, { data: kit }, { data: uploads }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("brand_kits")
      .select("logo_path, caption_default_config")
      .eq("owner_id", user!.id)
      .maybeSingle(),
    supabase
      .from("video_uploads")
      .select("project_id, storage_path, created_at")
      .eq("status", "uploaded")
      .order("created_at", { ascending: false }),
  ]);

  const latestUpload = new Map<string, string>();
  for (const u of (uploads as { project_id: string; storage_path: string }[] | null) ?? []) {
    if (!latestUpload.has(u.project_id)) latestUpload.set(u.project_id, u.storage_path);
  }

  const rows = (projects as ProjectRow[] | null) ?? [];
  const hasProjects = rows.length > 0;
  // Incomplete = no kit, or neither a logo nor a crafted caption default.
  const brandIncomplete = !kit || (!kit.logo_path && !kit.caption_default_config);

  const showOnboarding =
    !user?.user_metadata?.onboarding_dismissed_at && hasProjects;
  // 6C.4: suggest the setup wizard until it's completed (or skipped).
  const wizardPending = !user?.user_metadata?.onboarding_completed_at;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="flex flex-1 flex-col gap-8 px-6 py-10">
        {/* Hero + quick actions */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t("greeting", { name })}</h1>
              <p className="mt-1 text-muted">{t("heroSubtitle")}</p>
            </div>
            {validStyleId && (
              <Link
                href="/dashboard/brand-kit"
                className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent"
              >
                {tc("yourStyle", { name: tc(`names.${validStyleId}`) })}
              </Link>
            )}
          </div>
          <QuickActions />
        </div>

        {/* 6C.4: one-tap studio setup — shown until completed or skipped. */}
        {wizardPending && hasProjects && (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5">
            <div>
              <h2 className="font-bold">{t("wizardBanner.title")}</h2>
              <p className="mt-0.5 text-sm text-muted">{t("wizardBanner.body")}</p>
            </div>
            <Link
              href="/dashboard/onboarding"
              className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
            >
              {t("wizardBanner.cta")}
            </Link>
          </section>
        )}
        {brandIncomplete && !wizardPending && <BrandSetupNudge />}
        {showOnboarding && <OnboardingCallout />}

        {hasProjects ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("recentTitle")}</h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((project) => (
                <li key={project.id}>
                  <ProjectCard
                    id={project.id}
                    title={project.title}
                    status={project.status}
                    createdAt={project.created_at}
                    storagePath={latestUpload.get(project.id) ?? null}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border p-8 text-center sm:p-12">
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-xl font-bold">{t("emptyTitle")}</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                {t("emptyBody")}
              </p>
              {/* 6C.4: new creators are guided through setup first. */}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
                {wizardPending && (
                  <Link
                    href="/dashboard/onboarding"
                    className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90"
                  >
                    {t("wizardBanner.cta")}
                  </Link>
                )}
                <Link
                  href="/dashboard/new"
                  className={
                    wizardPending
                      ? "rounded-xl border border-border px-6 py-2.5 font-semibold transition hover:border-accent hover:text-accent"
                      : "rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90"
                  }
                >
                  {t("newProject")}
                </Link>
              </div>
            </div>
            <div className="w-full max-w-3xl border-t border-border pt-6 text-start">
              <WorkflowSteps />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
