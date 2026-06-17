import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { navigate } from "@plugins/apps/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SidebarTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Shell } from "@plugins/shell/web";
import { SidebarReopenHandle } from "./sidebar-reopen-handle";

export function AgentManagerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Shell.Sidebar}
      header={
        // The toolbar that used to host the sidebar-collapse trigger is gone now
        // that the action bar lives globally in the tab bar. Keep the trigger in
        // the sidebar header next to the brand (a floating trigger over the main
        // area would overlap every pane's top-left title). When the sidebar is
        // collapsed, Cmd/Ctrl+B reopens it (bound globally by SidebarProvider).
        <div className="flex min-w-0 items-center gap-xs">
          <SidebarTrigger className="shrink-0" />
          <a
            href="/agents"
            onClick={(e) => {
              e.preventDefault();
              if (window.location.pathname === "/agents") return;
              navigate("/agents");
            }}
            className="flex min-w-0 items-center gap-sm rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/icon.svg" alt="Singularity" className="size-6 shrink-0" />
            <Text as="span" variant="subheading" className="truncate tracking-tight">
              Singularity
            </Text>
          </a>
        </div>
      }
    >
      <div className="relative h-full min-h-0">
        <SidebarReopenHandle />
        <MillerColumns />
      </div>
    </AppShellLayout>
  );
}
