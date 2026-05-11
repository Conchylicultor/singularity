import { useEffect, useRef } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { cn } from "@/lib/utils";

export function GroupRename({
  value,
  onSave,
  className,
  autoFocus,
  onFocused,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const field = useEditableField<string>({
    value,
    onSave: async (next) => {
      const trimmed = next.trim();
      if (trimmed.length === 0) return;
      await onSave(trimmed);
    },
  });

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      onFocused?.();
    }
    // We intentionally only fire when autoFocus flips to true.
  }, [autoFocus]);

  return (
    <input
      ref={inputRef}
      className={cn(
        "min-w-0 flex-1 truncate rounded bg-transparent px-1 py-0.5 text-xs font-semibold",
        "outline-none focus:bg-background/60 focus:ring-1 focus:ring-border",
        className,
      )}
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Group title"
    />
  );
}
