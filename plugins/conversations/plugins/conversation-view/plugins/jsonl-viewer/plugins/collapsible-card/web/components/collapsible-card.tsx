import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";

export type CollapsibleCardTone = "muted" | "primary" | "tool";

export interface CollapsibleCardProps {
  /** In-trigger content after the built-in chevron (label, or badge+summary).
   *  Natural case — never all-caps (jsonl-viewer rule). Interactive content
   *  (FilePath, chips) MUST go in `aside`, never here. */
  label: ReactNode;
  /** Convenience: render a clickable FilePath as the sibling aside. */
  filePath?: string;
  /** Sibling affordance next to (never inside) the trigger. Overrides filePath.
   *  Interactive content (FilePath, chips) MUST go here, never in `label`. */
  aside?: ReactNode;
  /** Far-right sibling of the header row (e.g. running-dots). */
  trailing?: ReactNode;
  /** Chrome scheme. Default "muted". */
  tone?: CollapsibleCardTone;
  /** Destructive chrome override (tool failures). */
  error?: boolean;
  /** Open on first render. Default false. */
  defaultOpen?: boolean;
  className?: string;
  /** Collapsible body. */
  children?: ReactNode;
}

const TONE = {
  muted: {
    card: "border-border/40 bg-muted/20",
    header: "text-3xs tracking-wide text-muted-foreground",
    hover: "hover:text-foreground",
    body: "mt-2 border-l-2 border-muted-foreground/20 pl-3",
  },
  primary: {
    card: "border-primary/30 bg-primary/5",
    header: "text-xs tracking-wide text-primary/80",
    hover: "hover:text-primary",
    body: "mt-2 border-l-2 border-primary/20 pl-3",
  },
  tool: {
    card: "border-border/60 bg-background",
    header: "text-xs text-muted-foreground",
    hover: "",
    body: "",
  },
} as const;

const ERROR_CARD = "border-destructive/60 bg-destructive/5";

export function CollapsibleCard({
  label,
  filePath,
  aside,
  trailing,
  tone = "muted",
  error,
  defaultOpen,
  className,
  children,
}: CollapsibleCardProps) {
  const { open, triggerProps, contentId } = useCollapsible({ defaultOpen });
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "group rounded-md border px-3 py-2",
        error ? ERROR_CARD : t.card,
        className,
      )}
    >
      <div className={cn("flex w-full items-center gap-2", t.header)}>
        <button
          {...triggerProps}
          className={cn(
            // Content-sized (min-w-0 so it can shrink + truncate), NOT flex-1:
            // the trigger hugs its chevron+label so the `aside` (e.g. FilePath)
            // sits immediately to its right, left-aligned, rather than being
            // shoved to the far edge. Free space falls to the right, where
            // `trailing` pins itself via ml-auto.
            "flex min-w-0 items-center gap-2 text-left transition-colors",
            t.hover,
          )}
        >
          <CollapsibleChevron open={open} className="size-3" />
          <span className="flex min-w-0 items-center gap-2 truncate">
            {label}
          </span>
        </button>
        {aside ?? (filePath && <FilePath filePath={filePath} />)}
        {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
      </div>
      {open &&
        (t.body ? (
          <div id={contentId} className={t.body}>
            {children}
          </div>
        ) : (
          <div id={contentId}>{children}</div>
        ))}
    </div>
  );
}
