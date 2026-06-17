import { useEffect, useRef, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useConfig, useSetConfig, useConfigRegistrations, useScopeForked } from "@plugins/config_v2/web";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { setConfigField, forkScope, deleteScope } from "@plugins/config_v2/core";
import { useCurrentAppId } from "@plugins/apps/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
          // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- fire-and-forget: applies a preset per token group; config live resource refreshes, re-pick to retry.
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
    <div className="flex flex-col gap-md">
      <div className="flex items-center gap-md">
        <div className="h-px flex-1 bg-border" />
        <span className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
          Theme
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-wrap gap-sm">
        {globalPresets.map((p) => (
          <button
            key={p.id}
            className={`px-lg py-sm text-label rounded-lg transition-colors ${
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

// Pickers for pluggable-component variants (sidebar framing, progress bar, …),
// each registered via `ThemeEngine.VariantGroup`. Scope follows the surrounding
// `ThemeScopeProvider`, so a forked app edits its own variant selection.
function VariantGroupSection() {
  const groups = ThemeEngine.VariantGroup.useContributions();
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-lg">
      <ThemeEngine.VariantGroup.Render>
        {(g) => (
          <div className="flex flex-col gap-xs">
            <Text variant="label">{g.componentLabel}</Text>
            <g.component />
          </div>
        )}
      </ThemeEngine.VariantGroup.Render>
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
    <div className="flex gap-xs">
      {TOKEN_MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 py-xs text-caption font-medium rounded-md border transition-colors ${
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
  const { mutate: deleteScopeMutation } = useEndpointMutation(deleteScope);
  const { mutate: forkScopeMutation } = useEndpointMutation(forkScope);
  const appLabel = appId.charAt(0).toUpperCase() + appId.slice(1);
  const onToggle = () => {
    if (forked) {
      deleteScopeMutation({ body: { scopeId } });
    } else {
      forkScopeMutation({ body: { scopeId } });
    }
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center justify-between gap-md px-md py-sm text-body rounded-md border transition-colors ${
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
        <div className="flex flex-col gap-lg">
          <div className="px-xl pt-lg flex flex-col gap-lg">
            {appId && scopeId && (
              <CustomizeForAppToggle
                appId={appId}
                scopeId={scopeId}
                forked={forked}
              />
            )}
            <VariantGroupSection />
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
