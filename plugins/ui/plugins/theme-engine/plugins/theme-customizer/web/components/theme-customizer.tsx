import { useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { themeCustomizerPane } from "../panes";
import { ThemeCustomizer } from "../slots";

const PLUGIN_ID = "ui-theme-engine";

function GlobalPresetPicker() {
  const globalPresets = ThemeEngine.GlobalPreset.useContributions();
  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const { globalPreset: activeId } = useConfigValues(
    themeEngineConfig,
    PLUGIN_ID,
  );

  if (globalPresets.length === 0) return null;

  const handleChange = (presetId: string) => {
    void setConfigValue(`${PLUGIN_ID}.globalPreset`, presetId);
    const preset = globalPresets.find((p) => p.id === presetId);
    if (!preset) return;
    for (const [groupId, groupPresetId] of Object.entries(preset.groups)) {
      const group = tokenGroups.find((g) => g.id === groupId);
      if (group && groupPresetId) {
        void setConfigValue(`${group.pluginId}.preset`, groupPresetId);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Theme
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-wrap gap-2">
        {globalPresets.map((p) => (
          <button
            key={p.id}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              p.id === activeId
                ? "border-2 border-primary bg-primary/10 text-primary"
                : "border border-border text-muted-foreground hover:border-primary/50 bg-muted/20"
            }`}
            onClick={() => handleChange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeCustomizerBody() {
  const [search, setSearch] = useState("");

  return (
    <PaneChrome pane={themeCustomizerPane} title="Theme Customizer">
      <div className="flex flex-col gap-4 overflow-y-auto h-full">
        <div className="px-6 pt-4 flex flex-col gap-4">
          <GlobalPresetPicker />
          <SearchInput
            placeholder="Filter sections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ThemeCustomizer.Host search={search} />
      </div>
    </PaneChrome>
  );
}
