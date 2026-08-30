import type { ReactNode } from "react";
import {
  RUN_OUTCOMES,
  type RunOutcome,
} from "@plugins/runs/plugins/run-outcome/core";
import {
  Badge,
  type BadgeVariant,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";

/**
 * Single source of truth for run-outcome display metadata — the shape
 * `BUILD_STATUS_META` established, for the vocabulary every kind shares.
 *
 * Colour carries one distinction and one only: `failed` is destructive because
 * it is the one outcome someone must act on. `partial` is a warning — it needs
 * a look, not a fix. `canceled` is muted: nothing went wrong, the run simply
 * stopped being the answer.
 */
export const RUN_OUTCOME_META: Record<
  RunOutcome,
  { label: string; badgeVariant: BadgeVariant; dotColorClass: string }
> = {
  running: {
    label: "Running",
    badgeVariant: "warning",
    dotColorClass: "bg-warning animate-pulse",
  },
  succeeded: {
    label: "Succeeded",
    badgeVariant: "success",
    dotColorClass: "bg-success",
  },
  partial: {
    label: "Partial",
    badgeVariant: "warning",
    dotColorClass: "bg-warning",
  },
  failed: {
    label: "Failed",
    badgeVariant: "destructive",
    dotColorClass: "bg-destructive",
  },
  canceled: {
    label: "Canceled",
    badgeVariant: "muted",
    dotColorClass: "bg-muted-foreground/60",
  },
};

/**
 * The filter / group-by option list. Derived from the vocabulary rather than
 * hand-written, and derived from the *vocabulary* rather than from loaded rows:
 * the rows are a server-paginated window, so deriving would offer only the
 * outcomes that happen to be on screen.
 */
export const RUN_OUTCOME_OPTIONS: { value: RunOutcome; label: string }[] =
  RUN_OUTCOMES.map((value) => ({
    value,
    label: RUN_OUTCOME_META[value].label,
  }));

/** The outcome as a dot alone, for a row that carries its own label. */
export function RunOutcomeDot({ outcome }: { outcome: RunOutcome }): ReactNode {
  return <StatusDot colorClass={RUN_OUTCOME_META[outcome].dotColorClass} />;
}

/** Dot + label, for a list row or a table cell. */
export function RunOutcomeChip({
  outcome,
}: {
  outcome: RunOutcome;
}): ReactNode {
  return (
    <Inline gap="xs">
      <StatusDot colorClass={RUN_OUTCOME_META[outcome].dotColorClass} />
      {RUN_OUTCOME_META[outcome].label}
    </Inline>
  );
}

/** The full coloured badge, for a detail surface or an emphasised row. */
export function RunOutcomeBadge({
  outcome,
}: {
  outcome: RunOutcome;
}): ReactNode {
  const meta = RUN_OUTCOME_META[outcome];
  return (
    <Badge
      variant={meta.badgeVariant}
      icon={<StatusDot colorClass={meta.dotColorClass} />}
    >
      {meta.label}
    </Badge>
  );
}
