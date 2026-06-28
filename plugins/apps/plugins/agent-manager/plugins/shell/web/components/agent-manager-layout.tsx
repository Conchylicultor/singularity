import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
      }
    >
      <div className="h-full min-h-0">
        <MillerColumns />
      </div>
    </AppShellLayout>
  );
}
