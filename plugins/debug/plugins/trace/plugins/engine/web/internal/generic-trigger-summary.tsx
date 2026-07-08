import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { TraceTriggerSummaryProps } from "../slots";

// Fallback trigger summary for a trigger kind with no registered richer view —
// the generic trigger facts. Phase 4 gives specific kinds (spans, op-time…)
// their own summaries; anything else keeps landing here.
export function GenericTriggerSummary({ trace }: TraceTriggerSummaryProps) {
  const { kind, label, durationMs, thresholdMs } = trace.trigger;
  return (
    <Stack gap="2xs">
      <Text variant="label">
        {kind} · {label}
      </Text>
      <Text variant="caption" tone="muted">
        {Math.round(durationMs)}ms (threshold {Math.round(thresholdMs)}ms) ·{" "}
        {trace.worktree}
      </Text>
    </Stack>
  );
}
