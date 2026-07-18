import { useSyncExternalStore } from "react";
import { useSurfaceAppId } from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { matchAppForPath } from "./resolve-app";
import { useFocusedAppId } from "./focused-app-store";

export type ActiveApp = ReturnType<typeof Apps.App.useContributions>[number];

export function usePathname(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("popstate", cb);
      window.addEventListener("shell:navigate", cb);
      return () => {
        window.removeEventListener("popstate", cb);
        window.removeEventListener("shell:navigate", cb);
      };
    },
    () => window.location.pathname,
    () => "/",
  );
}

/**
 * The active app for the current render context.
 *
 * - **Inside a `PaneSurfaceProvider`** (a tab/window surface), the active app is
 *   the surface's own owning app — looked up by id in the `Apps.App` registry.
 *   This is what makes per-app reads (theme/config scope, conversation-list
 *   highlight, launcher highlight) resolve to the surface they are rendered in,
 *   correct even when a second surface is concurrently visible.
 * - **Outside any surface** (e.g. the app rail, the floating bar), it derives
 *   from the FOCUSED TAB's app (the `focusedApp` module signal `TabsProvider`
 *   publishes) — NOT from parsing the URL. This is what keeps chrome (rail
 *   highlight, theme scope) in lockstep with what the focused surface actually
 *   shows: a back/forward that swaps the focused tab's app updates both from the
 *   one restore mutation, so the theme can never diverge from the content.
 * - **Before `TabsProvider` mounts** (the focused-app signal is still unset),
 *   it falls back to the registered app whose `path` best matches the current
 *   pathname (longest path wins, so `/studio` beats `/` for `/studio/foo`).
 *
 * The URL-driven canonicalization redirect must NOT use this — it needs the app
 * the URL resolves to, which is exactly `matchAppForPath(pathname)` (see
 * apps-layout).
 */
export function useActiveApp(): ActiveApp | undefined {
  const allApps = Apps.App.useContributions();
  const surfaceAppId = useSurfaceAppId();
  const focusedAppId = useFocusedAppId();
  const pathname = usePathname();
  if (surfaceAppId !== undefined) {
    return allApps.find((a) => a.id === surfaceAppId);
  }
  if (focusedAppId !== undefined) {
    return allApps.find((a) => a.id === focusedAppId);
  }
  return matchAppForPath(pathname, allApps);
}
