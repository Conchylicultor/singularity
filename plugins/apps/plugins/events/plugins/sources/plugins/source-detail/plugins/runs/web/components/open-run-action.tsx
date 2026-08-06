import type { ReactElement } from "react";
import { MdOpenInNew } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import type { EventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { eventSourceRunPane } from "../panes";

/**
 * Drill into one run.
 *
 * The row's trailing region holds shortcuts, not content: what explains a run —
 * a full error, the counts, and whatever a source type recorded for it — does
 * not fit a ledger row, so the row navigates to the run's own pane instead of
 * growing. Same call `deploy/deployments` makes for a deployment.
 */
export function OpenRunAction({
  row,
}: ItemActionProps<EventSourceRun>): ReactElement {
  const openPane = useOpenPane();

  return (
    <RowActionButton
      icon={MdOpenInNew}
      label="Open run"
      onClick={(e) => {
        // The row itself is not a navigation target, but the DataView row may
        // grow one — stop the click here so the action means only itself.
        e.stopPropagation();
        openPane(
          eventSourceRunPane,
          { runId: row.id },
          { mode: "push", side: "right" },
        );
      }}
    />
  );
}
