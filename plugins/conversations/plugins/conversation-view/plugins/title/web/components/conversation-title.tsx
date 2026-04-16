import { useEffect, useRef, useState } from "react";
import { Shell } from "@plugins/shell/web/commands";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ConversationTitle({
  conversation,
}: {
  conversation: ConversationState;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="hover:bg-accent truncate rounded px-2 py-0.5 font-medium text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {conversation.title ?? conversation.id}
      </PopoverTrigger>
      <PopoverContent>
        <CreateChildTaskForm
          parentTaskId={conversation.taskId}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function CreateChildTaskForm({
  parentTaskId,
  onClose,
}: {
  parentTaskId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = async () => {
    const title = value.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: parentTaskId, title }),
      });
      if (!res.ok) {
        Shell.Toast({
          description: "Failed to create task",
          variant: "error",
        });
        return;
      }
      Shell.Toast({ description: "Child task created", variant: "success" });
      setValue("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Create child task
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Describe the task…"
        rows={5}
        className="placeholder:text-muted-foreground w-full resize-y rounded border bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!value.trim() || submitting}
        >
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
