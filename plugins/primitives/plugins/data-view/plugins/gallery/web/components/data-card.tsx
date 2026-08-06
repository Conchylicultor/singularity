import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  RowActions,
  rowActionsAnchor,
} from "@plugins/primitives/plugins/row-actions/web";
import { type ReactNode } from "react";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export interface DataCardProps {
  /** Card click + Enter/Space (role=button, tabIndex=0). */
  onActivate?: () => void;
  /** Top region: cover image / icon block. */
  media?: ReactNode;
  /** Trailing action cluster, rendered through `RowActions` — revealed on card
   *  hover/focus, and never activating the card (the primitive stops the press). */
  actions?: ReactNode;
  /** Bottom row: badges / affordances. */
  footer?: ReactNode;
  /** Body: title + property rows. */
  children: ReactNode;
  /** Persistent active/selected highlight (ring around the card). */
  selected?: boolean;
  className?: string;
}

/**
 * Composable card chrome mirroring the tree's RowChrome region model: media /
 * body / actions / footer regions, with focus and click→`onActivate` behavior
 * baked in so consumers don't re-implement it. The actions region is the shared
 * `RowActions` primitive, which owns the reveal, the pin + scrim, the popup-hold
 * and the press guards — this card only says WHERE it sits.
 */
export function DataCard(props: DataCardProps) {
  const { onActivate, media, actions, footer, children, selected, className } =
    props;

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
      // `rowActionsAnchor` carries `relative` too, which is what the pinned
      // cluster anchors to — the card needs no `relative` of its own.
      className={cn(
        rowActionsAnchor,
        "rounded-lg p-lg",
        selected && "ring-2 ring-primary",
        className,
      )}
    >
      <Stack gap="md">
        {media}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- card body fills the column and allows its children to truncate horizontally */}
        <div className="min-w-0 flex-1">{children}</div>
        {footer}
      </Stack>
      {/* The cluster overlays the card's own body (a long title wraps under it),
          so the primitive's pin paints the card's scrim, dissolved along its
          inner left and bottom edges. Card publishes `--scrim` for its hover
          tint; `selected` here is a ring, not a tint, so it needs none. */}
      {actions ? <RowActions pin="top-right">{actions}</RowActions> : null}
    </Card>
  );
}
