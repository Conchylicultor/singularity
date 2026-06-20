import type { ComponentType, ReactNode } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin, type PinAnchor } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * Apply to the row element that should reveal its {@link RowActions} on hover or
 * keyboard focus. Establishes the `row-actions` hover group the cluster reacts
 * to — the primitive brings its **own** group rather than piggybacking on
 * whatever group the row already carries (e.g. the sidebar's `group/menu-item`),
 * so it stays group-name-agnostic. `relative` is included so a pinned cluster
 * anchors to this row; harmless on rows that are already positioned.
 *
 * ```tsx
 * <SidebarMenuItem className={rowActionsAnchor}>
 *   <SidebarMenuButton>…</SidebarMenuButton>
 *   <RowActions>
 *     <RowActionButton icon={MdClose} label="Close" onClick={…} />
 *   </RowActions>
 * </SidebarMenuItem>
 * ```
 */
export const rowActionsAnchor = "group/row-actions relative";

/**
 * Coupled opacity↔pointer-events reveal, keyed on the primitive's own
 * `group/row-actions`. Hidden is always BOTH `opacity-0` AND
 * `pointer-events-none`, so the invisible cluster never intercepts clicks on the
 * row beneath it. Revealed on row hover and while focus is anywhere inside the
 * row (keyboard reachability). Group names must be literal for Tailwind's JIT, so
 * this lives as a static string rather than an interpolated group.
 */
const revealClasses =
  "opacity-0 pointer-events-none transition-opacity " +
  "group-hover/row-actions:opacity-100 group-hover/row-actions:pointer-events-auto " +
  "group-focus-within/row-actions:opacity-100 group-focus-within/row-actions:pointer-events-auto";

export interface RowActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Overrides {@link label} as the tooltip content. */
  tooltip?: ReactNode;
  /** Return the action's promise to get the auto-spinner + double-click guard. */
  onClick?: (e: React.MouseEvent) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * The single button path for a hover-revealed trailing row action (close,
 * delete, move, requeue…).
 *
 * It composes the shared {@link IconButton} → `Button`, so an async `onClick`
 * (one that returns a promise) automatically shows a spinner and disables the
 * button until it settles — the in-flight feedback every other button in the app
 * already gets for free. `label` doubles as the tooltip and aria-label.
 */
export function RowActionButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled,
  className,
}: RowActionButtonProps) {
  return (
    <IconButton
      icon={icon}
      label={label}
      tooltip={tooltip}
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={className}
    />
  );
}

export interface RowActionsProps {
  children: ReactNode;
  /**
   * Where to pin the cluster relative to its `rowActionsAnchor` row. Defaults to
   * the right edge (`"right"`). Pass `null` to render the cluster inline instead
   * of absolutely positioning it (e.g. inside an existing trailing flex slot).
   */
  pin?: PinAnchor | null;
  /** Keep the cluster always visible instead of revealing on row hover/focus. */
  alwaysVisible?: boolean;
}

/**
 * The hover-revealed action cluster for a list/tree/sidebar row. Holds one or
 * more {@link RowActionButton}. Anchor it inside a row carrying
 * {@link rowActionsAnchor}; the actions fade in on row hover/focus, with the
 * opacity↔pointer-events coupling owned here so a hidden action is never a live
 * click-target.
 */
export function RowActions({
  children,
  pin = "right",
  alwaysVisible = false,
}: RowActionsProps) {
  const cluster = (
    <Stack
      direction="row"
      gap="none"
      align="center"
      className={alwaysVisible ? undefined : revealClasses}
    >
      <ControlSizeProvider size="xs">{children}</ControlSizeProvider>
    </Stack>
  );
  return pin === null ? (
    cluster
  ) : (
    <Pin to={pin} offset="xs">
      {cluster}
    </Pin>
  );
}
