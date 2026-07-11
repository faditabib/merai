import { getFormatter, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { OnboardingCallout, WorkflowSteps } from "@/components/onboarding-callout";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-600",
  error: "bg-red-500/15 text-red-500",
  draft: "bg-border/40 text-muted",
};

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
  const format = await getFormatter();
  // Greeting: display name, else the mailbox part of the email — a raw
  // address reads developer-ish on an otherwise warm dashboard (QA #5).
  const name =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "";

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false });

  // First-time onboarding: per-user flag in auth metadata (Build 6A) — the
  // user object is already loaded, so this costs zero extra queries. The
  // empty state tells the workflow story itself, so the callout only adds
  // value once projects exist.
  const showOnboarding =
    !user?.user_metadata?.onboarding_dismissed_at &&
    (projects?.length ?? 0) > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="flex flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-muted">{t("greeting", { name })}</p>
          </div>
          <Link
            href="/dashboard/new"
            className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90"
          >
            {t("newProject")}
          </Link>
        </div>

        {showOnboarding && <OnboardingCallout />}

        {projects && projects.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-accent"
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{project.title}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {format.dateTime(new Date(project.created_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm ${
                      STATUS_STYLES[project.status] ??
                      "animate-pulse bg-accent/15 text-accent"
                    }`}
                  >
                    {t(`statuses.${project.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border p-8 text-center sm:p-12">
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-xl font-bold">{t("emptyTitle")}</h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                {t("emptyBody")}
              </p>
              <Link
                href="/dashboard/new"
                className="mt-1 rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90"
              >
                {t("newProject")}
              </Link>
            </div>
            {/* The workflow story doubles as the empty state (Build 6A). */}
            <div className="w-full max-w-3xl border-t border-border pt-6 text-start">
              <WorkflowSteps />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
