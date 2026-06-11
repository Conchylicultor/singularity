import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Card } from "@plugins/primitives/plugins/card/web";
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
  const sideContent = aside ?? (filePath ? <FilePath filePath={filePath} /> : null);
  return (
    <Card
      className={cn(
        "group px-3 py-2",
        error ? ERROR_CARD : t.card,
        className,
      )}
    >
      {/* The toggle is a full-bleed overlay sitting BEHIND the content, not a
          flex sibling. This decouples the click target (the whole header row)
          from the layout (content-sized, left-aligned) — the two roles that,
          fused onto one <button>, pulled in opposite directions and made the
          flex-1 ↔ content-sized fixes cancel each other out. Hovering anywhere
          in the row drives `t.hover` (it bubbles to this ancestor). */}
      <div
        className={cn("relative flex w-full items-center gap-2", t.header, t.hover)}
      >
        <button
          {...triggerProps}
          aria-label={open ? "Collapse" : "Expand"}
          className="absolute inset-0 cursor-pointer transition-colors"
        />
        {/* Non-interactive: pointer-events-none lets clicks fall through to the
            overlay button beneath, so the chevron+label area toggles too. */}
        <span className="pointer-events-none relative flex min-w-0 items-center gap-2">
          <CollapsibleChevron open={open} className="size-3" />
          <span className="flex min-w-0 items-center gap-2 truncate">
            {label}
          </span>
        </span>
        {/* Interactive siblings opt back in: pointer-events-auto captures their
            own clicks, and `relative` paints them above the overlay. */}
        {sideContent && (
          <span className="pointer-events-auto relative">{sideContent}</span>
        )}
        {trailing && (
          <span className="pointer-events-auto relative ml-auto shrink-0">
            {trailing}
          </span>
        )}
      </div>
      {open &&
        (t.body ? (
          <div id={contentId} className={t.body}>
            {children}
          </div>
        ) : (
          <div id={contentId}>{children}</div>
        ))}
    </Card>
  );
}
