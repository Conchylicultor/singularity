import { useSyncExternalStore } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { TooltipProvider } from "@plugins/primitives/plugins/tooltip/web";
import { PaneBasePathContext } from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { AppRail } from "./app-rail";

function usePathname(): string {
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

function appMatchesPath(appPath: string, pathname: string): boolean {
  if (appPath === "/") return true;
  return pathname === appPath || pathname.startsWith(appPath + "/");
}

export function AppsLayout() {
  const allApps = Apps.App.useContributions();
  const pathname = usePathname();

  const sorted = [...allApps].sort(
    (a, b) => b.path.length - a.path.length,
  );
  const activeApp = sorted.find((a) => appMatchesPath(a.path, pathname));

  if (!activeApp) {
    console.error(`No app matches pathname: ${pathname}`);
  }

  const basePath = activeApp?.path === "/" ? "" : (activeApp?.path ?? "");

  return (
    <TooltipProvider delay={300}>
      <div
        className="flex h-full min-h-0"
        style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
      >
        <AppRail activeAppId={activeApp?.id} />
        <div className="min-w-0 flex-1">
          {activeApp && (
            <PaneBasePathContext.Provider value={basePath}>
              {renderIsolated(
                Apps.App.id,
                activeApp as unknown as Contribution,
              )}
            </PaneBasePathContext.Provider>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
