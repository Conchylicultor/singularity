import { useState } from "react";
import type { FocusEvent } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Hover/focus reveal state for trailing affordances (per-row action buttons, a
 * group's remove control, …).
 *
 * The defect this exists to kill: a reveal written as bare
 * `opacity-0 group-hover:opacity-100` leaves the hidden control **invisible yet
 * fully clickable** — an `opacity-0` element keeps `pointer-events`, so the
 * blank strip beside the visible content becomes a live hit-target and a click
 * there silently fires an unseen Remove/Group action. `hoverRevealClass()` owns
 * the `opacity ⇄ pointer-events` coupling so the half-correct state can't be
 * expressed: hidden is always BOTH `opacity-0` AND `pointer-events-none`.
 *
 * Co-located use: spread `groupProps` onto the element whose hover/focus should
 * reveal (the row), and feed `revealed` to `hoverRevealClass()` on the target
 * (the actions). Each call owns independent local state, so nested reveal groups
 * (a group's own action sitting around a list of per-row actions) scope by
 * construction — no shared Tailwind `group/<name>` to cross-fire across nesting.
 */
export function useHoverReveal(): {
  revealed: boolean;
  groupProps: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: (e: FocusEvent) => void;
  };
} {
  const [revealed, setRevealed] = useState(false);
  return {
    revealed,
    groupProps: {
      onPointerEnter: () => setRevealed(true),
      onPointerLeave: () => setRevealed(false),
      onFocus: () => setRevealed(true),
      onBlur: (e: FocusEvent) => {
        // Keep revealed while focus moves between controls inside the group.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setRevealed(false);
      },
    },
  };
}

/**
 * The canonical class for a hover-reveal target. Owns the opacity↔pointer-events
 * coupling so a hidden control is never left as a live click-target. Pass
 * `alwaysVisible` to opt a target out of hiding (e.g. a pinned row action).
 */
export function hoverRevealClass(
  revealed: boolean,
  opts?: { alwaysVisible?: boolean },
): string {
  return cn(
    "transition-opacity",
    revealed || opts?.alwaysVisible
      ? "opacity-100"
      : "pointer-events-none opacity-0",
  );
}
