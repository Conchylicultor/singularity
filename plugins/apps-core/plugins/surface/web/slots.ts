import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

/**
 * Props handed to a placement's optional {@link PlacementDef.Chrome}. The Chrome
 * is a *sibling* overlay of the keep-alive `TabSurface` (never a parent), so it
 * may mount/unmount freely on placement change without remounting the tab.
 */
export interface PlacementChromeProps {
  tabId: string;
  appId: string;
  title: string | undefined;
  focused: boolean;
  /**
   * True while this tab has left the store but is retained by the host for its
   * exit tween (see {@link PlacementDef.exitDurationMs}). Placements without an
   * `exitDurationMs` never see `true` — their tabs unmount instantly on close.
   */
  exiting: boolean;
  onClose: () => void;
  /** Return the surface to the mode it was in before this one (solo's exit). */
  onExit: () => void;
}

/**
 * A surface-mode descriptor — the contribution to {@link Surface.Placement}.
 * Each mode (docked / floating / solo …) is a self-contained sub-plugin that
 * contributes exactly one of these. The surface is in EXACTLY ONE mode at a
 * time (per-surface, never per-tab), and renders every open tab under that one
 * descriptor — so two modes can never be visible at once (e.g. a solo app and a
 * floating window). Almost all of it is *data*: the host (`SurfaceBody`) keeps
 * one stable container per tab and only varies the descriptor's class / portal /
 * chrome, so a mode switch re-positions the still-mounted tabs rather than
 * remounting them (keep-alive).
 *
 * The optional {@link PlacementDef.Chrome} is the escape hatch for dynamic,
 * hook-derived presentation (floating's geometry box): it runs its own hooks and
 * pushes inline style up to the host-owned container via
 * {@link usePlacementStyle}, so the dynamic style lives in the mode plugin yet
 * styles the shared container — without the host calling a per-mode hook in a
 * loop (which would trip `react-hooks/rules-of-hooks`).
 */
export interface PlacementDef {
  /** Stable id; the value stored as the surface mode. */
  id: string;
  /** Control tooltip / label. */
  label: string;
  /** Icon for the mode control. */
  icon: ComponentType<{ className?: string }>;
  /** Control order + default resolution (lowest order acts as default fallback). */
  order: number;
  /** Exactly one mode should set this — the registry's default (boot) mode. */
  default?: boolean;

  /**
   * Defer a closed tab's teardown by N ms while this mode is active, so this
   * mode's {@link PlacementDef.Chrome} can play an exit tween before the host
   * truly unmounts it. Omitted ⇒ instant unmount (docked / solo keep the current
   * behavior — a closed tab vanishes immediately).
   */
  exitDurationMs?: number;

  /** Static class applied to the stable per-tab container in this mode. */
  containerClassName: string;
  /** Render each container into `document.body` (escapes the backdrop, e.g. solo). */
  portalToBody?: boolean;
  /**
   * Paint EVERY tab in this mode, not just the focused one (windows mode). When
   * false (docked / solo) only the focused tab is painted; the rest stay mounted
   * (keep-alive) but hidden — so a non-focused tab can never overlap.
   */
  visibleWhenUnfocused?: boolean;

  /**
   * Optional sibling overlay. NEVER a parent of `TabSurface`. May push dynamic
   * inline container/inset style to the host via {@link usePlacementStyle} —
   * this is how floating's geometry box lives in the floating plugin, not the
   * shared host.
   */
  Chrome?: ComponentType<PlacementChromeProps>;
  /** Rendered once while this mode is active (e.g. desktop wallpaper). */
  Backdrop?: ComponentType;
  /**
   * Optional overlay rendered ONCE, ABOVE all tab containers, while this mode is
   * active. Symmetric with {@link PlacementDef.Backdrop} (which renders below).
   * Receives two id sets so it stays decoupled from the host:
   *  - `tabIds` — the LIVE tabs only (still in the store). Dock / cycle act on
   *    these, so a closing window's chip disappears immediately and it can't be
   *    cycled or docked while it plays its exit tween.
   *  - `retainedTabIds` — the LIVE + EXITING tabs (live plus those retained for
   *    an exit tween). Store-prune keys on this so a window is not pruned out from
   *    under its still-animating Chrome.
   */
  Foreground?: ComponentType<{ tabIds: string[]; retainedTabIds: string[] }>;

  // Capabilities consumed generically by apps-side chrome (no string compares):
  /** This mode's chrome wears the app theme (docked / solo). */
  themeScope?: "app";
  /** `+` reads as "new window" while the surface is in this mode (windows mode). */
  newTabFollows?: boolean;
}

/**
 * The single placement registry. Each placement sub-plugin contributes one
 * {@link PlacementDef}; `SurfaceBody` dispatches every open tab through the
 * matching descriptor, and the placement control derives its options from the
 * sorted contributions. `apps` never names a specific placement — it reads the
 * derived capabilities back through the apps-owned placement-capability registry.
 */
export const Surface = {
  Placement: defineSlot<PlacementDef>("apps.surface.placement"),
};

/**
 * The keep-alive style channel. The host (`TabContainer`) owns one stable
 * container per tab and provides this API; the *active* placement's {@link
 * PlacementDef.Chrome} consumes it to push dynamic inline style up to that
 * container — without remounting `TabSurface`.
 *
 * Intent: floating's `Chrome` calls {@link usePlacementStyle}, computes its
 * geometry box from its own hooks, and pushes it via `setContainerStyle` in a
 * `useLayoutEffect` (clearing it on cleanup so docked falls back to the host's
 * visibility gate). `setContentInsetStyle` pushes the titlebar inset; the
 * pointer-down-capture handler plumbs floating's raise-to-front.
 */
export interface PlacementStyleApi {
  /** Push (or clear, with `null`) the container's dynamic inline style. */
  setContainerStyle(style: CSSProperties | null): void;
  /** Push (or clear, with `null`) the content inset inside the container. */
  setContentInsetStyle(style: CSSProperties | null): void;
  /** Wire (or clear, with `null`) a pointer-down-capture on the container. */
  setContainerPointerDownCapture(
    handler: ((e: PointerEvent) => void) | null,
  ): void;
}

const PlacementStyleContext = createContext<PlacementStyleApi | null>(null);

/** Host wraps the active placement's `Chrome` with this to expose the channel. */
export function PlacementStyleProvider({
  value,
  children,
}: {
  value: PlacementStyleApi;
  children: ReactNode;
}): ReactNode {
  return createElement(PlacementStyleContext.Provider, { value }, children);
}

/**
 * Read the keep-alive style channel from inside a placement's `Chrome`. Throws
 * if used outside {@link PlacementStyleProvider} (a real bug — `Chrome` is only
 * ever rendered by the host inside the provider).
 */
export function usePlacementStyle(): PlacementStyleApi {
  const ctx = useContext(PlacementStyleContext);
  if (!ctx) {
    throw new Error("usePlacementStyle() called outside <PlacementStyleProvider>.");
  }
  return ctx;
}
