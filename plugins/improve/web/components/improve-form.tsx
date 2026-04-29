import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MdAdd } from "react-icons/md";

type Submitting = false | "create" | "sonnet" | "opus";

export interface PrefilledAttachment {
  id: string;
  filename: string;
}

export interface ImproveFormProps {
  value: string;
  onChange: (value: string) => void;
  includeUrl: boolean;
  onToggleUrl: (next: boolean) => void;
  includeScreenshot: boolean;
  onToggleScreenshot: (next: boolean) => void;
  prefilledAttachments?: PrefilledAttachment[];
  submitting: Submitting;
  onSubmit: (launch: "sonnet" | "opus" | null) => void;
  onCancel: () => void;
}

export function ImproveForm({
  value,
  onChange,
  includeUrl,
  onToggleUrl,
  includeScreenshot,
  onToggleScreenshot,
  prefilledAttachments,
  submitting,
  onSubmit,
  onCancel,
}: ImproveFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const disabled = !value.trim() || submitting !== false;
  const attachments = prefilledAttachments ?? [];

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Improve this app
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <img
              key={a.id}
              src={`/api/attachments/${a.id}`}
              alt={a.filename}
              className="max-h-32 w-full rounded border object-contain"
            />
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit(null);
          }
        }}
        placeholder="What should be improved?"
        rows={5}
        className="placeholder:text-muted-foreground w-full resize-y rounded border bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground text-xs font-medium">Context</div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer"
            checked={includeUrl}
            onChange={(e) => onToggleUrl(e.target.checked)}
          />
          URL
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer"
            checked={includeScreenshot}
            onChange={(e) => onToggleScreenshot(e.target.checked)}
          />
          Screenshot
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSubmit(null)}
          disabled={disabled}
          className="mr-auto text-muted-foreground"
        >
          {submitting === "create" ? "Queuing…" : "Queue"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit("sonnet")}
          disabled={disabled}
        >
          <MdAdd className="size-3.5" />
          {submitting === "sonnet" ? "Launching…" : "Sonnet"}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit("opus")}
          disabled={disabled}
        >
          <MdAdd className="size-3.5" />
          {submitting === "opus" ? "Launching…" : "Opus"}
        </Button>
      </div>
    </div>
  );
}
