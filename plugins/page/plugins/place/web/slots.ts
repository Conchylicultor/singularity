import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/**
 * The web half of a place provider — everything the BLOCK needs to talk about a
 * provider without knowing what it is. The server half (`definePlaceProvider`)
 * is a separate one-way registry; the two are joined only by the shared `id`
 * string, which is also what the block stores.
 *
 * `AccessAction` + `useReady` are what keep the block provider-blind: it can say
 * "this lookup is not usable yet" and render the control that fixes it, without
 * knowing whether the blocker is a missing key, an expired token, or a service
 * the user has not enabled.
 */
export interface PlaceProviderContribution {
  /** Must match the server-side `definePlaceProvider({ id })`. */
  id: string;
  /** Human name, used in the picker and in the card's "Open in …" link. */
  label: string;
  icon?: IconType;
  /**
   * Rendered in place of the search box when {@link useReady} says the provider
   * is not usable yet — the affordance that makes it usable, not a pointer at
   * Settings.
   */
  AccessAction?: ComponentType;
  /**
   * Reactive readiness ("is a credential configured"). Mirrors
   * `AuthScopeRequirement.useEnabled`. Omitted = always ready.
   *
   * Presence must be STABLE per contribution (declare it in the contribution
   * literal, never conditionally): the block branches on whether it exists to
   * keep both arms rules-of-hooks clean.
   */
  useReady?: () => boolean;
}

export const Place = {
  /**
   * Place-lookup sources contribute here. The block reads the whole set and
   * never names one: with a single provider registered it is used silently,
   * and a second one turns the block's empty state into a picker with no edit
   * to the block.
   */
  Provider: defineSlot<PlaceProviderContribution>({
    docLabel: (p) => p.label,
  }),
};
