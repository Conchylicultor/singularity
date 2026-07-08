import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
} from "react";
import { useConfig, useScopeMembership } from "@plugins/config_v2/web";
import { useActiveApp, Apps } from "@plugins/apps-core/web";
import { useRootThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";
import {
  appThemeScope,
  themeScopeSelectors,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResolvedColorMode, type ColorMode } from "../use-color-mode";
import { themeEngineConfig } from "../../core";
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
  // Per-group membership self-gate. A scoped block (`scopeToken` set) is emitted
  // only when THIS descriptor has its own config for the scope — the single
  // boot-hydrated membership signal that read + theme now share, so they can never
  // disagree. The unscoped `:root` block always emits (scopeToken undefined). The
  // hook runs unconditionally (Rules of Hooks); only emission branches on it.
  const isMember = useScopeMembership(group.configDescriptor, scopeId);
  const emit = scopeToken ? isMember : true;
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

  // Resolve straight to the final CSS text (null while a dynamic preset source
  // is pending). The DOM effects below depend on this STRING, not on the merged
  // value objects: upstream hooks (useTokenGroupPresets, useConfig, useAdjustment)
  // rebuild their objects on every render, and object-identity deps made the
  // effect re-run — remove + re-append its <style> — on every boot commit. That
  // churn (~64 elements per commit) let mid-task style recalcs observe a
  // theme-less document, which retriggered `transition-*` on themed elements
  // over and over: the visible "flicker until boot settles" bug. A string dep
  // makes no-op re-renders structurally unable to touch the DOM.
  const text = useMemo(() => {
    if (!active) return null;

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

    return renderGroupBlock(
      group.descriptor,
      transformValues(mergedLight, adjustment),
      transformValues(mergedDark, adjustment),
      scopeToken ? themeScopeSelectors(scopeToken) : undefined,
    );
  }, [active, config.overrides, group, adjustment, scopeToken]);

  // Scoped overrides get a distinct `theme-scope-` id; the global path keeps the
  // `theme-engine-` id the pre-paint replay and cache rely on. Both id families
  // feed the aggregator and the claim-based prune set.
  const id = scopeToken
    ? `theme-scope-${scopeToken}-${group.id}`
    : styleIdFor(group.id);

  // Element lifecycle — runs once per (emit, id), NOT on theme changes. Adopts
  // the replay-injected element in place (by id) or creates it, and claims the
  // id so the prune pass keeps it. Claiming here (even while a preset source is
  // still pending) also protects the replayed pre-paint CSS from a prune
  // triggered by an already-resolved sibling. The element is only removed on
  // true unmount / emit-flip — never as part of a content update.
  useLayoutEffect(() => {
    if (!emit) return;
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    claimPaintStyle(id);
    return () => {
      el.remove();
      releasePaintStyle(id);
      reportPaintStyle(id, null);
    };
  }, [emit, id]);

  // Content update — writes textContent in place only when the rendered CSS
  // actually changed, and feeds the pre-paint cache. Runs after the lifecycle
  // effect above (same commit, declaration order), so the element exists. While
  // `text` is null (dynamic preset source pending) it leaves the replayed
  // pre-paint CSS untouched — falling back to the default preset here would
  // overwrite it with wrong values for one window (see tweakcn's boot task).
  useLayoutEffect(() => {
    if (!emit || text === null) return;
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
    reportPaintStyle(id, text);
  }, [emit, id, text]);

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
  // "Base layer owns `:root`": `:root` carries the FOCUSED full-surface app's
  // theme. `useRootThemeScope()` returns `app:<id>` when the focused placement is
  // `themeScope:"app"` (docked/solo) and an app is active, else `undefined`
  // (desktop/floating → global). The chrome surfaces (rail, tab bar, toaster)
  // share this exact definition via `useChromeThemeScope`, so they can never
  // disagree about which app owns the surface.
  const rootScopeId = useRootThemeScope();
  const rootIsGlobal = rootScopeId === undefined;

  // The active app's path — the pre-paint cache key (one app is loaded per page).
  const appPath = useActiveApp()?.path;

  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();
  // Color mode stays GLOBAL: `<html>.dark` is a single global class read at
  // `scopeId: undefined`, even though the `:root` token *values* follow
  // `rootScopeId`. Per-scope dark is deferred; keeping the resolved scheme global
  // means focusing a differently-themed app never flips light/dark.
  const resolved = useResolvedColorMode(undefined);
  // The CONFIGURED color mode (not the resolved light/dark) is what the cache
  // stores, so the pre-paint script can re-resolve "system" against live
  // matchMedia each load. Read at `rootScopeId` so the cached mode matches the
  // `:root` theme the focused app paints. The live `.dark` class still uses the
  // global `resolved` above.
  const { colorMode } = useConfig(themeEngineConfig, { scopeId: rootScopeId }) as {
    colorMode: CachedColorMode;
  };

  // Feed the active paint context to the module-level aggregator, which collects
  // EVERY GroupStyle's CSS text (the `:root`/`.dark` blocks plus every other
  // visible app's scope) and writes the per-app-path localStorage envelope the
  // pre-paint script in web-core/index.html replays before first paint — so a
  // warm reload paints every visible surface themed on frame 0. The aggregator
  // owns the debounced microtask flush and the claim-based stale-element prune
  // (both global and scoped ids). The context is set in the render body (not an
  // effect) so it is current before the flush microtask. `rootIsGlobal` keys the
  // `""` (global) cache entry: only a global focus owns it; a full-surface app
  // focus writes only its own app-path key. See paint-cache-aggregator/theme-cache.
  setPaintContext({ appPath, mode: colorMode, rootIsGlobal });

  // The `:root`/`.dark` blocks render the FOCUSED full-surface app's theme
  // (`rootScopeId`) — the base layer. Other simultaneously-visible apps whose
  // theme differs add their own scoped override block via AppScopeThemes below;
  // the one whose theme is already `:root` emits nothing.
  const groupStyles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={rootScopeId} />
  ));

  const firstTransform = colorTransforms[0];
  const content = firstTransform ? (
    <WithAdjustment contrib={firstTransform}>{groupStyles}</WithAdjustment>
  ) : (
    <>{groupStyles}</>
  );

  // `:root` carries `rootScopeId`'s theme, so slot-contributed reads that resolve
  // via useThemeScopeId() (e.g. the color-adjust ColorTransform's useAdjustment)
  // read the focused app's value here. GroupStyle gets scopeId directly.
  return (
    <ThemeScopeProvider scopeId={rootScopeId}>
      <ColorModeApplier resolved={resolved} />
      {content}
    </ThemeScopeProvider>
  );
}

// Scoped sibling of ThemeInjector for a single app id, for an app that is NOT the
// one currently owning `:root`. A scoped override block targeting
// `[data-theme-scope="app:<id>"]` lets a second simultaneously-visible surface (an
// unfocused docked tab, a floating window, a portaled solo) show ITS app's theme
// while `:root` keeps the focused app's (or desktop) theme.
//
// Two gates suppress all needless blocks:
//  - Whole-app root gate: when `appThemeScope(appId) === rootScopeId`, this app's
//    theme is ALREADY `:root`, so it returns null — no redundant scoped block.
//  - Per-group membership self-gate (inside each child GroupStyle): an app with no
//    own config for a token group emits nothing for that group. So a non-root app
//    with no own theme inherits `:root` and emits nothing at all.
// Combined, the common single-docked-app case (only the focused app visible, which
// owns `:root`) emits ZERO scoped blocks.
//
// It reuses the same preset resolution, merge, color-transform adjustment, and
// completeness backstop as the `:root` path (all live inside GroupStyle /
// WithAdjustment) — only the selector and style id differ (via `scopeToken`).
// Its GroupStyle children feed the pre-paint cache aggregator (under their
// `theme-scope-app:<id>-<group>` ids) just like the `:root` path, so a warm
// reload paints this app's scope on frame 0. Deliberately omits ColorModeApplier
// (light/dark stays global).
//
// Mounted centrally (one per registered app via AppScopeThemes at Core.Root),
// not per open surface — so the degraded `AppTabsBody` fallback and the real
// surface share the same scope blocks, with no `apps → theme-engine` cycle.
export function ScopedAppTheme({
  appId,
  rootScopeId,
}: {
  appId: string;
  rootScopeId: string | undefined;
}) {
  const scopeId = appThemeScope(appId);
  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();

  const styles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={scopeId} scopeToken={appThemeScope(appId)} />
  ));

  const firstTransform = colorTransforms[0];
  // This app's theme is already `:root` → no scoped block needed. Hooks above run
  // unconditionally (Rules of Hooks); only the emitted tree branches.
  if (scopeId === rootScopeId) return null;
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
// <ScopedAppTheme/> per `Apps.App` contribution. The app currently owning `:root`
// (the focused full-surface app) is skipped per-instance via `rootScopeId`, and
// every other app's child GroupStyles are membership-gated — so the common
// single-docked-app case emits nothing. Mounted at Core.Root — slot
// `useContributions()` is provider-free, so this needs no TabsProvider ancestor
// (which is exactly why it can't hang off `useTabs`). Mounting centrally (rather
// than per open surface) is what lets the degraded `AppTabsBody` fallback be
// themed without an `apps → theme-engine` import cycle.
export function AppScopeThemes() {
  const apps = Apps.App.useContributions();
  const rootScopeId = useRootThemeScope();
  return (
    <>
      {apps.map((app) => (
        <ScopedAppTheme key={app.id} appId={app.id} rootScopeId={rootScopeId} />
      ))}
    </>
  );
}
