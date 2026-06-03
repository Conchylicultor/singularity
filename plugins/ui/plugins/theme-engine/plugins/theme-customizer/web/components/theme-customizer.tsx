import { useEffect, useRef, useState } from "react";
import { MdTune } from "react-icons/md";
import { PaneChrome, openPane } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useConfig, useSetConfig, useConfigRegistrations, useScopeForked } from "@plugins/config_v2/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setConfigField, forkScope, deleteScope } from "@plugins/config_v2/core";
import { useCurrentAppId } from "@plugins/apps/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeEngine, ThemeScopeProvider, useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { themeCustomizerPane } from "../panes";
import { ThemeCustomizer } from "../slots";
import {
  TokenModeContext,
  type TokenMode,
} from "../internal/token-mode-context";

function GlobalPresetPicker() {
  const scopeId = useThemeScopeId();
  const globalPresets = ThemeEngine.GlobalPreset.useContributions();
  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const { globalPreset: activeId } = useConfig(themeEngineConfig, { scopeId });
  const setThemeEngineConfig = useSetConfig(themeEngineConfig, { scopeId });
  const registrations = useConfigRegistrations();

  if (globalPresets.length === 0) return null;

  const handleChange = (presetId: string) => {
    setThemeEngineConfig("globalPreset", presetId);
    const preset = globalPresets.find((p) => p.id === presetId);
    if (!preset) return;
    for (const [groupId, groupPresetId] of Object.entries(preset.groups)) {
      const group = tokenGroups.find((g) => g.id === groupId);
      if (group && groupPresetId) {
        const reg = registrations.find((r) => r.descriptor === group.configDescriptor);
        if (reg) {
          void fetchEndpoint(setConfigField, {}, {
            body: scopeId
              ? { storePath: reg.storePath, key: "preset", value: groupPresetId, scopeId }
              : { storePath: reg.storePath, key: "preset", value: groupPresetId },
          });
        }
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
          <ThemeEngine.VariantGroup.Render>
            {(g) => (
              <div>
                <h4 className="text-sm font-medium mb-1">{g.componentLabel}</h4>
                <g.component />
              </div>
            )}
          </ThemeEngine.VariantGroup.Render>
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

// "Customize for this app" toggle. OFF→ON forks the whole `scope: "app"` set so
// edits diverge from base; ON→OFF un-forks and the app tracks base live again.
// Hidden when no app is active (appId undefined). Labels with the app name.
function CustomizeForAppToggle({
  appId,
  scopeId,
  forked,
}: {
  appId: string;
  scopeId: string;
  forked: boolean;
}) {
  const appLabel = appId.charAt(0).toUpperCase() + appId.slice(1);
  const onToggle = () => {
    if (forked) {
      void fetchEndpoint(deleteScope, {}, { body: { scopeId } });
    } else {
      void fetchEndpoint(forkScope, {}, { body: { scopeId } });
    }
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-md border transition-colors ${
        forked
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      <span className="font-medium">Customize for {appLabel}</span>
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          forked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block size-3 rounded-full bg-background transition-transform ${
            forked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function ThemeCustomizerBody() {
  const [search, setSearch] = useState("");
  const [tokenMode, setTokenMode] = useState<TokenMode>("both");
  const originalDark = useRef(
    document.documentElement.classList.contains("dark"),
  );

  const appId = useCurrentAppId();
  const scopeId = appId ? `app:${appId}` : undefined;
  const forked = useScopeForked(scopeId);
  // Edits route to the app scope only once forked; otherwise they target base.
  const effectiveScopeId = forked && scopeId ? scopeId : undefined;

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
      <ThemeScopeProvider scopeId={effectiveScopeId}>
        <div className="flex flex-col gap-4">
          <div className="px-6 pt-4 flex flex-col gap-4">
            {appId && scopeId && (
              <CustomizeForAppToggle
                appId={appId}
                scopeId={scopeId}
                forked={forked}
              />
            )}
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
      </ThemeScopeProvider>
    </PaneChrome>
  );
}
