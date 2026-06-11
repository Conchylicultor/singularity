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
import { useCurrentAppId } from "@plugins/apps/web";
import { useResolvedColorMode, type ColorMode } from "../use-color-mode";
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
import { writeCriticalCss } from "../internal/theme-cache";

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

function GroupStyle({ group, scopeId }: { group: TokenGroupContribution; scopeId?: string }) {
  const adjustment = useContext(ColorAdjustContext);
  const report = useContext(CssReportContext);
  const presets = useTokenGroupPresets(group.id);
  const config = useConfig(group.configDescriptor, { scopeId }) as {
    preset: string;
    overrides: Record<string, unknown>;
  };
  const active =
    presets.find((p) => p.id === config.preset) ?? presets[0] ?? null;

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
    const id = styleIdFor(group.id);
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
    );
    el.textContent = text;
    report(group.id, text);
    return () => {
      el.remove();
      report(group.id, null);
    };
  }, [mergedLight, mergedDark, group.descriptor, group.id, adjustment, report]);

  return null;
}

// Reads the active app's resolved color mode and toggles the single global `.dark`
// class. Only one app is mounted at a time (AppsLayout), so a global class is
// correct — no per-app DOM scoping. Switching apps re-runs useCurrentAppId
// (pathname store) and re-resolves the mode automatically. The resolution itself
// lives in useResolvedColorMode so the class and prop-themed components never drift.
function ColorModeApplier({ resolved }: { resolved: ColorMode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return null;
}

export function ThemeInjector() {
  const appId = useCurrentAppId();
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

  // Collect each group's rendered CSS text and write a single consolidated
  // localStorage envelope, which the pre-paint script in web-core/index.html
  // replays before first paint so a warm reload is themed on frame 0. This is a
  // pure side effect (localStorage) — it intentionally uses a ref + microtask
  // flush rather than React state, so reporting can never schedule a re-render
  // (which from a layout effect would loop). One atomic write (never per-group)
  // avoids a torn cache; we wait until every live group has reported. See
  // theme-cache.
  const cacheRef = useRef<{ styles: Map<string, string>; dark: boolean }>({
    styles: new Map(),
    dark: false,
  });
  cacheRef.current.dark = resolved === "dark";
  const groupCountRef = useRef(0);
  groupCountRef.current = groups.length;
  const flushScheduledRef = useRef(false);

  const flush = useCallback(() => {
    flushScheduledRef.current = false;
    const { styles: map, dark } = cacheRef.current;
    if (map.size < groupCountRef.current) return; // torn cache — wait for all groups
    const styles: Record<string, string> = {};
    for (const [groupId, text] of map) styles[styleIdFor(groupId)] = text;
    writeCriticalCss({
      v: 1,
      groups: [...map.keys()].sort((a, b) => a.localeCompare(b)),
      styles,
      dark,
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    queueMicrotask(flush);
  }, [flush]);

  const report = useCallback<CssReporter>(
    (groupId, text) => {
      const map = cacheRef.current.styles;
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

  // Re-flush when the resolved color mode changes (cache stores the .dark bit).
  useEffect(scheduleFlush, [resolved, scheduleFlush]);

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
