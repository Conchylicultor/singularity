import { useEffect, useRef, useState } from "react";
import { MdAdd } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Model = "opus" | "sonnet";

type SubmitMode =
  | { kind: "followup" }
  | { kind: "prerequisite" }
  | { kind: "queue"; model: Model };

export function NewChildTaskAction() {
  const { conversation } = conversationPane.useData();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState<SubmitMode | null>(null);
  const cancelledRef = useRef(false);

  const submit = async (mode: SubmitMode) => {
    const description = value.trim();
    if (!description || submitting) return;
    setSubmitting(mode);
    try {
      // Send the prompt as the task description; the server asks Haiku for a
      // short title (with first-line-80-chars fallback if the CLI is offline).
      const body: Record<string, unknown> = {
        parentId: conversation.taskId,
        description,
      };
      if (mode.kind === "queue") {
        body.autoStart = { model: mode.model };
        // Auto-start engine fires when all deps are non-blocking. Containment
        // (parentId) is preserved for the tree list; execution order is
        // expressed via the dep on the parent.
        body.dependencies = [conversation.taskId];
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        Shell.Toast({ description: "Failed to create task", variant: "error" });
        return;
      }
      const newTask = (await res.json()) as { id: string };

      if (mode.kind === "followup" || mode.kind === "prerequisite") {
        const [depTaskId, dependsOnId] =
          mode.kind === "followup"
            ? [newTask.id, conversation.taskId]
            : [conversation.taskId, newTask.id];
        const depRes = await fetch(`/api/tasks/${depTaskId}/dependencies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnTaskId: dependsOnId }),
        });
        if (!depRes.ok) {
          Shell.Toast({
            description: "Task created but dependency failed",
            variant: "error",
          });
          setValue("");
          return;
        }
      }

      const successDescription =
        mode.kind === "queue"
          ? `Queued · ${labelFor(mode.model)}`
          : mode.kind === "followup"
            ? "Follow-up task created"
            : mode.kind === "prerequisite"
              ? "Prerequisite task created"
              : "Child task created";
      Shell.Toast({ description: successDescription, variant: "success" });
      setValue("");
    } finally {
      setSubmitting(null);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setValue("");
      } else if (value.trim() && !submitting) {
        void submit({ kind: "followup" });
      }
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        title="New child task"
        aria-label="New child task"
      >
        <MdAdd className="size-4" />
      </PopoverTrigger>
      <PopoverContent>
        <CreateChildTaskForm
          value={value}
          onChange={setValue}
          submitting={submitting}
          onSubmit={async (mode) => {
            await submit(mode);
            setOpen(false);
          }}
          onCancel={() => {
            cancelledRef.current = true;
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function labelFor(model: Model): string {
  return model === "opus" ? "Opus" : "Sonnet";
}

function CreateChildTaskForm({
  value,
  onChange,
  submitting,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  submitting: SubmitMode | null;
  onSubmit: (mode: SubmitMode) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const empty = !value.trim();
  const isBusy = submitting !== null;

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Create child task
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit({ kind: "followup" });
          }
        }}
        placeholder="Describe the task…"
        rows={5}
        className="placeholder:text-muted-foreground w-full resize-y rounded border bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSubmit({ kind: "prerequisite" })}
          disabled={empty || isBusy}
          title="This task must complete before the current task"
        >
          {submitting?.kind === "prerequisite" ? "Creating…" : "Prerequisite"}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit({ kind: "followup" })}
          disabled={empty || isBusy}
          title="Start this task after the current task is done"
        >
          {submitting?.kind === "followup" ? "Creating…" : "Follow-up"}
        </Button>
      </div>
      <div className="border-t pt-2">
        <div className="text-muted-foreground mb-1 text-xs">
          Auto-start when parent is done
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSubmit({ kind: "queue", model: "sonnet" })}
            disabled={empty || isBusy}
          >
            {submitting?.kind === "queue" && submitting.model === "sonnet"
              ? "Queueing…"
              : "+ Sonnet"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSubmit({ kind: "queue", model: "opus" })}
            disabled={empty || isBusy}
          >
            {submitting?.kind === "queue" && submitting.model === "opus"
              ? "Queueing…"
              : "+ Opus"}
          </Button>
        </div>
      </div>
    </div>
  );
}
