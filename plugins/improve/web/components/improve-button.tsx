import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useSyncExternalStore } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { getImproveOpenState, setImproveOpen, subscribeImproveOpen } from "../internal/open-store";
import { IMPROVEMENTS_CATEGORY_ID } from "../../shared/constants";

export function ImproveButton() {
  const { open, text } = useSyncExternalStore(subscribeImproveOpen, getImproveOpenState);

  return (
    <TaskDraftPopover
      open={open}
      onOpenChange={setImproveOpen}
      trigger={
        <Button variant="outline">
          <MdAutoAwesome />
          Improve
        </Button>
      }
      tooltip="Improve"
      target={{ kind: "category", categoryId: IMPROVEMENTS_CATEGORY_ID }}
      captures={["url", "screenshot"]}
      initialText={text}
      heading="Improve this app"
    />
  );
}
