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
  /**
   * Forwarded to the row's outermost element (the row box) — the one intentional
   * divergence from ToggleChip (tree DnD / scroll-into-view depend on it).
   */
  ref?: React.Ref<HTMLElement>;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /**
   * Permissive passthrough for the rendered element (onClick, href, download,
   * role, aria-*, …). The element is INFERRED from these — there is no `as`:
   * `href` → `<a>`, otherwise `onClick`/`disabled` → `<button>`, otherwise a
   * non-interactive `<div>`. So a clickable row + interactive `actions` can never
   * emit invalid nested-interactive DOM.
   */
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
  ref,
  disabled,
  className,
  children,
  ...rest
}: RowProps) {
  // The element is inferred, never authored: a row with `href` is a link, a row
  // with `onClick`/`disabled` is a button, anything else is a plain container.
  // This removes the `as` footgun — a clickable row can no longer be declared as
  // a `<button>` that then nests its `actions` buttons (invalid DOM).
  const href = (rest as { href?: unknown }).href;
  const onClick = (rest as { onClick?: unknown }).onClick;
  const Tag: React.ElementType =
    href != null ? "a" : onClick != null || disabled != null ? "button" : "div";
  const isButton = Tag === "button";
  const interactive = Tag !== "div";

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

  const revealHandlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (needsReveal) groupProps.onPointerEnter();
      onPointerEnter?.(e);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (needsReveal) groupProps.onPointerLeave();
      onPointerLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      if (needsReveal) groupProps.onFocus();
      onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (needsReveal) groupProps.onBlur(e);
      onBlur?.(e);
    },
  };

  // The single-line contract (region-line + SingleLineProvider) comes from
  // <Line>; Row layers its interactive row chrome (width, padding, hover) on top.
  const chromeClass = cn(
    "group w-full rounded-md p-row text-left transition-colors [&_svg:not([class*='size-'])]:icon-auto",
    "disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "gap-xs text-caption",
    size === "md" && "gap-sm text-body",
    hover === "accent" && (selected ? "bg-accent" : "hover:bg-accent"),
    hover === "muted" && (selected ? "bg-muted" : "hover:bg-muted/50"),
    bordered && "border",
    className,
  );
  const style = indent !== undefined ? { paddingLeft: indent } : undefined;

  const actionsSpan = actions ? (
    <span
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "ml-auto flex shrink-0 items-center gap-2xs",
        // Raise above the stretched hit-area so the actions stay clickable
        // (positioned siblings paint in DOM order — actions come after it).
        interactive && "relative",
        hoverRevealClass(revealed, { alwaysVisible: actionsAlwaysVisible }),
      )}
    >
      {actions}
    </span>
  ) : null;

  // SPLIT PATH — an interactive row that also carries actions. The interactive
  // element must be a SIBLING of the actions, never their ancestor, so we render
  // a non-interactive container and put the primary <button>/<a> beside the
  // actions. A full-bleed, aria-hidden hit-area child keeps the whole padded row
  // clickable and gives the button its accessible name from {children}.
  if (interactive && actions) {
    return (
      <Line
        as="div"
        ref={ref}
        className={cn(chromeClass, "relative")}
        style={style}
        {...revealHandlers}
      >
        <Tag
          type={isButton ? "button" : undefined}
          disabled={isButton ? disabled : undefined}
          aria-current={isButton && selected ? true : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center text-left",
            size === "sm" ? "gap-xs" : "gap-sm",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          {...restProps}
        >
          {icon}
          {children}
          <span aria-hidden className="absolute inset-0 rounded-md" />
        </Tag>
        {actionsSpan}
      </Line>
    );
  }

  // SINGLE-ELEMENT PATH — no actions (any element), or a non-interactive
  // container row with actions (a <div> may legally nest the action buttons).
  // Byte-for-byte the original markup.
  return (
    <Line
      as={Tag}
      ref={ref}
      type={isButton ? "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-current={isButton && selected ? true : undefined}
      {...revealHandlers}
      className={chromeClass}
      style={style}
      {...restProps}
    >
      {icon}
      {children}
      {actionsSpan}
    </Line>
  );
}
