import { useState } from "react";
import { MdAdd, MdVerticalAlignTop, MdVerticalAlignBottom } from "react-icons/md";
import { TaskDraftPopover } from "@plugins/primitives/plugins/task-draft-form/web";
import { Button, buttonVariants } from "@/components/ui/button";
import { Improve } from "../commands";
import { IMPROVEMENTS_META_TASK_ID } from "../../shared/constants";

export function ImproveButton() {
  const [open, setOpen] = useState(false);
  const [initialText, setInitialText] = useState("");
  const [queuePosition, setQueuePosition] = useState<"top" | "bottom">("bottom");

  Improve.OpenWithText.useHandler(({ text }) => {
    setInitialText(text);
    setOpen(true);
  });

  const handleSuccess = (taskIds: string[]) => {
    if (queuePosition !== "top" || taskIds.length === 0) return;
    fetch("/api/improve/queue-top", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskIds }),
    }).catch(console.error);
  };

  const queueToggle = (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground gap-1 text-xs"
      title={
        queuePosition === "top"
          ? "Will be added to top of queue — click to change"
          : "Will be added to bottom of queue — click to change"
      }
      onClick={() => setQueuePosition((p) => (p === "top" ? "bottom" : "top"))}
    >
      {queuePosition === "top" ? (
        <>
          <MdVerticalAlignTop className="size-3.5" />
          Top
        </>
      ) : (
        <>
          <MdVerticalAlignBottom className="size-3.5" />
          Bottom
        </>
      )}
    </Button>
  );

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
      footerStart={queueToggle}
      onSuccess={handleSuccess}
    />
  );
}
