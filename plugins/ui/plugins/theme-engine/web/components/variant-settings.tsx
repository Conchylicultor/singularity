import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { themeEngineConfig } from "../../shared";
import { ThemeEngine } from "../slots";

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
      <div className="flex gap-2">
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

export function VariantSettings() {
  const groups = ThemeEngine.VariantGroup.useContributions();
  const globalPresets = ThemeEngine.GlobalPreset.useContributions();

  if (groups.length === 0 && globalPresets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pluggable components registered.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GlobalPresetPicker />
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.componentId}>
              <h4 className="text-sm font-medium mb-1">{g.componentLabel}</h4>
              <g.component />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
