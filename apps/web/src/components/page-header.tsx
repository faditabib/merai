import { Link } from "@/i18n/navigation";

export interface PageHeaderProps {
  /** Breadcrumb trail, shallowest first; current page is `title`. */
  crumbs: Array<{ label: string; href: string }>;
  title: string;
  subtitle?: string;
}

/**
 * Shared page chrome (UX sprint 2026-07-17): every inner page answers
 * "where am I / how do I get back" the same way — a breadcrumb trail, the
 * page title, and an optional one-line subtitle. Replaces the hand-rolled
 * "← back" links that each page grew independently.
 */
export function PageHeader(props: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {props.crumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <Link href={crumb.href} className="transition hover:text-accent">
              {crumb.label}
            </Link>
            <span aria-hidden>‹</span>
          </span>
        ))}
        <span aria-current="page" className="text-foreground">
          {props.title}
        </span>
      </nav>
      <h1 className="text-2xl font-bold">{props.title}</h1>
      {props.subtitle && <p className="text-muted">{props.subtitle}</p>}
    </div>
  );
}
