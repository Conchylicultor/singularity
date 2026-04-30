import { useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  TaskDraftPopover,
  type PrefilledAttachment,
} from "@plugins/primitives/plugins/task-draft-form/web";
import { buttonVariants } from "@/components/ui/button";
import { Improve } from "../commands";
import { IMPROVEMENTS_META_TASK_ID } from "../../shared/constants";

export function ImproveButton() {
  const [open, setOpen] = useState(false);
  const [prefilled, setPrefilled] = useState<PrefilledAttachment[]>([]);

  Improve.OpenWithAttachments.useHandler(({ attachmentIds, filenames }) => {
    setPrefilled(
      attachmentIds.map((id) => ({
        id,
        filename: filenames?.[id] ?? "attachment",
      })),
    );
    setOpen(true);
  });

  return (
    <TaskDraftPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPrefilled([]);
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
      prefilledAttachments={prefilled}
      heading="Improve this app"
    />
  );
}
