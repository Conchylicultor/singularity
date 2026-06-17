import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { colorPaletteConfig } from "../internal/config";
import { ColorPalette } from "../slots";

export function ColorPalettePicker() {
  const presets = ColorPalette.Preset.useContributions();
  const { preset: activeId } = useConfig(colorPaletteConfig);
  const setConfig = useSetConfig(colorPaletteConfig);

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
            className="size-3 rounded-full border border-border"
            style={{ backgroundColor: p.light.primary }}
          />
          {p.label}
        </button>
      ))}
    </Stack>
  );
}
