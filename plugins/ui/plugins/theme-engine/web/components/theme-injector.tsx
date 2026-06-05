import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from "react";
import { useConfig, useScopeForked } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps/web";
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

    if (group.resolve) {
      const resolved = group.resolve(active, config.overrides);
      return { mergedLight: resolved.light, mergedDark: resolved.dark };
    }

    const ov = config.overrides as {
      light?: Record<string, string>;
      dark?: Record<string, string>;
    };
    const light = { ...active.light };
    const dark = { ...active.dark };
    for (const [k, v] of Object.entries(ov.light ?? {})) {
      if (v !== "") light[k] = v;
    }
    for (const [k, v] of Object.entries(ov.dark ?? {})) {
      if (v !== "") dark[k] = v;
    }
    return { mergedLight: light, mergedDark: dark };
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

// Reads the active app's colorMode and toggles the single global `.dark` class.
// Only one app is mounted at a time (AppsLayout), so a global class is correct —
// no per-app DOM scoping. Switching apps re-runs useCurrentAppId (pathname store)
// and re-resolves the colorMode automatically.
function ColorModeApplier({ scopeId }: { scopeId?: string }) {
  const { colorMode } = useConfig(themeEngineConfig, { scopeId }) as {
    colorMode: "light" | "dark" | "system";
  };

  useLayoutEffect(() => {
    const apply = () => {
      const resolved =
        colorMode === "dark" ||
        (colorMode === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", resolved);
    };
    apply();
    if (colorMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [colorMode]);

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
