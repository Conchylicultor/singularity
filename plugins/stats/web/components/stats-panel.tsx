import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
          <Text as="div" variant="body" className="text-muted-foreground">No stats available.</Text>
        ) : (
          <Stats.Chart.Render>
            {(item) => (
              <section className="bg-card rounded-lg border p-4">
                <Text as="h2" variant="label" className="mb-4">{item.title}</Text>
                <item.component />
              </section>
            )}
          </Stats.Chart.Render>
        )}
      </div>
    </div>
  );
}
