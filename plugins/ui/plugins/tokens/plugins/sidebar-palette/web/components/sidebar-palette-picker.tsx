import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

const PLUGIN_ID = "ui-tokens-sidebar-palette";
const FULL_KEY = `${PLUGIN_ID}.preset`;

export function SidebarPalettePicker() {
  const presets = SidebarPalette.Preset.useContributions();
  const { preset: activeId } = useConfigValues(
    sidebarPaletteConfig,
    PLUGIN_ID,
  );

  if (presets.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        No presets available
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfigValue(FULL_KEY, p.id)}
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
