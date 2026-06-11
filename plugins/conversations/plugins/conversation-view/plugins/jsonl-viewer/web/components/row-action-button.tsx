import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

// Shared button styling for the JSONL row action strip. The strip handles
// hover-reveal — individual buttons stay simple. Use `rowActionClass()` when
// applying the same styling to a non-Button element (e.g. a base-ui trigger
// rendered as its own native button).
export function rowActionClass(extra?: string): string {
  return cn(
    "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground",
    extra,
  );
}

interface RowActionButtonProps extends ComponentPropsWithoutRef<"button"> {
  title: string;
  active?: boolean;
  children: ReactNode;
}

export function RowActionButton({
  title,
  active,
  className,
  children,
  onClick,
  ...rest
}: RowActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-5 shrink-0 text-muted-foreground hover:text-foreground",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}
