import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text, SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { TraceLaneProps } from "../slots";

// Fallback lane for a snapshot section whose class has no registered web lane —
// so a NEW event class is visible by default (loud), never silently missing. It
// dumps the validated payload as raw JSON. Phase 4 gives the built-in classes
// real Gantt lanes; anything unregistered keeps landing here.
export function GenericEventLane({ classId, payload }: TraceLaneProps) {
  return (
    <Stack gap="2xs">
      <SectionLabel>{classId}</SectionLabel>
      <Text as="pre" variant="caption" tone="muted">
        {JSON.stringify(payload, null, 2)}
      </Text>
    </Stack>
  );
}
