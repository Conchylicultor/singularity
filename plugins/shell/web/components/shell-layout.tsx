import { Shell } from "../slots";

export function ShellLayout() {
  const sidebars = Shell.Sidebar.useContributions();
  const mains = Shell.Main.useContributions();
  const toolbarItems = Shell.Toolbar.useContributions();
  const statusBarItems = Shell.StatusBar.useContributions();

  return (
    <div className="flex h-screen flex-col">
      {toolbarItems.length > 0 && (
        <header className="flex items-center border-b px-4 h-12">
          {toolbarItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-accent text-sm"
              onClick={item.onClick}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        {sidebars.length > 0 && (
          <aside className="w-64 border-r overflow-y-auto">
            {sidebars.map((pane) => (
              <pane.component key={pane.title} />
            ))}
          </aside>
        )}

        <main className="flex-1 overflow-hidden">
          {mains.map((panel) => (
            <panel.component key={panel.title} />
          ))}
        </main>
      </div>

      {statusBarItems.length > 0 && (
        <footer className="flex items-center border-t px-4 h-6 text-xs text-muted-foreground">
          {statusBarItems.map((item, i) => (
            <item.component key={i} />
          ))}
        </footer>
      )}
    </div>
  );
}
