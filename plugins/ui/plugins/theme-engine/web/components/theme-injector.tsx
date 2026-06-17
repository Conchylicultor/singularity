import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { useConfig, useScopeForked } from "@plugins/config_v2/web";
import { useActiveApp, Apps } from "@plugins/apps/web";
import {
  appThemeScope,
  themeScopeSelectors,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResolvedColorMode, type ColorMode } from "../use-color-mode";
import { themeEngineConfig } from "../../core";
import { persistActiveForkedScope } from "../internal/active-scope-storage";
import { ThemeScopeProvider } from "./theme-scope-context";
import { ThemeEngine, useTokenGroupPresets } from "../slots";
import type {
  TokenGroupContribution,
  ColorAdjustment,
  ColorTransformContribution,
} from "../slots";
import { transformValues } from "../internal/transform";
import { mergeGroupValues } from "../internal/merge-group-values";
import { renderGroupBlock } from "../internal/serialize-vars";
import { type CachedColorMode } from "../internal/theme-cache";
import {
  claimPaintStyle,
  releasePaintStyle,
  reportPaintStyle,
  setPaintContext,
} from "../internal/paint-cache-aggregator";

// styleId for a token group's <style>, shared by the runtime injector, the
// localStorage cache, and the pre-paint replay script (web-core/index.html).
const styleIdFor = (groupId: string) => `theme-engine-${groupId}`;

const DEFAULT_ADJUSTMENT: ColorAdjustment = {
  hueShift: 0,
  saturationScale: 1,
  lightnessScale: 1,
};
export const ColorAdjustContext =
  createContext<ColorAdjustment>(DEFAULT_ADJUSTMENT);

function assertComplete(
  group: TokenGroupContribution,
  light: Record<string, string>,
  dark: Record<string, string>,
): void {
  const keys = Object.keys(group.descriptor.schema);
  const missingIn = (values: Record<string, string>) =>
    keys.filter((k) => values[k] === undefined || values[k] === "");
  const missingLight = missingIn(light);
  const missingDark = missingIn(dark);
  if (missingLight.length === 0 && missingDark.length === 0) return;
  const parts: string[] = [];
  if (missingLight.length) parts.push(`light: ${missingLight.join(", ")}`);
  if (missingDark.length) parts.push(`dark: ${missingDark.join(", ")}`);
  throw new Error(
    `Token group "${group.id}" produced incomplete values after merge — ` +
      `missing/empty schema keys (${parts.join("; ")}). Every declared token ` +
      `must resolve in both modes; check the schema defaults and any resolve() path.`,
  );
}

function WithAdjustment({
  contrib,
  children,
}: {
  contrib: ColorTransformContribution;
  children: React.ReactNode;
}) {
  const adj = contrib.useAdjustment();
  return (
    <ColorAdjustContext.Provider value={adj}>
      {children}
    </ColorAdjustContext.Provider>
  );
}

function GroupStyle({
  group,
  scopeId,
  scopeToken,
}: {
  group: TokenGroupContribution;
  scopeId?: string;
  // When set, this GroupStyle emits a *scoped* override block targeting
  // `[data-theme-scope="<scopeToken>"]` instead of global `:root`/`.dark` (e.g.
  // `"app:home"` for one forked app's subtree). Scoped blocks use a distinct
  // `theme-scope-` style id; both scoped and unscoped blocks feed the pre-paint
  // cache aggregator so a warm reload paints every visible surface (the desktop
  // `:root` + each forked app's scope) on frame 0.
  scopeToken?: string;
}) {
  const adjustment = useContext(ColorAdjustContext);
  const state = useTokenGroupPresets(group.id);
  const config = useConfig(group.configDescriptor, { scopeId }) as {
    preset: string;
    overrides: Record<string, unknown>;
  };
  // While a dynamic preset source is still loading, inject NOTHING — falling
  // back to the default preset here would overwrite the pre-paint replayed CSS
  // (same ids, adopted in place) with wrong values for one window. The styles
  // replayed by index.html stay authoritative until the sources resolve; in
  // practice they resolve pre-render via Core.Boot hydration (see tweakcn's
  // boot task). Once resolved, a missing preset id (genuinely deleted) falls
  // back to the first preset, as before.
  const active = state.pending
    ? null
    : (state.presets.find((p) => p.id === config.preset) ??
      state.presets[0] ??
      null);

  const { mergedLight, mergedDark } = useMemo(() => {
    if (!active) return { mergedLight: null, mergedDark: null };

    let mergedLight: Record<string, string>;
    let mergedDark: Record<string, string>;

    if (group.resolve) {
      const resolved = group.resolve(active, config.overrides);
      mergedLight = resolved.light;
      mergedDark = resolved.dark;
    } else {
      const merged = mergeGroupValues(
        group.descriptor.schema,
        active,
        config.overrides as {
          light?: Record<string, string>;
          dark?: Record<string, string>;
        },
      );
      mergedLight = merged.light;
      mergedDark = merged.dark;
    }

    // Loud completeness backstop: every declared token var must resolve in
    // both modes. With schema defaults as the merge base this never fires for
    // sparse presets (by construction) — it catches developer bugs: an empty
    // schema `default`, or a `resolve` path dropping a key.
    assertComplete(group, mergedLight, mergedDark);

    return { mergedLight, mergedDark };
  }, [active, config.overrides, group]);

  useLayoutEffect(() => {
    if (!mergedLight || !mergedDark) return;
    // Scoped overrides get a distinct `theme-scope-` id; the global path keeps the
    // `theme-engine-` id the pre-paint replay and cache rely on. Both id families
    // feed the aggregator and the claim-based prune set.
    const id = scopeToken ? `theme-scope-${scopeToken}-${group.id}` : styleIdFor(group.id);
    // Adopt the replay-injected element in place (by id) before any prune pass.
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    const text = renderGroupBlock(
      group.descriptor,
      transformValues(mergedLight, adjustment),
      transformValues(mergedDark, adjustment),
      scopeToken ? themeScopeSelectors(scopeToken) : undefined,
    );
    el.textContent = text;
    // Claim this id so the prune pass keeps the element, and feed the pre-paint
    // cache (both scoped and unscoped blocks).
    claimPaintStyle(id);
    reportPaintStyle(id, text);
    return () => {
      el.remove();
      releasePaintStyle(id);
      reportPaintStyle(id, null);
    };
  }, [mergedLight, mergedDark, group.descriptor, group.id, adjustment, scopeToken]);

  return null;
}

// Toggles the single global `<html>.dark` class from the desktop (global,
// unscoped) resolved color mode. Color mode is a single global class — no
// per-app DOM scoping (per-scope dark is deferred) — and now follows the
// desktop config, so switching the focused app never flips light/dark. The
// resolution itself lives in useResolvedColorMode so the class and prop-themed
// components never drift.
function ColorModeApplier({ resolved }: { resolved: ColorMode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return null;
}

export function ThemeInjector() {
  const active = useActiveApp();
  const appId = active?.id;
  const activeScopeId = appId ? `app:${appId}` : undefined;

  // Persist the active app's scope (only when forked) so the pre-paint boot task
  // can re-hydrate it on a hard reload and avoid the one-frame flash of global
  // theme. See active-scope-storage. The active scope is used ONLY for cache
  // keying + boot rehydrate — the `:root`/`.dark` blocks below are fed by the
  // global (unscoped) config so the desktop theme is focus-independent.
  const forked = useScopeForked(activeScopeId);
  useEffect(() => {
    persistActiveForkedScope(activeScopeId, forked);
  }, [activeScopeId, forked]);

  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();
  // Desktop (global, unscoped) color mode — focus-independent like the rest of
  // `:root`. Per-scope dark is deferred; `<html>.dark` stays a single global class.
  const resolved = useResolvedColorMode(undefined);
  // The CONFIGURED color mode (not the resolved light/dark) is what the cache
  // stores, so the pre-paint script can re-resolve "system" against live
  // matchMedia each load. The live `.dark` class still uses `resolved` above.
  const { colorMode } = useConfig(themeEngineConfig, { scopeId: undefined }) as {
    colorMode: CachedColorMode;
  };
  const appPath = active?.path;

  // Feed the active paint context to the module-level aggregator, which collects
  // EVERY GroupStyle's CSS text (the desktop `:root`/`.dark` and every forked
  // app's scope) and writes the per-app-path localStorage envelope the pre-paint
  // script in web-core/index.html replays before first paint — so a warm reload
  // paints every visible surface themed on frame 0. The aggregator owns the
  // debounced microtask flush and the claim-based stale-element prune (both
  // global and scoped ids). The context is set in the render body (not an
  // effect) so it is current before the flush microtask. `forked` keys the boot
  // re-hydration of the active forked scope. See paint-cache-aggregator and
  // theme-cache.
  setPaintContext({ appPath, mode: colorMode, forked });

  // The `:root`/`.dark` blocks render the desktop (global, unscoped) config, so
  // the base theme never tracks the focused app. Forked apps add their own
  // override block via AppScopeThemes below.
  const groupStyles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={undefined} />
  ));

  const firstTransform = colorTransforms[0];
  const content = firstTransform ? (
    <WithAdjustment contrib={firstTransform}>{groupStyles}</WithAdjustment>
  ) : (
    <>{groupStyles}</>
  );

  // The `:root` blocks are unscoped (desktop), so slot-contributed reads that
  // resolve via useThemeScopeId() (e.g. the color-adjust ColorTransform's
  // useAdjustment) read the global value here. GroupStyle gets scopeId directly.
  return (
    <ThemeScopeProvider scopeId={undefined}>
      <ColorModeApplier resolved={resolved} />
      {content}
    </ThemeScopeProvider>
  );
}

// Scoped sibling of ThemeInjector for a single app id, emitted ONLY when that app
// is forked. With `:root` now carrying the desktop (global) theme, an unforked
// app's theme IS the `:root` theme — so it needs no override block and this
// returns null. A forked app writes a purely *additive* override block targeting
// `[data-theme-scope="app:<id>"]`, so its subtree shows ITS app's theme while the
// desktop `:root` (chrome, backdrop, portals) keeps the base one.
//
// It reuses the same preset resolution, merge, color-transform adjustment, and
// completeness backstop as the global path (all live inside GroupStyle /
// WithAdjustment) — only the selector and style id differ (via `scopeToken`).
// Its GroupStyle children feed the pre-paint cache aggregator (under their
// `theme-scope-app:<id>-<group>` ids) just like the global path, so a warm
// reload paints this app's scope on frame 0. Deliberately omits ColorModeApplier
// (light/dark stays global) and the active-scope-storage side effect (owned by
// ThemeInjector).
//
// Mounted centrally (one per registered app via AppScopeThemes at Core.Root),
// not per open surface — so the degraded `AppTabsBody` fallback and the real
// surface share the same scope blocks, with no `apps → theme-engine` cycle.
export function ScopedAppTheme({ appId }: { appId: string }) {
  const scopeId = appThemeScope(appId);
  const forked = useScopeForked(scopeId);
  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();

  // Unforked apps inherit the desktop `:root` theme — no override block needed.
  if (!forked) return null;

  const styles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={scopeId} scopeToken={appThemeScope(appId)} />
  ));

  const firstTransform = colorTransforms[0];
  return (
    <ThemeScopeProvider scopeId={scopeId}>
      {firstTransform ? (
        <WithAdjustment contrib={firstTransform}>{styles}</WithAdjustment>
      ) : (
        <>{styles}</>
      )}
    </ThemeScopeProvider>
  );
}

// Central mount point for every registered app's scope block: one
// <ScopedAppTheme/> per `Apps.App` contribution (each one is forked-gated, so the
// common unforked case emits nothing). Mounted at Core.Root — slot
// `useContributions()` is provider-free, so this needs no TabsProvider ancestor
// (which is exactly why it can't hang off `useTabs`). Mounting centrally (rather
// than per open surface) is what lets the degraded `AppTabsBody` fallback be
// themed without an `apps → theme-engine` import cycle.
export function AppScopeThemes() {
  const apps = Apps.App.useContributions();
  return (
    <>
      {apps.map((app) => (
        <ScopedAppTheme key={app.id} appId={app.id} />
      ))}
    </>
  );
}
