import { useEffect, useRef, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useConfig, useSetConfig, useConfigRegistrations, useScopeMembership } from "@plugins/config_v2/web";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { setConfigField, forkScope, deleteScope } from "@plugins/config_v2/core";
import { useCurrentAppId } from "@plugins/apps/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
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
    <Stack gap="md">
      <Stack direction="row" align="center" gap="md">
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible divider rule flanking a rigid centered label */}
        <div className="h-px flex-1 bg-border" />
        <span className="text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
          Theme
        </span>
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible divider rule flanking a rigid centered label */}
        <div className="h-px flex-1 bg-border" />
      </Stack>
      <Cluster gap="sm" justify="start">
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
      </Cluster>
    </Stack>
  );
}

// Pickers for pluggable-component variants (sidebar framing, progress bar, …),
// each registered via `ThemeEngine.VariantGroup`. Scope follows the surrounding
// `ThemeScopeProvider`, so a forked app edits its own variant selection.
function VariantGroupSection() {
  const groups = ThemeEngine.VariantGroup.useContributions();
  if (groups.length === 0) return null;
  return (
    <Stack gap="lg">
      <ThemeEngine.VariantGroup.Render>
        {(g) => (
          <Stack gap="xs">
            <Text variant="label">{g.componentLabel}</Text>
            <g.component />
          </Stack>
        )}
      </ThemeEngine.VariantGroup.Render>
    </Stack>
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
    <Grid cols={TOKEN_MODES.length} gap="xs">
      {TOKEN_MODES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`py-xs text-caption font-medium rounded-md border transition-colors ${
            mode === id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          {label}
        </button>
      ))}
    </Grid>
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
  // "Has its own theme" = this app is a member of the theme-engine config's scope
  // set (committed git scope OR runtime fork). The toggle now means membership.
  const forked = useScopeMembership(themeEngineConfig, scopeId);
  // Edits route to the app scope only once it has its own theme; else they target base.
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
        <Stack gap="lg">
          <Stack gap="lg" className="px-xl pt-lg">
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
          </Stack>
          <TokenModeContext.Provider value={tokenMode}>
            <ThemeCustomizer.Host search={search} />
          </TokenModeContext.Provider>
        </Stack>
      </ThemeScopeProvider>
    </PaneChrome>
  );
}
