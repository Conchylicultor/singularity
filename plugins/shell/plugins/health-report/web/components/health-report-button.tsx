import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import {
  mergeHealth,
  verdictOf,
  type HealthMerge,
  type ReportedStatus,
} from "../../core";
import { HealthReport } from "../slots";
import { HealthStore } from "../internal/store";
import { BUTTON_TINT_CLASS } from "../internal/tone";
import { HealthDot } from "./health-dot";
import { HealthReportPanel } from "./health-report-panel";
import { StatusProbes } from "./status-probes";

interface DotView extends HealthMerge {
  verdict: string;
}

function sameView(a: DotView, b: DotView): boolean {
  return (
    a.state === b.state &&
    a.count === b.count &&
    a.transitioning === b.transitioning &&
    a.pending === b.pending &&
    a.verdict === b.verdict
  );
}

/**
 * The dot itself, and the popover it opens.
 *
 * Reads the merge through a selector, so the button re-renders only when what
 * it shows changes — not on every status a probe republishes.
 */
function HealthReportTrigger() {
  const rows = HealthReport.Row.useContributions();
  const ids = rows.flatMap((row) => (row.kind === "status" ? [row.id] : []));
  const idsKey = ids.join("\n");
  const view = HealthStore.useSelector(
    (state): DotView => {
      const statuses: ReportedStatus[] = ids.map((id) => state[id]);
      return { ...mergeHealth(statuses), verdict: verdictOf(statuses) };
    },
    [idsKey],
    sameView,
  );

  // Narrowed here, once: the tint map is keyed only by the two states that
  // need a look, and `needsLook` below is just its presence.
  const tint =
    view.state === "attention" || view.state === "critical"
      ? BUTTON_TINT_CLASS[view.state]
      : undefined;
  const needsLook = tint !== undefined;

  return (
    <InlinePopover
      align="end"
      width="2xl"
      padding="none"
      tooltip={view.verdict}
      trigger={
        <Button
          variant="ghost"
          shape="pill"
          aspect={needsLook ? "text" : "icon"}
          aria-label={view.verdict}
          data-health={view.state}
          className={tint}
        >
          <ControlSizeProvider size="md">
            <HealthDot
              level={view.state}
              pulsing={view.pending || view.transitioning}
            />
          </ControlSizeProvider>
          {needsLook ? (
            <span className="font-semibold tabular-nums">{view.count}</span>
          ) : null}
        </Button>
      }
    >
      <HealthReportPanel />
    </InlinePopover>
  );
}

/**
 * The health report's button: one dot merging every `HealthReport.Row`.
 *
 * - all ok → a green dot, nothing else;
 * - some rows need a look → an amber / red dot plus how many, on a tinted pill;
 * - not known yet → a grey dot, pulsing, until every row has reported;
 * - the dot also pulses while a row is transitioning (reconnecting).
 *
 * Clicking opens the report. The button owns its own status store and mounts
 * one probe per status row, so the dot is coloured whether or not the report is
 * open — mount exactly one of these per page. Its density is the ambient
 * `ControlSize` of wherever it is placed.
 */
export function HealthReportButton() {
  return (
    <HealthStore.Provider>
      <StatusProbes />
      <HealthReportTrigger />
    </HealthStore.Provider>
  );
}
