import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useConfig, useScopeForked } from "@plugins/config_v2/web";
import { useActiveApp } from "@plugins/apps/web";
import {
  CHROME_THEME_SCOPE,
  appThemeScope,
  themeScopeSelectors,
} from "@plugins/primitives/plugins/ui-kit/web";
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
import { writeCriticalCss, type CachedColorMode } from "../internal/theme-cache";

// styleId for a token group's <style>, shared by the runtime injector, the
// localStorage cache, and the pre-paint replay script (web-core/index.html).
const styleIdFor = (groupId: string) => `theme-engine-${groupId}`;

// Each GroupStyle reports its rendered CSS text up to ThemeInjector, which
// consolidates all groups into one localStorage envelope for pre-paint replay.
type CssReporter = (groupId: string, text: string | null) => void;
const CssReportContext = createContext<CssReporter>(() => {});

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
  // `"app:home"` for one desktop window's subtree, or `"chrome"` for the global
  // app chrome). Scoped blocks use a distinct `theme-scope-` style id (kept out
  // of the global `theme-engine-` prune sweep) and never report to the pre-paint
  // cache (overrides paint via useLayoutEffect before the scoped subtree is
  // shown, so the warm-reload cache is irrelevant).
  scopeToken?: string;
}) {
  const adjustment = useContext(ColorAdjustContext);
  const report = useContext(CssReportContext);
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
    // Scoped overrides get a distinct `theme-scope-` id so they're excluded from
    // the global `style[id^="theme-engine-"]` prune (and cleaned up by their own
    // ScopedAppTheme unmount); the global path keeps the `theme-engine-` id the
    // pre-paint replay and cache rely on.
    const id = scopeToken ? `theme-scope-${scopeToken}-${group.id}` : styleIdFor(group.id);
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
    // Scoped overrides never feed the pre-paint cache — only the global path does.
    if (!scopeToken) report(group.id, text);
    return () => {
      el.remove();
      if (!scopeToken) report(group.id, null);
    };
  }, [mergedLight, mergedDark, group.descriptor, group.id, adjustment, report, scopeToken]);

  return null;
}

// Reads the active app's resolved color mode and toggles the single global `.dark`
// class. Only one app is mounted at a time (AppsLayout), so a global class is
// correct — no per-app DOM scoping. Switching apps re-runs useActiveApp
// (pathname store) and re-resolves the mode automatically. The resolution itself
// lives in useResolvedColorMode so the class and prop-themed components never drift.
function ColorModeApplier({ resolved }: { resolved: ColorMode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return null;
}

export function ThemeInjector() {
  const active = useActiveApp();
  const appId = active?.id;
  const scopeId = appId ? `app:${appId}` : undefined;

  // Persist the active app's scope (only when forked) so the pre-paint boot task
  // can re-hydrate it on a hard reload and avoid the one-frame flash of global
  // theme. See active-scope-storage.
  const forked = useScopeForked(scopeId);
  useEffect(() => {
    persistActiveForkedScope(scopeId, forked);
  }, [scopeId, forked]);

  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();
  const resolved = useResolvedColorMode(scopeId);
  // The CONFIGURED color mode (not the resolved light/dark) is what the cache
  // stores, so the pre-paint script can re-resolve "system" against live
  // matchMedia each load. The live `.dark` class still uses `resolved` above.
  const { colorMode } = useConfig(themeEngineConfig, { scopeId }) as {
    colorMode: CachedColorMode;
  };
  const appPath = active?.path;

  // Collect each group's rendered CSS text and write the per-app-path localStorage
  // envelope, which the pre-paint script in web-core/index.html replays before
  // first paint so a warm reload is themed on frame 0. This is a pure side effect
  // (localStorage) — it intentionally uses refs + a microtask flush rather than
  // React state, so reporting can never schedule a re-render (which from a layout
  // effect would loop). One atomic write per app (never per-group) avoids a torn
  // cache; we wait until every live group has reported. The paint context is set
  // in the render body (not an effect) so it is current before the flush
  // microtask. See theme-cache.
  const stylesRef = useRef<Map<string, string>>(new Map());
  const ctxRef = useRef<{
    appPath: string | undefined;
    mode: CachedColorMode;
    forked: boolean;
  }>({ appPath, mode: colorMode, forked });
  ctxRef.current = { appPath, mode: colorMode, forked };
  const groupCountRef = useRef(0);
  groupCountRef.current = groups.length;
  const flushScheduledRef = useRef(false);

  const flush = useCallback(() => {
    flushScheduledRef.current = false;
    const map = stylesRef.current;
    if (map.size < groupCountRef.current) return; // torn cache — wait for all groups
    const styles: Record<string, string> = {};
    for (const [groupId, text] of map) styles[styleIdFor(groupId)] = text;
    const { appPath, mode, forked } = ctxRef.current;
    writeCriticalCss({ appPath, styles, mode, forked });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    queueMicrotask(flush);
  }, [flush]);

  const report = useCallback<CssReporter>(
    (groupId, text) => {
      const map = stylesRef.current;
      if (text === null) {
        if (!map.delete(groupId)) return;
      } else if (map.get(groupId) === text) {
        return;
      } else {
        map.set(groupId, text);
      }
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // Re-flush when the paint context changes even if no group's CSS text did —
  // e.g. switching to an app with an identical theme, a fork toggle, or a
  // configured-mode change. The flush reads the latest context from ctxRef.
  useEffect(scheduleFlush, [appPath, colorMode, forked, scheduleFlush]);

  // Prune orphaned <style> elements left by the replay script for token groups
  // that no longer exist (stale cache after a group was removed). No GroupStyle
  // adopts them, so they would otherwise declare dead vars forever.
  useLayoutEffect(() => {
    const live = new Set(groups.map((g) => styleIdFor(g.id)));
    for (const el of document.querySelectorAll<HTMLStyleElement>(
      'style[id^="theme-engine-"]',
    )) {
      if (!live.has(el.id)) el.remove();
    }
  }, [groups]);

  const groupStyles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={scopeId} />
  ));

  const firstTransform = colorTransforms[0];
  const content = firstTransform ? (
    <WithAdjustment contrib={firstTransform}>{groupStyles}</WithAdjustment>
  ) : (
    <>{groupStyles}</>
  );

  // Provide the active app's scopeId so slot-contributed reads that resolve via
  // useThemeScopeId() (e.g. the color-adjust ColorTransform's useAdjustment) pick
  // up the per-app value. GroupStyle gets scopeId directly as a prop.
  return (
    <ThemeScopeProvider scopeId={scopeId}>
      <ColorModeApplier resolved={resolved} />
      <CssReportContext.Provider value={report}>
        {content}
      </CssReportContext.Provider>
    </ThemeScopeProvider>
  );
}

// Scoped sibling of ThemeInjector for a single app id. Where ThemeInjector writes
// the focused app's theme to global `:root`/`.dark` (and feeds the pre-paint
// cache + the `<html>.dark` toggle), this writes a purely *additive* override
// block targeting `[data-theme-scope="app:<id>"]`, so one desktop window's
// subtree shows ITS app's theme while chrome and portals keep the global one.
//
// It reuses the same preset resolution, merge, color-transform adjustment, and
// completeness backstop as the global path (all live inside GroupStyle /
// WithAdjustment) — only the selector and style id differ (via `scopeToken`).
// Deliberately omits ColorModeApplier (light/dark stays global), the
// CssReportContext provider (the default no-op; `scopeToken` gates reports off
// regardless), and the cache / active-scope-storage side effects.
export function ScopedAppTheme({ appId }: { appId: string }) {
  const scopeId = appThemeScope(appId);
  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();

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

// Stable theme for the global app chrome (sonner toaster, desktop backdrop, tab
// bar, app rail). Like ScopedAppTheme it emits a purely *additive* override
// block — but under the non-`app:` `chrome` token and fed by the GLOBAL
// (unscoped) config instead of an `app:<id>` config. So the chrome wears the
// user's base theme and does NOT track the focused window: switching desktop
// windows no longer flips the surrounding chrome's palette. Always mounted
// (chrome exists in every surface arrangement). Light/dark still follows the
// global `<html>.dark` (no ColorModeApplier here — palette only).
export function ChromeTheme() {
  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();

  const styles = groups.map((g) => (
    <GroupStyle key={g.id} group={g} scopeId={undefined} scopeToken={CHROME_THEME_SCOPE} />
  ));

  const firstTransform = colorTransforms[0];
  return (
    <ThemeScopeProvider scopeId={undefined}>
      {firstTransform ? (
        <WithAdjustment contrib={firstTransform}>{styles}</WithAdjustment>
      ) : (
        <>{styles}</>
      )}
    </ThemeScopeProvider>
  );
}
