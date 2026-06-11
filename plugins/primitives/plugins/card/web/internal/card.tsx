import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { selectScopeProps } from "@plugins/primitives/plugins/select-scope/web";
import type React from "react";

/**
 * The dominant card cluster from the card audit. Consumers that need a different
 * radius / bg / padding override via `className` (cn = `twMerge(clsx(...))`, so
 * tailwind-merge resolves conflicts and the caller's class wins).
 */
const BASE = "rounded-md border border-border bg-card p-3";
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
  /** Composed with the baked-in select-scope handler; see below. */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Overrides the scope's default `-1` (e.g. `0` for keyboard-focusable cards). */
  tabIndex?: number;
  className?: string;
  children: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, href, role, type, …). */
  [key: string]: unknown;
}

/**
 * Card chrome primitive. The select-scope is baked into the ROOT element (no
 * nested wrapper div): the card itself becomes the Ctrl+A scope, so a click into
 * the card + Ctrl+A selects only the card's subtree. `ref` forwards to the root
 * DOM element (needed for DnD consumers).
 *
 * The scope handler is GUARANTEED to run — even on interactive cards that pass
 * their own `onKeyDown` (Enter/Space activation). We compose: the consumer
 * handler runs FIRST, then the scope handler, and the merged handler is applied
 * AFTER `{...rest}` so nothing can clobber it. Consumer-first is safe: an
 * activation handler `preventDefault`s on Enter/Space, while the scope handler
 * only acts on Ctrl/Cmd+"a" and bails on `!e.defaultPrevented`, so they never
 * interfere. The consumer's `tabIndex` (e.g. `0` for keyboard-focusable
 * interactive cards) overrides the default `-1`; the scope only needs the
 * element focusable.
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e);
    selectScopeProps.onKeyDown(e);
  };
  // Default focusability: interactive cards stay in the keyboard tab order
  // (`0`); static cards are click-focusable only (`-1` from selectScopeProps) so
  // they can still receive the scope keydown without joining the tab order. A
  // consumer-supplied `tabIndex` always wins. (Forcing `-1` on an interactive
  // card would drop a natively-tabbable button/link out of keyboard nav.)
  const defaultTabIndex = interactive ? 0 : selectScopeProps.tabIndex;
  return (
    <Comp
      ref={ref}
      tabIndex={tabIndex ?? defaultTabIndex}
      {...rest}
      onKeyDown={handleKeyDown}
      className={cn(BASE, interactive && HOVER, selected && SEL, className)}
    >
      {children}
    </Comp>
  );
}
