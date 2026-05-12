import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";

export function AgentManagerLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Shell.Sidebar}
      toolbarSlot={Shell.Toolbar}
      header={
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (window.location.pathname === "/") return;
            history.pushState({}, "", "/");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src="/icon.svg" alt="Singularity" className="size-6" />
          <span className="text-base font-semibold tracking-tight">
            Singularity
          </span>
        </a>
      }
    />
  );
}
