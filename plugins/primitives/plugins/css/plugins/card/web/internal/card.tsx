import {
  cn,
  ControlSizeProvider,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
// Card's default padding comes from the density `p-card` token (--pad-card), so
// it scales with the active density preset (Comfortable / Cozy / Compact) like
// every other padded chrome surface. `p-card` is word-valued, so `no-adhoc-spacing`
// allows it inline; consumers override via `className`.
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
  /** Optional control density for everything inside the card; omitted = inherit ambient (no change). */
  controlSize?: ControlSize;
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
  controlSize,
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
      className={cn("p-card", interactive && HOVER, selected && SEL, className)}
    >
      {controlSize ? (
        <ControlSizeProvider size={controlSize}>{children}</ControlSizeProvider>
      ) : (
        children
      )}
    </Surface>
  );
}
