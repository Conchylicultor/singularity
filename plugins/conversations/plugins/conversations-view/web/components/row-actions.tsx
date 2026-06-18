import type { ComponentType, ReactNode } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * The single button path for the hover-revealed trailing actions on a
 * conversation sidebar row (close, promote, send-to-bottom, requeue, delete…).
 *
 * It composes the shared {@link IconButton} → `Button`, so an async `onClick`
 * (one that returns a promise) automatically shows a spinner and disables the
 * button until it settles — the in-flight feedback every other button in the app
 * already gets for free. The queue/history/grouped rows previously hand-rolled a
 * bare `<button>` that `void`-swallowed the promise, so they spun nothing and
 * could be double-clicked; routing them through here fixes the whole class at the
 * source. `label` also becomes the tooltip.
 */
export function RowActionButton({
  icon,
  label,
  onClick,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Return the action's promise to get the auto-spinner + double-click guard. */
  onClick?: (e: React.MouseEvent) => void | Promise<void>;
  className?: string;
}) {
  return (
    <IconButton
      icon={icon}
      label={label}
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      className={className}
    />
  );
}

/**
 * The hover-revealed action cluster pinned to the right edge of a sidebar row.
 * Anchor it inside a `relative group/menu-item` row (every `SidebarMenuItem` is
 * one); the actions fade in on row hover. Holds one or more {@link RowActionButton}.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <Pin to="right" offset="xs">
      <Stack
        direction="row"
        gap="none"
        align="center"
        className="opacity-0 transition-opacity group-hover/menu-item:opacity-100"
      >
        {children}
      </Stack>
    </Pin>
  );
}
