import { Apps, useCurrentAppId } from "@plugins/apps/web";
import { MdAdd } from "react-icons/md";

function navigateToPath(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppGrid() {
  const apps = Apps.App.useContributions();
  const currentId = useCurrentAppId();
  const launchable = apps.filter((a) => a.id !== currentId);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {launchable.map((app) => (
        <button
          key={app.id}
          onClick={app.onClick ?? (() => navigateToPath(app.path))}
          className="group flex flex-col items-start gap-3 rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <app.icon className="size-6" />
          </span>
          <span className="text-sm font-medium text-foreground">
            {app.tooltip}
          </span>
        </button>
      ))}
      <NewAppCard />
    </div>
  );
}

function NewAppCard() {
  return (
    <button
      onClick={() => {}}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-11 items-center justify-center rounded-lg border border-dashed">
        <MdAdd className="size-6" />
      </span>
      <span className="text-sm font-medium">New app</span>
    </button>
  );
}
