import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

export function SidebarPalettePicker() {
  const presets = SidebarPalette.Preset.useContributions();
  const { preset: activeId } = useConfig(sidebarPaletteConfig) as { preset: string };
  const setConfig = useSetConfig(sidebarPaletteConfig);

  if (presets.length === 0) {
    return (
      <Text as="span" variant="body" className="text-muted-foreground">
        No presets available
      </Text>
    );
  }

  return (
    <Stack direction="row" gap="sm">
      {presets.map((p) => (
        <Stack
          as="button"
          direction="row"
          align="center"
          gap="sm"
          key={p.id}
          className={`px-md py-xs text-body rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("preset", p.id)}
        >
          <span
            className="size-3 rounded-full border border-border"
            style={{ backgroundColor: p.light.sidebar }}
          />
          {p.label}
        </Stack>
      ))}
    </Stack>
  );
}
