import { useEffect, useRef, useState } from "react";
import { ShellCommands as Shell } from "@plugins/shell/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ConversationTitle({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cancelledRef = useRef(false);

  const submit = async () => {
    const title = value.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: conversation.taskId, title }),
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setValue("");
      } else if (value.trim() && !submitting) {
        void submit();
      }
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className="hover:bg-accent truncate rounded px-2 py-0.5 font-medium text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {conversation.title ?? conversation.id}
      </PopoverTrigger>
      <PopoverContent>
        <CreateChildTaskForm
          value={value}
          onChange={setValue}
          submitting={submitting}
          onSubmit={async () => {
            await submit();
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

function CreateChildTaskForm({
  value,
  onChange,
  submitting,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
            onSubmit();
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
          onClick={onSubmit}
          disabled={!value.trim() || submitting}
        >
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
