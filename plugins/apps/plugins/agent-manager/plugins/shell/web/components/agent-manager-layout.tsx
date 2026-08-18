import type React from "react";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { currentRoutePath } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Shell } from "@plugins/shell/web";

export function AgentManagerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Shell.Sidebar}
      header={
        // The sidebar-collapse trigger now lives in the first miller column's
        // header (provided by AppShellLayout via SurfaceChromeContext), so it
        // works whether the sidebar is open or collapsed. The header keeps only
        // the brand; Cmd/Ctrl+B still toggles the sidebar globally.
        <Line
          as="a"
          href="/agents"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            if (currentRoutePath() === "/agents") return;
            navigate("/agents");
          }}
          className="gap-sm rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src="/icon.svg"
            alt="Singularity"
            className={cn("size-6", rigidClass())}
          />
          <Fill>
            <Text as="span" variant="subheading" className="tracking-tight">
              Singularity
            </Text>
          </Fill>
        </Line>
      }
    >
      <div className="h-full min-h-0">
        <MillerColumns />
      </div>
    </AppShellLayout>
  );
}
