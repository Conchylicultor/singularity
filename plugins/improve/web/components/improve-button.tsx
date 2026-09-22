import {
  Button,
  ButtonGroup,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { Fragment, useSyncExternalStore } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import {
  getImproveOpenState,
  setImproveOpen,
  subscribeImproveOpen,
} from "../internal/open-store";
import { IMPROVEMENTS_CATEGORY_ID } from "../../core";
import { ImproveSlots } from "../slots";

/**
 * The Improve pill: the Improve button (opening the draft popover) joined with
 * every contributed `ImproveSlots.Segment` — companion actions that feed the
 * same draft, such as picking a UI element — as one split capsule. Only the
 * Improve label is in the text colour; the companions keep the bar's quieter
 * tone, like its other icons, and brighten on hover.
 */
export function ImproveButton() {
  const { open, insert } = useSyncExternalStore(
    subscribeImproveOpen,
    getImproveOpenState,
  );
  const segments = ImproveSlots.Segment.useContributions();

  return (
    <ButtonGroup shape="pill">
      <TaskDraftPopover
        open={open}
        onOpenChange={setImproveOpen}
        trigger={
          <Button variant="frame" className="text-foreground">
            <MdAutoAwesome />
            Improve
          </Button>
        }
        tooltip="Improve"
        target={{ kind: "category", categoryId: IMPROVEMENTS_CATEGORY_ID }}
        insert={insert}
        heading="Improve this app"
      />
      {segments.map((segment) => (
        <Fragment key={segment.id}>
          {renderIsolated(
            ImproveSlots.Segment,
            segment as unknown as Contribution,
            {},
          )}
        </Fragment>
      ))}
    </ButtonGroup>
  );
}
