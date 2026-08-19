import type { ReactElement } from "react";
import { MdPauseCircleOutline, MdPlayCircleOutline } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useUpdateEventSource } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * Enable / disable a source from the list row.
 *
 * Unconfirmed, unlike its neighbour delete: this destroys nothing and the very
 * same button puts it back, so a dialog would be pure friction in front of a
 * decision the user can reverse by clicking again.
 *
 * What "disabled" MEANS is now three things, not one:
 *
 * - the scheduler never picks the source up (no cadence tick reaches it);
 * - "Refresh now" refuses it, and a "Refresh all" never even asks;
 * - its events drop out of the events list.
 *
 * That last one is the reason this action is worth a row button. It is a
 * *query-time default* in `event-list`, NOT a delete — every event the source
 * ever collected stays in the table untouched, and re-enabling brings all of
 * them straight back. So this is the one-click "stop caring about this source"
 * switch: the venue that went quiet stops filling the list, and nothing is lost
 * if it starts up again.
 */
export function SourceToggleAction({
  row,
}: ItemActionProps<EventSource>): ReactElement {
  const update = useUpdateEventSource();

  return (
    <IconButton
      icon={row.enabled ? MdPauseCircleOutline : MdPlayCircleOutline}
      label={row.enabled ? "Disable source" : "Enable source"}
      onClick={(e) => {
        // The row itself is a click target (it opens the source pane), so an
        // action button must stop the click here, or every toggle also
        // navigates.
        e.stopPropagation();
        update.mutate({
          params: { id: row.id },
          body: { enabled: !row.enabled },
        });
      }}
    />
  );
}
