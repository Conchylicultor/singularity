import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
import type React from "react";

export type RowSize = "sm" | "md";
export type RowHover = "accent" | "muted";

export interface RowProps {
  /** Persistent selection → bg-accent; aria-current on buttons. */
  selected?: boolean;
  /** Text+gap density only; PADDING is always p-row. sm=text-xs gap-1.5, md=text-sm gap-2. Default "md". */
  size?: RowSize;
  /** Hover treatment. "accent" (sidebars/menus, default) | "muted" (cards/popovers). */
  hover?: RowHover;
  /** Adds a `border` (bordered chip-rows). */
  bordered?: boolean;
  /** Tree depth px → style paddingLeft (overrides p-row's left). */
  indent?: number;
  /** Leading slot (icon / StatusDot / chevron), rendered before children. */
  icon?: React.ReactNode;
  /** Trailing slot; ml-auto, hover-revealed by default. */
  actions?: React.ReactNode;
  actionsAlwaysVisible?: boolean;
  /** Element to render. Default "button"; "a" link rows, "div"/"li" containers. */
  as?: React.ElementType;
  /** Forwarded to the rendered element — the one intentional divergence from ToggleChip (tree DnD depends on it). */
  ref?: React.Ref<HTMLElement>;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, href, download, role, …). */
  [key: string]: unknown;
}

export function Row({
  selected,
  size = "md",
  hover = "accent",
  bordered,
  indent,
  icon,
  actions,
  actionsAlwaysVisible,
  as: As = "button",
  ref,
  disabled,
  className,
  children,
  ...rest
}: RowProps) {
  const isButton = As === "button";
  // Hover/focus reveal for the trailing actions. Only rows that actually hide
  // their actions need the JS state, so plain/always-visible rows keep their
  // zero-cost CSS-only hover. Consumer-supplied pointer/focus handlers compose.
  const needsReveal = !!actions && !actionsAlwaysVisible;
  const { revealed, groupProps } = useHoverReveal();
  const {
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    ...restProps
  } = rest as {
    onPointerEnter?: React.PointerEventHandler;
    onPointerLeave?: React.PointerEventHandler;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
    [key: string]: unknown;
  };
  return (
    // The single-line contract (region-line + SingleLineProvider) comes from
    // <Line>; Row layers its interactive row chrome (width, padding, hover) on top.
    <Line
      as={As}
      ref={ref}
      type={isButton ? "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-current={isButton && selected ? true : undefined}
      onPointerEnter={(e: React.PointerEvent) => {
        if (needsReveal) groupProps.onPointerEnter();
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e: React.PointerEvent) => {
        if (needsReveal) groupProps.onPointerLeave();
        onPointerLeave?.(e);
      }}
      onFocus={(e: React.FocusEvent) => {
        if (needsReveal) groupProps.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e: React.FocusEvent) => {
        if (needsReveal) groupProps.onBlur(e);
        onBlur?.(e);
      }}
      className={cn(
        "group w-full rounded-md p-row text-left transition-colors [&_svg:not([class*='size-'])]:icon-auto",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "gap-xs text-caption",
        size === "md" && "gap-sm text-body",
        hover === "accent" && (selected ? "bg-accent" : "hover:bg-accent"),
        hover === "muted" && (selected ? "bg-muted" : "hover:bg-muted/50"),
        bordered && "border",
        className,
      )}
      style={indent !== undefined ? { paddingLeft: indent } : undefined}
      {...restProps}
    >
      {icon}
      {children}
      {actions && (
        <span
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "ml-auto flex shrink-0 items-center gap-2xs",
            hoverRevealClass(revealed, { alwaysVisible: actionsAlwaysVisible }),
          )}
        >
          {actions}
        </span>
      )}
    </Line>
  );
}
