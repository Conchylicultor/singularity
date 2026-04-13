import { Stats } from "../slots";

export function StatsPanel() {
  const charts = Stats.Chart.useContributions();
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {charts.length === 0 ? (
          <div className="text-muted-foreground text-sm">No stats available.</div>
        ) : (
          charts.map((c) => (
            <section
              key={c.id}
              className="bg-card rounded-lg border p-4"
            >
              <h2 className="mb-4 text-sm font-medium">{c.title}</h2>
              <c.component />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
