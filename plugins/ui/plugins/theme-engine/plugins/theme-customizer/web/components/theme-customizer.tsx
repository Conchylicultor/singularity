import { useEffect, useRef, useState } from "react";
import { MdTune } from "react-icons/md";
import { PaneChrome, openPane } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { themeCustomizerPane } from "../panes";
import { ThemeCustomizer } from "../slots";
import {
  TokenModeContext,
  type TokenMode,
} from "../internal/token-mode-context";

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
      <div className="flex items-start justify-between gap-4">
        <GlobalPresetPicker />
        <button
          className="flex items-center gap-1.5 px-3 py-1 text-sm rounded-md border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors shrink-0"
          onClick={() => openPane(themeCustomizerPane, {}, { mode: "root" })}
        >
          <MdTune className="size-4" />
          Customize
        </button>
      </div>
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

const TOKEN_MODES: { id: TokenMode; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function TokenModeSelector({
  mode,
  onChange,
}: {
  mode: TokenMode;
  onChange: (m: TokenMode) => void;
}) {
  return (
    <div className="flex gap-1">
      {TOKEN_MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 py-1 text-xs font-medium rounded-md border transition-colors ${
            mode === id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ThemeCustomizerBody() {
  const [search, setSearch] = useState("");
  const [tokenMode, setTokenMode] = useState<TokenMode>("both");
  const originalDark = useRef(
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (tokenMode === "dark") {
      document.documentElement.classList.add("dark");
    } else if (tokenMode === "light") {
      document.documentElement.classList.remove("dark");
    }
  }, [tokenMode]);

  useEffect(() => {
    const wasDark = originalDark.current;
    return () => {
      document.documentElement.classList.toggle("dark", wasDark);
    };
  }, []);

  return (
    <PaneChrome pane={themeCustomizerPane} title="Theme Customizer">
      <div className="flex flex-col gap-4">
        <div className="px-6 pt-4 flex flex-col gap-4">
          <GlobalPresetPicker />
          <TokenModeSelector mode={tokenMode} onChange={setTokenMode} />
          <SearchInput
            placeholder="Filter sections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <TokenModeContext.Provider value={tokenMode}>
          <ThemeCustomizer.Host search={search} />
        </TokenModeContext.Provider>
      </div>
    </PaneChrome>
  );
}
