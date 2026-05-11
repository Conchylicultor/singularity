import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Reorder } from "@plugins/reorder/web";
import { TooltipProvider } from "@plugins/primitives/plugins/tooltip/web";
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
  const appsArea = Reorder.useArea(Apps.App);
  const pathname = usePathname();

  const sorted = [...appsArea.items].sort(
    (a, b) => b.path.length - a.path.length,
  );
  const activeApp = sorted.find((a) => appMatchesPath(a.path, pathname));

  if (!activeApp) {
    console.error(`No app matches pathname: ${pathname}`);
  }

  return (
    <TooltipProvider delay={300}>
      <div
        className="flex h-full min-h-0"
        style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
      >
        <AppRail
          items={appsArea.items}
          activeAppId={activeApp?.id}
          DndWrapper={appsArea.DndWrapper}
          ReorderItem={appsArea.ReorderItem as ComponentType<{ item: (typeof appsArea.items)[number]; children: ReactNode }>}
        />
        <div className="min-w-0 flex-1">
          {activeApp && <activeApp.component />}
        </div>
      </div>
    </TooltipProvider>
  );
}
