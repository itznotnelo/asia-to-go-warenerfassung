import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Shared page frame (v0.3.1 design pass). Every page uses the same left edge,
 * spacing scale and heading sizes, so switching tabs at the counter does not
 * make the content jump around:
 *   page gap 32px · section gap 12px · card padding 16px · row min 48px
 *   h1 24px/600 · h2 16px/600 · labels 14px muted
 * Plain module, no hooks: usable from server and client components.
 */

const WIDTHS = {
  /** Lists, overviews, workspaces: 1024px. */
  default: "max-w-5xl",
  /** Wide tables (Artikel): 1280px. */
  wide: "max-w-7xl",
} as const;

export function pageClass(width: keyof typeof WIDTHS = "default"): string {
  return cn("mx-auto flex w-full flex-col gap-8 px-6 pt-8 pb-16", WIDTHS[width]);
}

export function PageHeader({
  title,
  count,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Shown muted next to the title, e.g. the number of rows. */
  count?: number;
  description?: React.ReactNode;
  /** Right-aligned; at most one primary button per page. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 max-w-3xl flex-[1_1_28rem] flex-col gap-1.5">
        <h1 className="text-2xl font-semibold text-balance">
          {title}
          {count !== undefined && <span className="font-numeric ml-2 text-lg font-normal text-muted-foreground">{count}</span>}
        </h1>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({
  title,
  href,
  linkLabel = "Alle ansehen",
  tone,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  href?: string;
  linkLabel?: string;
  tone?: "error" | "warn";
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex min-h-8 items-end justify-between gap-3">
      <Tag
        className={cn(
          "text-base font-semibold text-balance",
          tone === "error" && "text-destructive",
          tone === "warn" && "text-primary",
        )}
      >
        {title}
      </Tag>
      {href && (
        <Link href={href} className="-my-2 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** Calm empty state: what is (not) there, and what to do next. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card px-5 py-6">
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-prose text-sm text-pretty text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Big value, small label. Values in the numeric font only when they are numbers. */
export function StatCard({
  label,
  value,
  hint,
  href,
  numeric = true,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  numeric?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-3xl font-semibold leading-tight", numeric ? "font-numeric" : "text-xl text-muted-foreground")}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const base = "flex min-h-28 flex-col justify-between gap-1 rounded-lg border border-border bg-card p-4";
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:border-foreground/25 hover:bg-muted/40")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

/** List in a card: rows separated by hairlines, 48px minimum height. */
export const listCardClass = "flex flex-col rounded-lg border border-border bg-card px-4";
export const listRowClass = "flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0";
