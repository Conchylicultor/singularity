import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataCardProps {
  /** Card click + Enter/Space (role=button, tabIndex=0). */
  onActivate?: () => void;
  /** Top region: cover image / icon block. */
  media?: ReactNode;
  /** Hover-revealed top-right region (stops propagation so it never activates the card). */
  actions?: ReactNode;
  /** Bottom row: badges / affordances. */
  footer?: ReactNode;
  /** Body: title + property rows. */
  children: ReactNode;
  className?: string;
}

/**
 * Composable card chrome mirroring the tree's RowChrome region model: media /
 * body / actions / footer regions, with `group`-driven hover reveal, focus, and
 * click→`onActivate` behavior baked in so consumers don't re-implement it.
 */
export function DataCard(props: DataCardProps) {
  const { onActivate, media, actions, footer, children, className } = props;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
        "cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40",
        className,
      )}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
    >
      {media}
      <div className="min-w-0 flex-1">{children}</div>
      {footer}
      {actions ? (
        <div
          className={cn(
            "absolute right-2 top-2 flex items-center gap-1",
            "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
          )}
          // Action clicks must not bubble up to onActivate.
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
