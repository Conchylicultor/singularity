import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Stats } from "../slots";
import { StatsProvider, useShowEmptyDays } from "./stats-context";

export function StatsPanel() {
  return (
    <StatsProvider>
      <StatsContent />
    </StatsProvider>
  );
}

function StatsContent() {
  const charts = Stats.Chart.useContributions();
  const { showEmptyDays, setShowEmptyDays } = useShowEmptyDays();

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex justify-end gap-2">
          <ToggleChip as="a" href="/debug/profiling" active={false}>
            Profiling
          </ToggleChip>
          <ToggleChip
            active={showEmptyDays}
            onClick={() => setShowEmptyDays(!showEmptyDays)}
            title={
              showEmptyDays
                ? "Showing all days — click to skip empty days"
                : "Skipping empty days — click to show all days"
            }
          >
            Show empty days
          </ToggleChip>
        </div>
        {charts.length === 0 ? (
          <div className="text-muted-foreground text-sm">No stats available.</div>
        ) : (
          <Stats.Chart.Render>
            {(item) => (
              <section className="bg-card rounded-lg border p-4">
                <h2 className="mb-4 text-sm font-medium">{item.title}</h2>
                <item.component />
              </section>
            )}
          </Stats.Chart.Render>
        )}
      </div>
    </div>
  );
}
