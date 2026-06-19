import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { type ReactNode } from "react";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";

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
  /** Persistent active/selected highlight (ring around the card). */
  selected?: boolean;
  className?: string;
}

/**
 * Composable card chrome mirroring the tree's RowChrome region model: media /
 * body / actions / footer regions, with `group`-driven hover reveal, focus, and
 * click→`onActivate` behavior baked in so consumers don't re-implement it.
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
      className={cn(
        hoverRevealGroup,
        "relative rounded-lg p-lg",
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
      {actions ? (
        <Pin
          to="top-right"
          offset="sm"
          className={hoverRevealTarget}
          // Action clicks must not bubble up to onActivate.
          onClick={(e) => e.stopPropagation()}
        >
          <Stack direction="row" gap="xs" align="center">
            {actions}
          </Stack>
        </Pin>
      ) : null}
    </Card>
  );
}
