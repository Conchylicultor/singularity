import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useRef } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when autoFocus flips to true; onFocused is a notification, not a dep
  }, [autoFocus]);

  return (
    <input
      ref={inputRef}
      className={cn(
        "min-w-0 flex-1 truncate rounded-md bg-transparent px-xs py-2xs text-caption font-semibold",
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
