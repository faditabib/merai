import { getFormatter, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";

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
  const name = user?.user_metadata?.display_name ?? user?.email ?? "";

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, created_at")
    .order("created_at", { ascending: false });

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
          <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
            <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              {t("emptyBody")}
            </p>
            <Link
              href="/dashboard/new"
              className="mt-3 rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90"
            >
              {t("newProject")}
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
