import { useState, type ReactNode } from "react";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  useRefreshEventSourceNow,
  useUpdateEventSource,
} from "@plugins/apps/plugins/events/plugins/events-core/web";
import {
  REFRESH_CADENCES,
  type RefreshCadence,
  type RefreshSourceResult,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  CADENCE_LABEL,
  useEventSource,
} from "@plugins/apps/plugins/events/plugins/sources/web";

const CADENCE_SEGMENTS = REFRESH_CADENCES.map((id) => ({
  id,
  label: CADENCE_LABEL[id],
}));

const ENABLED_SEGMENTS = [
  { id: "on" as const, label: "Enabled" },
  { id: "off" as const, label: "Disabled" },
];

/**
 * Render one `RefreshSourceResult` arm. Exhaustive by construction — a new arm
 * in `events-core`'s union is a tsc error here, never a silently blank line.
 *
 * Every arm is rendered, including `already-running` and `skipped`: a resolved
 * promise is NOT success in this API, and collapsing the arms into "done" is
 * exactly the bug the discriminated result exists to prevent.
 */
function describeRefresh(result: RefreshSourceResult): {
  tone: "muted" | "destructive";
  text: string;
} {
  switch (result.status) {
    case "enqueued":
      return { tone: "muted", text: "Refresh enqueued — the run starts shortly." };
    case "already-running":
      return {
        tone: "muted",
        text: "A run is already in flight; this request joined it.",
      };
    case "skipped":
      return { tone: "destructive", text: result.message };
  }
}

export function SourceScheduleSection({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const lookup = useEventSource(sourceId);
  const update = useUpdateEventSource();
  const refresh = useRefreshEventSourceNow();
  const [outcome, setOutcome] = useState<RefreshSourceResult | null>(null);

  if (lookup.status === "pending") return <Loading variant="rows" />;
  if (lookup.status === "error") {
    return <Placeholder tone="error">{lookup.error.message}</Placeholder>;
  }
  if (lookup.status === "missing") {
    return <Placeholder>This source no longer exists.</Placeholder>;
  }

  const source = lookup.source;
  const described = outcome ? describeRefresh(outcome) : null;

  const runNow = (): void => {
    setOutcome(null);
    refresh.mutate(
      { params: { id: sourceId } },
      { onSuccess: (result) => setOutcome(result) },
    );
  };

  const setCadence = (cadence: RefreshCadence): void => {
    update.mutate({ params: { id: sourceId }, body: { refresh: cadence } });
  };

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text as="label" variant="label">
          Cadence
        </Text>
        <SegmentedControl
          options={CADENCE_SEGMENTS}
          value={source.refresh}
          onChange={setCadence}
        />
        <Text as="p" variant="caption" tone="muted">
          {source.refresh === "manual"
            ? "The scheduler never picks this source up — it runs only when you refresh it."
            : "The scheduler runs on the main instance only, so a worktree never re-fetches on its own."}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text as="label" variant="label">
          Scheduling
        </Text>
        <SegmentedControl
          options={ENABLED_SEGMENTS}
          value={source.enabled ? "on" : "off"}
          onChange={(id) => {
            update.mutate({
              params: { id: sourceId },
              body: { enabled: id === "on" },
            });
          }}
        />
      </Stack>

      <Line className="gap-sm">
        <Button
          variant="secondary"
          disabled={refresh.isPending}
          onClick={runNow}
        >
          {refresh.isPending ? "Refreshing…" : "Refresh now"}
        </Button>
        <Fill>
          {described && (
            <Text variant="caption" tone={described.tone}>
              {described.text}
            </Text>
          )}
        </Fill>
      </Line>

      {refresh.error && (
        <Text as="p" variant="caption" tone="destructive">
          {getEndpointErrorMessage(refresh.error)}
        </Text>
      )}
      {update.error && (
        <Text as="p" variant="caption" tone="destructive">
          {getEndpointErrorMessage(update.error)}
        </Text>
      )}
    </Stack>
  );
}
