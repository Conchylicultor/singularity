import { useSyncExternalStore } from "react";

/**
 * The placement *capabilities* `apps`-side chrome needs to make routing
 * decisions — default placement, tear-off target, and the sets of placements
 * that follow the focused tab on `+` / wear the app theme — without `apps` ever
 * importing the `surface` plugin (which would cycle: `surface` → `apps`).
 *
 * This registry is **owned by `apps` but written by `surface`**: `surface`'s
 * body derives the capabilities from its `Surface.Placement` contributions and
 * calls {@link registerPlacementCapabilities}. The dependency direction stays
 * `surface → apps`. Until the first registration the getters return inert
 * sentinels (`""` / `undefined` / `false`) — an accepted one-frame seam on the
 * very first commit, before any user interaction.
 */
export interface PlacementCapabilities {
  /** The id of the default placement (the one a freshly opened tab gets). */
  defaultId: string;
  /** The placement a tab tears off into (chip dragged out of the strip). */
  tearOffId?: string;
  /** Placements for which `+` opens the new tab in the focused tab's placement. */
  newTabFollows: Set<string>;
  /** Placements whose focused chrome wears the app theme. */
  appThemeScope: Set<string>;
}

// Module-global latest snapshot, mirroring the `focusedPlacement` module-global
// + subscriber-set pattern in use-tabs.tsx. Written by surface via
// registerPlacementCapabilities; read by the getters/predicates and made
// reactive for useDefaultPlacement through useSyncExternalStore.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: this is the set of INSTALLED placement plugins (which placements exist, the default, the tear-off target), identical across every surface/window — not per-surface state. Registered once by the single surface body and read by chrome both inside and outside any surface tree, mirroring tabsNavigator/focusedPlacement in use-tabs.tsx, so it cannot be a per-surface scoped store.
let capabilities: PlacementCapabilities | null = null;
const subscribers = new Set<() => void>();

/**
 * Publish the latest placement capabilities. Called by the `surface` body in a
 * memo keyed on its contributions; notifies subscribers so
 * {@link useDefaultPlacement} re-renders when the registry first populates (or
 * the default changes).
 */
export function registerPlacementCapabilities(
  caps: PlacementCapabilities,
): void {
  capabilities = caps;
  for (const fn of subscribers) fn();
}

/**
 * Non-hook read of the default placement id — for plain-function callers (e.g.
 * `useTabs`'s open/seed paths). Returns `""` until `surface` registers.
 */
export function getDefaultPlacement(): string {
  return capabilities?.defaultId ?? "";
}

/**
 * Reactive read of the default placement id. Returns `""` until `surface`
 * registers, then re-renders consumers once the registry populates.
 */
export function useDefaultPlacement(): string {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => capabilities?.defaultId ?? "",
    () => capabilities?.defaultId ?? "",
  );
}

/**
 * The placement a torn-off tab (chip dragged out of the strip) lands in, or
 * `undefined` if no placement declares itself a tear-off target.
 */
export function tearOffPlacement(): string | undefined {
  return capabilities?.tearOffId;
}

/**
 * Whether `+` should open a new tab in placement `id` when the focused tab uses
 * it (the "new window" affordance). False until `surface` registers.
 */
export function placementIsNewTabFollows(id: string): boolean {
  return capabilities?.newTabFollows.has(id) ?? false;
}

/**
 * Whether the focused chrome wears the app theme when the focused tab uses
 * placement `id`. False until `surface` registers.
 */
export function placementHasAppThemeScope(id: string): boolean {
  return capabilities?.appThemeScope.has(id) ?? false;
}
