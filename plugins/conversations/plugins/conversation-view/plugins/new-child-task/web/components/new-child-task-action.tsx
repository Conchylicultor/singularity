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

type SubmitMode = { kind: "create" } | { kind: "queue"; model: Model };

export function NewChildTaskAction() {
  const { conversation } = conversationPane.useData();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState<SubmitMode | null>(null);
  const cancelledRef = useRef(false);

  const submit = async (mode: SubmitMode) => {
    const title = value.trim();
    if (!title || submitting) return;
    setSubmitting(mode);
    try {
      const body: Record<string, unknown> = {
        parentId: conversation.taskId,
        title,
      };
      if (mode.kind === "queue") {
        body.autoStart = { model: mode.model };
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        Shell.Toast({
          description: "Failed to create task",
          variant: "error",
        });
        return;
      }
      const successDescription =
        mode.kind === "queue"
          ? `Queued · ${labelFor(mode.model)}`
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
        // Implicit close (click-outside / escape) preserves the existing
        // "submit on dismiss" behavior — fire the plain Create path.
        void submit({ kind: "create" });
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
            onSubmit({ kind: "create" });
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
          onClick={() => onSubmit({ kind: "create" })}
          disabled={empty || isBusy}
        >
          {submitting?.kind === "create" ? "Creating…" : "Create"}
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
