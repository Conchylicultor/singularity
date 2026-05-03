import { useState } from "react";
import { MdAdd } from "react-icons/md";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { buttonVariants } from "@/components/ui/button";
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
        <>
          <MdAdd className="size-4" />
          Improve
        </>
      }
      triggerClassName={buttonVariants({ variant: "outline", size: "sm" })}
      target={{ kind: "metaTask", metaTaskId: IMPROVEMENTS_META_TASK_ID }}
      captures={["url", "screenshot"]}
      initialText={initialText}
      heading="Improve this app"
    />
  );
}
