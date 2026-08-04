import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type ReactElement } from "react";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { LiveLogChannel } from "@plugins/primitives/plugins/log-channels/web";
import {
  RELEASE_LOG_CHANNEL,
  releaseLogsEndpoint,
  releaseRunResource,
  type ReleaseLogLine,
} from "@plugins/release/core";

// Mono log body: intentional fixed code size + line-height (not on the typography scale).
const monoLogClass = "font-mono text-xs leading-5";

export function ReleaseLogSection({ runId }: { runId: string }): ReactElement {
  const result = useResource(releaseRunResource, { id: runId });

  // Live runs stream over `/ws/logs`; finished runs read the persisted fallback.
  // While the resource is still pending we optimistically show the live stream
  // (gate on `.pending` with an early return rather than collapsing it into a
  // fake-empty default — keeps "loading" distinct from "genuinely finished").
  if (result.pending) return <LiveLogs />;
  const run = result.data;
  if (run?.status === "running") return <LiveLogs />;
  return <PersistedLogs runId={runId} />;
}

/**
 * The live half is the shared `LiveLogChannel` primitive. The WS subscribe, the
 * sequence de-dup, the sticky scroll and the copy button used to be a local copy
 * of the body the deploy panel and the debug viewer carry too.
 */
function LiveLogs(): ReactElement {
  return (
    <LiveLogChannel
      channel={RELEASE_LOG_CHANNEL}
      label="Logs"
      emptyState="No release logs yet"
      onError={(error) =>
        toast({
          type: "release",
          title: "Release log error",
          description: error,
          variant: "error",
        })
      }
    />
  );
}

function PersistedLogs({ runId }: { runId: string }): ReactElement {
  const { data } = useEndpoint(releaseLogsEndpoint, { id: runId });
  const lines = useMemo<ReleaseLogLine[]>(() => data?.lines ?? [], [data]);

  return (
    <Stack gap="xs">
      <Line className="pb-xs">
        <Fill>
          <Text as="span" variant="label" className="text-muted-foreground">
            Logs
          </Text>
        </Fill>
        <ControlSizeProvider size="xs">
          <CopyButton
            text={lines.map((l) => l.text).join("\n")}
            title="Copy logs"
          />
        </ControlSizeProvider>
      </Line>
      <Scroll axis="y" className={`min-h-48 max-h-96 rounded-md border bg-muted/30 px-md py-sm ${monoLogClass}`}>
        {lines.length === 0 && <span className="text-muted-foreground">No release logs</span>}
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              line.stream === "stderr" ? "text-destructive" : "text-foreground",
            )}
          >
            {line.text}
          </div>
        ))}
      </Scroll>
    </Stack>
  );
}
