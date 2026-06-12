import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { densityConfig } from "../internal/config";
import { Density } from "../slots";

export function DensityPicker() {
  const presets = Density.Preset.useContributions();
  const { preset: activeId } = useConfig(densityConfig);
  const setConfig = useSetConfig(densityConfig);

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
          <span
            className="inline-flex border border-current rounded-sm bg-current/20"
            style={{
              padding: `${p.light.padChipY} ${p.light.padChipX}`,
            }}
          >
            <span className="size-1.5 rounded-full bg-current" />
          </span>
          {p.label}
        </button>
      ))}
    </Stack>
  );
}
