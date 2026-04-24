import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MdAdd } from "react-icons/md";

type Submitting = false | "create" | "sonnet" | "opus";

export interface ImproveFormProps {
  value: string;
  onChange: (value: string) => void;
  url: string;
  includeScreenshot: boolean;
  onToggleScreenshot: (next: boolean) => void;
  submitting: Submitting;
  onSubmit: (launch: "sonnet" | "opus" | null) => void;
  onCancel: () => void;
}

export function ImproveForm({
  value,
  onChange,
  url,
  includeScreenshot,
  onToggleScreenshot,
  submitting,
  onSubmit,
  onCancel,
}: ImproveFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const disabled = !value.trim() || submitting !== false;

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Improve this app
      </div>
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
      <div
        className="text-muted-foreground truncate text-xs"
        title={url}
      >
        URL: <span className="font-mono">{url || "(unknown)"}</span>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 cursor-pointer"
          checked={includeScreenshot}
          onChange={(e) => onToggleScreenshot(e.target.checked)}
        />
        Attach screenshot of current page
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSubmit("sonnet")}
          disabled={disabled}
        >
          <MdAdd className="size-3.5" />
          {submitting === "sonnet" ? "Launching…" : "Sonnet"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSubmit("opus")}
          disabled={disabled}
        >
          <MdAdd className="size-3.5" />
          {submitting === "opus" ? "Launching…" : "Opus"}
        </Button>
        <Button size="sm" onClick={() => onSubmit(null)} disabled={disabled}>
          {submitting === "create" ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
