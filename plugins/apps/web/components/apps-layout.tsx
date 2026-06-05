import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { TooltipProvider } from "@plugins/primitives/plugins/tooltip/web";
import { PaneBasePathContext } from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { useActiveApp } from "../internal/use-active-app";
import { AppRail } from "./app-rail";

export function AppsLayout() {
  const activeApp = useActiveApp();

  if (!activeApp) {
    console.error(`No app matches pathname: ${window.location.pathname}`);
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
