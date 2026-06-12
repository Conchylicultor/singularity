import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { chartConfig } from "../internal/config";
import { Chart } from "../slots";

const KEYS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export function ChartPicker() {
  const presets = Chart.Preset.useContributions();
  const { preset: activeId } = useConfig(chartConfig);
  const setConfig = useSetConfig(chartConfig);

  if (presets.length === 0) {
    return (
      <Text variant="body" tone="muted">
        No presets available
      </Text>
    );
  }

  return (
    <Stack direction="row" gap="sm">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-sm px-md py-xs text-body rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("preset", p.id)}
        >
          <span className="flex gap-2xs">
            {KEYS.map((k) => (
              <span
                key={k}
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: p.light[k] }}
              />
            ))}
          </span>
          {p.label}
        </button>
      ))}
    </Stack>
  );
}
