import { useSyncExternalStore } from "react";
import { Reorder } from "@plugins/reorder/web";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Apps } from "../slots";
import { AppRail } from "./app-rail";

function usePathname(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("popstate", cb);
      return () => window.removeEventListener("popstate", cb);
    },
    () => window.location.pathname,
    () => "/",
  );
}

export function AppsLayout() {
  const appsArea = Reorder.useArea(Apps.App);
  const pathname = usePathname();

  const activeApp =
    appsArea.items.find((a) => a.isActive(pathname)) ?? appsArea.items[0];

  return (
    <TooltipProvider>
      <div
        className="flex h-full min-h-0"
        style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
      >
        <AppRail
          items={appsArea.items}
          activeAppId={activeApp?.id}
          DndWrapper={appsArea.DndWrapper}
          ReorderItem={appsArea.ReorderItem}
        />
        <div className="min-w-0 flex-1">
          {activeApp && <activeApp.component />}
        </div>
      </div>
    </TooltipProvider>
  );
}
