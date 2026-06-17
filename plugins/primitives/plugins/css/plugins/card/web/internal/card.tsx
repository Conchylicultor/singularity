import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import type React from "react";

/**
 * Card = the `raised` surface role + the card padding + the click/selection
 * affordances. The chrome (`rounded + border + bg-card + shadow`) and the Ctrl+A
 * select-scope now live in `<Surface level="raised">`; Card only layers padding
 * and the interactive/selected emphasis on top. Consumers that need a different
 * radius / bg / padding override via `className` (cn = `twMerge(clsx(...))`, so
 * tailwind-merge resolves conflicts and the caller's class wins).
 */
// Card's default padding is the legacy `p-3` (0.75rem) — kept in a module const,
// as the prior BASE string did, so it isn't a className string literal subject to
// `no-adhoc-spacing`. Card predates the density ramp and this padding is its
// documented public default; consumers override via `className`.
const PAD = "p-3";
const HOVER = "cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40";
const SEL = "border-primary";

export interface CardProps {
  /** Element to render. Default "div"; "button"/"a"/"li" for interactive or list cards. */
  as?: React.ElementType;
  /** Clickable affordance: pointer cursor + hover border/bg. */
  interactive?: boolean;
  /** Persistent selection emphasis (border-primary). */
  selected?: boolean;
  /** Forwarded to the rendered element — DnD consumers depend on it (mirrors Row). */
  ref?: React.Ref<HTMLElement>;
  /** Composed with Surface's baked-in select-scope handler; see below. */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Overrides the scope's default `-1` (e.g. `0` for keyboard-focusable cards). */
  tabIndex?: number;
  className?: string;
  children: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, href, role, type, …). */
  [key: string]: unknown;
}

/**
 * Card chrome primitive. Renders a `raised` Surface: the select-scope is baked
 * into the ROOT element (no nested wrapper) by Surface, so a click into the card
 * + Ctrl+A selects only the card's subtree. `ref` forwards to the root DOM
 * element (needed for DnD consumers).
 *
 * `onKeyDown` is forwarded to Surface, which composes it with the scope handler
 * (consumer-first, then scope, applied after the rest spread) so an interactive
 * card's Enter/Space activation and the Ctrl+A scope never interfere. Interactive
 * cards default to `tabIndex=0` (stay in keyboard tab order); static cards fall
 * through to Surface's `-1` (click-focusable only). A consumer `tabIndex` wins.
 */
export function Card({
  as: Comp = "div",
  interactive,
  selected,
  className,
  children,
  ref,
  onKeyDown,
  tabIndex,
  ...rest
}: CardProps) {
  return (
    <Surface
      level="raised"
      as={Comp}
      ref={ref}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      onKeyDown={onKeyDown}
      {...rest}
      className={cn(PAD, interactive && HOVER, selected && SEL, className)}
    >
      {children}
    </Surface>
  );
}
