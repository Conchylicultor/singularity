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
  onClose: () => void;
  /** Switch this tab to the registry default placement (e.g. solo's exit). */
  onExitToDefault: () => void;
}

/**
 * A placement descriptor — the contribution to {@link Surface.Placement}. Each
 * placement (docked / floating / solo …) is a self-contained sub-plugin that
 * contributes exactly one of these. Almost all of it is *data*: the host
 * (`SurfaceBody`) keeps one stable container per tab and only varies the
 * descriptor's class / portal / chrome, so a placement change re-positions the
 * still-mounted tab rather than remounting it (keep-alive).
 *
 * The optional {@link PlacementDef.Chrome} is the escape hatch for dynamic,
 * hook-derived presentation (floating's geometry box): it runs its own hooks and
 * pushes inline style up to the host-owned container via
 * {@link usePlacementStyle}, so the dynamic style lives in the placement plugin
 * yet styles the shared container — without the host calling a per-placement
 * hook in a loop (which would trip `react-hooks/rules-of-hooks`).
 */
export interface PlacementDef {
  /** Stable id; also the value stored on `tab.placement`. */
  id: string;
  /** Control tooltip / label. */
  label: string;
  /** Icon for the placement control. */
  icon: ComponentType<{ className?: string }>;
  /** Control order + default resolution (lowest order acts as default fallback). */
  order: number;
  /** Exactly one placement should set this — the registry's default placement. */
  default?: boolean;

  /** Static class applied to the stable per-tab container. */
  containerClassName: string;
  /** Render the container into `document.body` (escapes the backdrop, e.g. solo). */
  portalToBody?: boolean;
  /** Keep this placement's tab painted even when unfocused (floating windows). */
  visibleWhenUnfocused?: boolean;

  /**
   * Optional sibling overlay. NEVER a parent of `TabSurface`. May push dynamic
   * inline container/inset style to the host via {@link usePlacementStyle} —
   * this is how floating's geometry box lives in the floating plugin, not the
   * shared host.
   */
  Chrome?: ComponentType<PlacementChromeProps>;
  /** Rendered once whenever >= 1 tab uses this placement (e.g. desktop wallpaper). */
  Backdrop?: ComponentType;
  /**
   * Optional overlay rendered ONCE, ABOVE all tab containers, whenever >= 1 open
   * tab uses this placement. Symmetric with {@link PlacementDef.Backdrop} (which
   * renders below). Receives the open tabIds resolving to this placement so it
   * stays decoupled from the host's placement-resolution.
   */
  Foreground?: ComponentType<{ tabIds: string[] }>;

  // Capabilities consumed generically by apps-side chrome (no string compares):
  /** Focused tab in this placement => chrome wears the app theme. */
  themeScope?: "app";
  /** Dragging a chip out of the strip lands the tab in this placement. */
  tearOffTarget?: boolean;
  /** `+` opens the new tab in this placement when the focused tab uses it. */
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
