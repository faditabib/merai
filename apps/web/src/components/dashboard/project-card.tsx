import { getFormatter, getTranslations } from "next-intl/server";
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
}

/**
 * A premium project card (Build 6C.1): poster thumbnail + title + status + a
 * contextual action (Edit when ready, Retry when errored). The whole card links
 * to the project; the action is a nested affordance.
 */
export async function ProjectCard(props: ProjectCardProps) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const ready = props.status === "ready";

  return (
    <Link
      href={`/dashboard/projects/${props.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-accent"
    >
      <ProjectThumbnail
        storagePath={ready ? props.storagePath : null}
        seed={props.title}
        className="aspect-video w-full"
      />
      <div className="flex items-center gap-2 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{props.title}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {format.dateTime(new Date(props.createdAt), {
              dateStyle: "medium",
            })}
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
    </Link>
  );
}
