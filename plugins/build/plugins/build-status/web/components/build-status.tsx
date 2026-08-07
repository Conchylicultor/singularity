import {
  buildStatusOf,
  killedSignalName,
  type BuildRunOutcome,
  type BuildStatus,
} from "@plugins/build/plugins/build-status/core";
import { Badge, type BadgeVariant } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";

/**
 * Single source of truth for build-run status display metadata.
 *
 * Colour carries the one distinction that matters: `failed` is destructive
 * because it is the only status a human must act on. `superseded`,
 * `interrupted` and `killed` are muted — none of them is a code defect, so none
 * of them should draw the eye the way a real failure must.
 *
 * Declaration order is the order the filter dropdown offers
 * (`BUILD_STATUS_OPTIONS` is derived from it, never hand-written).
 */
export const BUILD_STATUS_META: Record<
  BuildStatus,
  { label: string; badgeVariant: BadgeVariant; dotColorClass: string }
> = {
  running: {
    label: "Running",
    badgeVariant: "warning",
    dotColorClass: "bg-warning animate-pulse",
  },
  success: { label: "Success", badgeVariant: "success", dotColorClass: "bg-success" },
  failed: { label: "Failed", badgeVariant: "destructive", dotColorClass: "bg-destructive" },
  superseded: {
    label: "Superseded",
    badgeVariant: "muted",
    dotColorClass: "bg-muted-foreground/60",
  },
  interrupted: {
    label: "Interrupted",
    badgeVariant: "muted",
    dotColorClass: "bg-muted-foreground/60",
  },
  killed: {
    label: "Killed externally",
    badgeVariant: "muted",
    dotColorClass: "bg-muted-foreground/60",
  },
};

export const BUILD_STATUS_OPTIONS: { value: BuildStatus; label: string }[] = (
  Object.entries(BUILD_STATUS_META) as [BuildStatus, { label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }));

/**
 * The one fact that separates runs sharing a status, appended to the label: the
 * exit code for a failure, the signal for an external kill. Total — a status
 * with nothing to add renders as its bare label, never as an empty badge.
 */
function buildStatusText(run: BuildRunOutcome, status: BuildStatus): string {
  const { label } = BUILD_STATUS_META[status];
  if (run.exitCode === null) return label;
  if (status === "failed") return `${label} (exit ${run.exitCode})`;
  if (status === "killed") return `${label} (${killedSignalName(run.exitCode)})`;
  return label;
}

/** The run's status as a dot alone, for list rows that carry their own label. */
export function BuildStatusDot({ run }: { run: BuildRunOutcome }) {
  return <StatusDot colorClass={BUILD_STATUS_META[buildStatusOf(run)].dotColorClass} />;
}

/** Dot + label, for a row or a table cell. */
export function BuildStatusChip({ run }: { run: BuildRunOutcome }) {
  const status = buildStatusOf(run);
  return (
    <Inline gap="xs">
      <StatusDot colorClass={BUILD_STATUS_META[status].dotColorClass} />
      {BUILD_STATUS_META[status].label}
    </Inline>
  );
}

/** The full badge for a detail surface: colour, label, and the run's own detail. */
export function BuildStatusBadge({ run }: { run: BuildRunOutcome }) {
  const status = buildStatusOf(run);
  const meta = BUILD_STATUS_META[status];
  return (
    <Badge variant={meta.badgeVariant} icon={<StatusDot colorClass={meta.dotColorClass} />}>
      {buildStatusText(run, status)}
    </Badge>
  );
}
