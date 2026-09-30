import type { ComponentType, ReactNode } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { MapOverlay, MapPin } from "../core";
import { DefaultPin } from "./components/default-pin";

/** What a renderer is handed. Pins arrive pre-rendered through {@link MapRendererProps.renderPin}. */
export interface MapRendererProps {
  /** Never empty: the host shows its empty state instead of mounting a renderer. */
  overlays: readonly MapOverlay[];
  /**
   * The React content of one pin — `GeoMap.Pin`'s dispatch, already isolated.
   * A renderer places it; it never draws a pin of its own.
   */
  renderPin: (pin: MapPin, active: boolean) => ReactNode;
  /** A pin was clicked. */
  onActivate: (id: string) => void;
  activeId: string | null;
}

/**
 * Whether a renderer can draw right now. Three states, not a boolean: while the
 * renderer's configuration is still loading the host shows a loading state —
 * never the set-up action, which would claim "nothing is configured" and then
 * reverse itself.
 */
export type MapRendererReadiness = "pending" | "ready" | "blocked";

/**
 * A map engine. The host picks the first contribution; the rest of the app
 * never names one, so the vendor lives in exactly one plugin.
 *
 * `AccessAction` + `useReadiness` are `Place.Provider`'s contract, widened to
 * three states: the host can say "this map is not usable yet" and render the
 * control that fixes it, without knowing whether the blocker is a key, a
 * token, or a service the user has not enabled.
 */
export interface MapRendererContribution {
  id: string;
  /** Human name of the engine. */
  label: string;
  component: ComponentType<MapRendererProps>;
  /** Rendered in place of the map while {@link useReadiness} says `blocked`. */
  AccessAction?: ComponentType;
  /**
   * Reactive readiness. Omitted = always ready.
   *
   * Presence must be STABLE per contribution (declare it in the contribution
   * literal, never conditionally): the host branches on whether it exists to
   * keep both arms rules-of-hooks clean.
   */
  useReadiness?: Hook<() => MapRendererReadiness>;
}

/** What a pin component receives. */
export interface MapPinProps {
  pin: MapPin;
  /** The pin is the selected one — grow and raise it. */
  active: boolean;
}

export const GeoMap = {
  /**
   * Map engines contribute here. First contribution wins; none at all is a
   * loud "no map renderer installed" state, not a blank box.
   */
  Renderer: defineSlot<MapRendererContribution>({
    docLabel: (r) => r.label,
  }),
  /**
   * Pin appearance, keyed on `pin.pinType`. The layer that makes a pin picks
   * its type; the plugin that owns that type contributes how it looks. An
   * unclaimed type falls back to a neutral dot.
   */
  Pin: defineDispatchSlot<MapPinProps, string>({
    key: (props) => props.pin.pinType,
    fallback: DefaultPin,
  }),
};
