import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { mergeHealth, sortRows, verdictOf } from "../../core";
import { HealthReport } from "../slots";
import { HealthStore } from "../internal/store";
import { HealthDot } from "./health-dot";
import { InfoRowView, StatusRowView } from "./health-row";

/**
 * The report: a header with the merged dot and the verdict, then every row —
 * info rows first, then status rows worst-first, ties by `order`. No footer:
 * a row that has a pane to point at does so through its own `actions`, so the
 * report never names a contributor.
 *
 * Mounted only while the popover is open, which is what keeps an info row's
 * `useInfo` from running while nobody is looking.
 */
export function HealthReportPanel() {
  const rows = HealthReport.Row.useContributions();
  const statuses = HealthStore.useStore();
  const statusList = rows.flatMap((row) =>
    row.kind === "status" ? [statuses[row.id]] : [],
  );
  const merged = mergeHealth(statusList);
  const verdict = verdictOf(statusList);
  const sorted = sortRows(rows, (row) =>
    row.kind === "status" ? statuses[row.id] : undefined,
  );

  return (
    <>
      <Line className="gap-sm border-b px-md py-sm">
        <ControlSizeProvider size="lg">
          <HealthDot
            level={merged.state}
            pulsing={merged.pending || merged.transitioning}
          />
        </ControlSizeProvider>
        <Fill>
          <Text variant="label" className="font-semibold" title={verdict}>
            {verdict}
          </Text>
        </Fill>
      </Line>
      {sorted.length > 0 ? (
        <Stack gap="2xs" className="p-xs">
          {/* Not a DataView: these are the report's own rows — slot
              contributions, a handful at most — in an order the report
              decides, inside a transient popover. Each row has its own
              boundary so one crashing contributor leaves the rest readable. */}
          {sorted.map((row) => (
            <PluginErrorBoundary
              key={row.id}
              slot={HealthReport.Row.id}
              label={row._pluginId ?? row.id}
            >
              {row.kind === "status" ? (
                <StatusRowView row={row} status={statuses[row.id]} />
              ) : (
                <InfoRowView row={row} useInfo={row.useInfo} />
              )}
            </PluginErrorBoundary>
          ))}
        </Stack>
      ) : null}
    </>
  );
}
