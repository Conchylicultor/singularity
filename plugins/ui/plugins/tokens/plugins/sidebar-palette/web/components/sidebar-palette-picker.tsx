import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
    <div className="flex gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-2 px-3 py-1.5 text-body rounded-md border transition-colors ${
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
        </button>
      ))}
    </div>
  );
}
