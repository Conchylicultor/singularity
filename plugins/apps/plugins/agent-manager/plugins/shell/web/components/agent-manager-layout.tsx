import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";

export function AgentManagerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Shell.Sidebar}
      toolbarSlot={Shell.Toolbar}
      header={
        <a
          href="/agents"
          onClick={(e) => {
            e.preventDefault();
            if (window.location.pathname === "/agents") return;
            history.pushState({}, "", "/agents");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src="/icon.svg" alt="Singularity" className="size-6 shrink-0" />
          <span className="truncate text-base font-semibold tracking-tight">
            Singularity
          </span>
        </a>
      }
    />
  );
}
