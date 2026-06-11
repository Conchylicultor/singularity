import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from "react";
import { useConfig, useScopeForked } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps/web";
import { useResolvedColorMode } from "../use-color-mode";
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

const DEFAULT_ADJUSTMENT: ColorAdjustment = {
  hueShift: 0,
  saturationScale: 1,
  lightnessScale: 1,
};
export const ColorAdjustContext =
  createContext<ColorAdjustment>(DEFAULT_ADJUSTMENT);

function buildVarsBlock(
  descriptor: TokenGroupContribution["descriptor"],
  values: Record<string, string>,
): string {
  return Object.entries(values)
    .map(([key, value]) => {
      const cssVar = descriptor.vars[key];
      if (!cssVar) return null;
      return `  ${cssVar}: ${value};`;
    })
    .filter(Boolean)
    .join("\n");
}

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
    const id = `theme-engine-${group.id}`;
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    const light = buildVarsBlock(
      group.descriptor,
      transformValues(mergedLight, adjustment),
    );
    const dark = buildVarsBlock(
      group.descriptor,
      transformValues(mergedDark, adjustment),
    );
    el.textContent = `:root {\n${light}\n}\n.dark {\n${dark}\n}`;
    return () => el.remove();
  }, [mergedLight, mergedDark, group.descriptor, group.id, adjustment]);

  return null;
}

// Reads the active app's resolved color mode and toggles the single global `.dark`
// class. Only one app is mounted at a time (AppsLayout), so a global class is
// correct — no per-app DOM scoping. Switching apps re-runs useCurrentAppId
// (pathname store) and re-resolves the mode automatically. The resolution itself
// lives in useResolvedColorMode so the class and prop-themed components never drift.
function ColorModeApplier({ scopeId }: { scopeId?: string }) {
  const resolved = useResolvedColorMode(scopeId);

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
      <ColorModeApplier scopeId={scopeId} />
      {content}
    </ThemeScopeProvider>
  );
}
