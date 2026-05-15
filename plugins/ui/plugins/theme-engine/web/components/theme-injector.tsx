import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import { useConfigValues } from "@plugins/config/web";
import { ThemeEngine } from "../slots";
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

function GroupStyle({ group }: { group: TokenGroupContribution }) {
  const adjustment = useContext(ColorAdjustContext);
  const presets = group.usePresets();
  const config = useConfigValues(group.configDescriptor, group.pluginId) as {
    preset: string;
    overrides?: string;
  };
  const active =
    presets.find((p) => p.id === config.preset) ?? presets[0] ?? null;

  const overrides = useMemo(() => {
    try {
      return JSON.parse(config.overrides || "{}") as {
        light?: Record<string, string>;
        dark?: Record<string, string>;
      };
    } catch {
      return {};
    }
  }, [config.overrides]);

  const mergedLight = useMemo(
    () => (active ? { ...active.light, ...(overrides.light ?? {}) } : null),
    [active, overrides.light],
  );
  const mergedDark = useMemo(
    () => (active ? { ...active.dark, ...(overrides.dark ?? {}) } : null),
    [active, overrides.dark],
  );

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

export function ThemeInjector() {
  const groups = ThemeEngine.TokenGroup.useContributions();
  const colorTransforms = ThemeEngine.ColorTransform.useContributions();
  const groupStyles = groups.map((g) => <GroupStyle key={g.id} group={g} />);

  const firstTransform = colorTransforms[0];
  if (!firstTransform) {
    return <>{groupStyles}</>;
  }
  return (
    <WithAdjustment contrib={firstTransform}>{groupStyles}</WithAdjustment>
  );
}
