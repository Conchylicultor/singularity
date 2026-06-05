import { useEffect } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { TooltipProvider } from "@plugins/primitives/plugins/tooltip/web";
import { PaneBasePathContext } from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { useActiveApp, usePathname } from "../internal/use-active-app";
import { AppRail } from "./app-rail";

/** Replace the URL and notify the router/pathname subscribers. */
function redirectTo(url: string) {
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

export function AppsLayout() {
  const activeApp = useActiveApp();
  const allApps = Apps.App.useContributions();
  const pathname = usePathname();

  const matchedId = activeApp?.id;
  const fallbackPath = allApps.find((a) => a.fallback)?.path;

  // `/` is no longer an app — it redirects to the Home launcher. Any other
  // root-relative path that matches no app (e.g. a server-generated `/c/:id`
  // notification link) is canonicalized into the fallback app's namespace, so
  // the namespace stays hardcoded only at the app registration.
  useEffect(() => {
    if (pathname === "/") {
      redirectTo("/home");
      return;
    }
    if (!matchedId && fallbackPath) {
      redirectTo(fallbackPath + pathname);
    }
  }, [pathname, matchedId, fallbackPath]);

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
