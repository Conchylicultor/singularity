import { useSyncExternalStore } from "react";
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
 * The registered app whose `path` best matches the current pathname
 * (longest path wins, so `/studio` beats `/` for `/studio/foo`). Shared by the
 * app switcher layout and any consumer that needs to know the active app
 * (e.g. the floating bar, which hides on the app that hosts the toolbar).
 */
export function useActiveApp(): ActiveApp | undefined {
  const allApps = Apps.App.useContributions();
  const pathname = usePathname();
  return matchAppForPath(pathname, allApps);
}
