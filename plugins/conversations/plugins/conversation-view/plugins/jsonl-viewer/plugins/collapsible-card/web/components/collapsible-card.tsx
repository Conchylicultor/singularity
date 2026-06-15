import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { ReactNode } from "react";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { RowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

/**
 * Wrapper that makes header content interactive inside the card's click-through
 * trigger area. The whole header row sits over a full-bleed toggle button
 * (`pointer-events-none` content falls through to it), so anything that needs
 * its OWN click — a chip, a FilePath — must opt back in: `pointer-events-auto`
 * to receive events, `relative` to paint above the overlay. This is the single
 * sanctioned home for that idiom; never hand-roll the className pair, and never
 * place a raw interactive element in `label`/`aside` without it.
 */
export function CardHeaderAction({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("pointer-events-auto relative", className)}>
      {children}
    </span>
  );
}

export interface CollapsibleCardProps {
  /** In-trigger content after the built-in chevron (label, or badge+summary).
   *  Natural case — never all-caps (jsonl-viewer rule). Display content is
   *  click-through (toggles the card); interactive content placed here MUST be
   *  wrapped in `<CardHeaderAction>` so it keeps its own click. */
  label: ReactNode;
  /** Convenience: render a clickable FilePath as the sibling aside. */
  filePath?: string;
  /** Sibling affordance after the label. Overrides filePath. Wrapped in
   *  `<CardHeaderAction>` automatically, so pass the raw element. */
  aside?: ReactNode;
  /** Far-right sibling of the header row (e.g. running-dots). */
  trailing?: ReactNode;
  /** Destructive chrome override (tool failures). */
  error?: boolean;
  /** Open on first render. Default false. */
  defaultOpen?: boolean;
  className?: string;
  /** Collapsible body. */
  children?: ReactNode;
}

// One canonical chrome for every transcript card. Semantic accents live in the
// label content (e.g. a primary tool-name Badge), the `error` flag (destructive
// chrome), and the call-site `className` (the single Instructions callout) — never
// in a per-family tone. See research/2026-06-12-conversations-transcript-card-design-system.md.
const CARD_CHROME = "border-border/50 bg-muted/20";
const ERROR_CARD = "border-destructive/60 bg-destructive/5";
// font-sans pins one house font for every transcript card title — the header
// font is a property of the card chrome, not of each renderer. Without it,
// call sites drifted (some plain strings in sans, some font-mono spans).
const HEADER =
  "relative flex w-full region-line gap-sm font-sans text-2xs text-muted-foreground hover:text-foreground";

export function CollapsibleCard({
  label,
  filePath,
  aside,
  trailing,
  error,
  defaultOpen,
  className,
  children,
}: CollapsibleCardProps) {
  const { open, triggerProps, contentId } = useCollapsible({ defaultOpen });
  const sideContent = aside ?? (filePath ? <FilePath filePath={filePath} /> : null);
  return (
    <Card
      className={cn(
        "group px-md py-sm",
        error ? ERROR_CARD : CARD_CHROME,
        className,
      )}
    >
      {/* The toggle is a full-bleed overlay sitting BEHIND the content, not a
          flex sibling. This decouples the click target (the whole header row)
          from the layout (content-sized, left-aligned) — the two roles that,
          fused onto one <button>, pulled in opposite directions and made the
          flex-1 ↔ content-sized fixes cancel each other out. Hovering anywhere
          in the row drives `t.hover` (it bubbles to this ancestor). */}
      <div className={HEADER}>
        <button
          {...triggerProps}
          aria-label={open ? "Collapse" : "Expand"}
          className="absolute inset-0 cursor-pointer transition-colors"
        />
        {/* Non-interactive: pointer-events-none lets clicks fall through to the
            overlay button beneath, so the chevron+label area toggles too. */}
        <span className="pointer-events-none relative flex min-w-0 items-center gap-sm">
          <CollapsibleChevron open={open} className="size-3" />
          {/* No `truncate` here: this row holds identity chips (e.g. the
              tool-name Badge, `shrink-0`) next to free text. `overflow:hidden`
              would clip the chips too once the row gets tight. Truncation is the
              job of the flexible leaf (a `flex-1 truncate` summary span), never
              the container — so chips stay whole and only the text ellipsizes. */}
          <span className="flex min-w-0 items-center gap-sm">{label}</span>
        </span>
        {/* Interactive siblings opt back in via CardHeaderAction. min-w-0 lets
            the aside (typically a FilePath with its own overflow ellipsis)
            shrink below its content width instead of overflowing the card. */}
        {sideContent && (
          <CardHeaderAction className="min-w-0">{sideContent}</CardHeaderAction>
        )}
        {trailing && (
          <CardHeaderAction className="ml-auto shrink-0">
            {trailing}
          </CardHeaderAction>
        )}
        <CardHeaderAction className={cn("shrink-0", !trailing && "ml-auto")}>
          <RowActions />
        </CardHeaderAction>
      </div>
      {open && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the collapsible body from the header inside the non-flex Card; lifting into Card padding would also pad the always-present header
        <div id={contentId} className="mt-2">
          {children}
        </div>
      )}
    </Card>
  );
}
