import { cn, SURFACE_LEVELS, type SurfaceLevel } from "@plugins/primitives/plugins/ui-kit/web";
import { selectScopeProps } from "@plugins/primitives/plugins/select-scope/web";
import type React from "react";

export interface SurfaceProps {
  /**
   * Semantic elevation role — picks the frozen background (+ border / radius /
   * shadow) bundle from SURFACE_LEVELS. The whole point of the closed set: every
   * surface of a role looks identical and re-themes together on a preset swap.
   *   - `sunken`  — recessed well / band below the base plane (tone only)
   *   - `base`    — page / pane canvas, toolbar bands (tone only)
   *   - `raised`  — a card lifted above base (bg + border + radius + shadow)
   *   - `overlay` — floats above everything: popovers, menus, floating panels
   */
  level: SurfaceLevel;
  /** Element to render. Default "div"; "section"/"button"/"a"/"li" as needed. */
  as?: React.ElementType;
  /** Forwarded to the rendered element — DnD consumers depend on it (mirrors Card/Row). */
  ref?: React.Ref<HTMLElement>;
  /** Composed with the baked-in select-scope handler (consumer runs first). */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Overrides the scope's default `-1` (e.g. `0` for keyboard-focusable surfaces). */
  tabIndex?: number;
  className?: string;
  children?: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, href, role, style, …). */
  [key: string]: unknown;
}

/**
 * The surface chrome primitive: one closed set of semantic elevation roles, each
 * a frozen bundle of background + border + radius + shadow drawn from the shared
 * SURFACE_LEVELS map (in ui-kit). Routing every panel / card / overlay through
 * `<Surface level>` is what makes a theme/preset swap move the whole app's depth
 * consistently instead of each call site freezing its own ad-hoc recipe.
 *
 * Like `<Card>` (which is now a thin `<Surface level="raised">` wrapper), the
 * Ctrl+A **select-scope** is baked into the ROOT element: the surface becomes the
 * scope, so a click into it + Ctrl+A selects only its subtree. The scope handler
 * is GUARANTEED to run even when the consumer passes its own `onKeyDown` — we
 * compose consumer-first, then the scope handler, and apply the merged handler
 * AFTER `{...rest}` so nothing can clobber it. (Consumer-first is safe: an
 * activation handler preventDefaults on Enter/Space, while the scope handler only
 * acts on Ctrl/Cmd+"a", so they never interfere.)
 */
export function Surface({
  level,
  as: Comp = "div",
  className,
  children,
  ref,
  onKeyDown,
  tabIndex,
  ...rest
}: SurfaceProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e);
    selectScopeProps.onKeyDown(e);
  };
  return (
    <Comp
      ref={ref}
      tabIndex={tabIndex ?? selectScopeProps.tabIndex}
      {...rest}
      onKeyDown={handleKeyDown}
      className={cn(SURFACE_LEVELS[level], className)}
    >
      {children}
    </Comp>
  );
}
