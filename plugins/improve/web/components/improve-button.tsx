import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { Improve } from "../commands";
import { IMPROVEMENTS_META_TASK_ID } from "../../shared/constants";

export function ImproveButton() {
  const [open, setOpen] = useState(false);
  const [initialText, setInitialText] = useState("");

  Improve.OpenWithText.useHandler(({ text }) => {
    setInitialText(text);
    setOpen(true);
  });

  return (
    <TaskDraftPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInitialText("");
      }}
      trigger={
        <Button variant="outline">
          <MdAutoAwesome />
          Improve
        </Button>
      }
      tooltip="Improve"
      target={{ kind: "metaTask", metaTaskId: IMPROVEMENTS_META_TASK_ID }}
      captures={["url", "screenshot"]}
      initialText={initialText}
      heading="Improve this app"
    />
  );
}
