import { useEffect, useRef, useState } from "react";
import { Shell } from "@plugins/shell/web/commands";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MdAdd } from "react-icons/md";

export function NewTaskButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const title = value.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        Shell.Toast({ description: "Failed to create task", variant: "error" });
        return;
      }
      Shell.Toast({ description: "Task created", variant: "success" });
      setValue("");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setValue("");
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        <MdAdd className="size-4" />
        New Task
      </PopoverTrigger>
      <PopoverContent>
        <NewTaskForm
          value={value}
          onChange={setValue}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function NewTaskForm({
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
        Create task
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
        <Button size="sm" onClick={onSubmit} disabled={!value.trim() || submitting}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
