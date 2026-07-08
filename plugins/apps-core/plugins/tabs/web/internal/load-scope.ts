import {
  getDeferredLoadState,
  hasLoadErrorUnder,
} from "@plugins/framework/plugins/web-sdk/core";
import { asFsPath, type PluginId } from "@plugins/framework/plugins/plugin-id/core";

/**
 * Derive an app's fs plugin-path prefix (`apps/plugins/<app>/`) from its
 * `Apps.App` contribution's `_pluginId` (an app shell is `apps.<app>.shell` →
 * `apps/plugins/<app>/plugins/shell`; the app root is `apps/plugins/<app>/`, the
 * subtree all its deferred content lives under). Same convention as
 * `resolveActiveAppPrefix` in App.tsx. Returns "" for anything not under
 * `apps/plugins/` — an empty scope is always "healthy" (`hasLoadErrorUnder("")`
 * is false), so a load-error check against it never fires.
 *
 * The single home for this derivation, shared by `TabSurface` (which passes it to
 * `PaneSurfaceProvider` as the fallback surface's load scope) and `navigate()`
 * (which uses it to decide whether an unresolved cross-app link is a dead link or
 * a still-loading one).
 */
export function loadScopePrefixFor(pluginId: PluginId | undefined): string {
  if (!pluginId) return "";
  const m = /^(apps\/plugins\/[^/]+)\//.exec(asFsPath(pluginId));
  return m ? m[1] + "/" : "";
}

/**
 * The "settled-and-healthy ⇒ the link is dead" predicate for an UNRESOLVED
 * cross-app navigation: the deferred tier has fully settled AND nothing under the
 * target app's plugin subtree (`prefix`) failed to load, so the target pane will
 * never appear — the link is a genuine dead link (a stale link, or a pane that
 * loaded without registering). While loading, or when a plugin under `prefix`
 * failed, the pane may still arrive / the app is broken (error surface), so the
 * link is NOT dead and `navigate()` seeds a pending route instead of throwing.
 *
 * Single-sourced here (beside `loadScopePrefixFor`, which produces the `prefix`)
 * so the gating rule `navigate()` applies is a named, unit-testable decision
 * rather than an inline boolean.
 */
export function isDeadUnresolvedLink(prefix: string): boolean {
  return getDeferredLoadState().deferredComplete && !hasLoadErrorUnder(prefix);
}
