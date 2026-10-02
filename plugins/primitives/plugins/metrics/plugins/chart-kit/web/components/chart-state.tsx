import type { ReactNode } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

/** What a chart shows in place of its plot. */
export type ChartStateProps = {
  /** The height the chart would have, so the layout does not jump. */
  height: number;
} & (
  | { state: "loading" }
  | { state: "empty"; message?: string }
  | { state: "error"; message: string; onRetry?: () => void }
);

/**
 * Loading, empty or error, at the chart's own height. Not-known-yet is its own
 * state: a loading chart never draws an empty plot that would claim "no data".
 */
export function ChartState(props: ChartStateProps): ReactNode {
  return (
    <Center
      className="w-full"
      style={{ height: props.height }}
      data-chart-state={props.state}
    >
      {props.state === "loading" && <Loading />}
      {props.state === "empty" && (
        <Text variant="caption" tone="muted">
          {props.message ?? "No data in this range"}
        </Text>
      )}
      {props.state === "error" && (
        <Stack gap="xs" align="center" role="alert">
          <Text variant="caption" tone="destructive">
            {props.message}
          </Text>
          {props.onRetry && (
            <Button variant="outline" onClick={props.onRetry}>
              Retry
            </Button>
          )}
        </Stack>
      )}
    </Center>
  );
}
