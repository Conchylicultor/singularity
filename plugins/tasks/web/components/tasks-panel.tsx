import { Tasks } from "../slots";

export function TasksPanel() {
  const panels = Tasks.PanePanel.useContributions();
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {panels.length === 0 ? (
          <div className="text-muted-foreground text-sm">No tasks yet.</div>
        ) : (
          panels.map((p) => (
            <section key={p.id} className="bg-card rounded-lg border p-4">
              <h2 className="mb-4 text-sm font-medium">{p.title}</h2>
              <p.component />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
