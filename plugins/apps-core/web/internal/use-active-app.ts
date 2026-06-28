import { useSyncExternalStore } from "react";
import { useSurfaceAppId } from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { matchAppForPath } from "./resolve-app";

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
 * - **Outside any surface** (e.g. the app rail, the floating bar), it falls back
 *   to the registered app whose `path` best matches the current pathname
 *   (longest path wins, so `/studio` beats `/` for `/studio/foo`) — the focused
 *   window's app, which is exactly what those chrome consumers want.
 */
export function useActiveApp(): ActiveApp | undefined {
  const allApps = Apps.App.useContributions();
  const surfaceAppId = useSurfaceAppId();
  const pathname = usePathname();
  if (surfaceAppId !== undefined) {
    return allApps.find((a) => a.id === surfaceAppId);
  }
  return matchAppForPath(pathname, allApps);
}
