import { cn } from "@/lib/utils";
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
  return (
    <As
      ref={ref}
      type={isButton ? "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-current={isButton && selected ? true : undefined}
      className={cn(
        "group flex w-full items-center rounded-md p-row text-left transition-colors [&_svg:not([class*='size-'])]:icon-auto",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "gap-1.5 text-caption",
        size === "md" && "gap-2 text-body",
        hover === "accent" && (selected ? "bg-accent" : "hover:bg-accent"),
        hover === "muted" && (selected ? "bg-muted" : "hover:bg-muted/50"),
        bordered && "border",
        className,
      )}
      style={indent !== undefined ? { paddingLeft: indent } : undefined}
      {...rest}
    >
      {icon}
      {children}
      {actions && (
        <span
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "ml-auto flex shrink-0 items-center gap-0.5",
            !actionsAlwaysVisible && "opacity-0 group-hover:opacity-100",
          )}
        >
          {actions}
        </span>
      )}
    </As>
  );
}
