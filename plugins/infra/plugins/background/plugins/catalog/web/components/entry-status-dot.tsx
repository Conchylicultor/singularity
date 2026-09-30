import type { ReactElement } from "react";
import {
  StatusDot,
  type StatusDotPaint,
} from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { RUN_OUTCOME_META } from "@plugins/runs/plugins/run-outcome/web";
import type { EntryStatus } from "../internal/present";

// The run outcomes share the one run vocabulary's colours, so a failed job here
// is the same red as a failed build. "Not run yet" is a solid neutral dot (it
// is declared and will run); what does not run here at all (on main, disabled)
// is an outline — "nothing to report" beside the filled dots of what did run.
// The neutrals are full-strength muted-foreground: at a fraction of it the dot
// vanished against the row.
const PAINT: Record<EntryStatus, StatusDotPaint> = {
  running: { colorClass: RUN_OUTCOME_META.running.dotColorClass },
  succeeded: { colorClass: RUN_OUTCOME_META.succeeded.dotColorClass },
  failed: { colorClass: RUN_OUTCOME_META.failed.dotColorClass },
  suspended: { colorClass: RUN_OUTCOME_META.canceled.dotColorClass },
  never: { colorClass: "bg-muted-foreground/70" },
  elsewhere: { ringClass: "border-muted-foreground" },
  disabled: { ringClass: "border-muted-foreground" },
};

/**
 * A status dot at a fixed, legible size (the `md` density tier, 8px) whatever
 * density the host row runs at — it is the row's one at-a-glance signal.
 */
export function EntryStatusDot({
  status,
}: {
  status: EntryStatus;
}): ReactElement {
  return (
    <ControlSizeProvider size="md">
      <StatusDot {...PAINT[status]} />
    </ControlSizeProvider>
  );
}
