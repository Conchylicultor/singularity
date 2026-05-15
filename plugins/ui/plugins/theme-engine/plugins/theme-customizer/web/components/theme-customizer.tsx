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
    <div>
      <h4 className="text-sm font-medium mb-2">Theme</h4>
      <div className="flex flex-wrap gap-2">
        {globalPresets.map((p) => (
          <button
            key={p.id}
            className={`px-3 py-1 text-sm rounded-md border transition-colors ${
              p.id === activeId
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
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
