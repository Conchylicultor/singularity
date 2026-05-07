import { useLayoutEffect } from "react";
import { useConfigValues } from "@plugins/config/web";
import { ThemeEngine } from "../slots";
import type { TokenGroupContribution } from "../slots";

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

function GroupStyle({ group }: { group: TokenGroupContribution }) {
  const presets = group.usePresets();
  const config = useConfigValues(group.configDescriptor, group.pluginId) as {
    preset: string;
  };
  const active =
    presets.find((p) => p.id === config.preset) ?? presets[0] ?? null;

  useLayoutEffect(() => {
    if (!active) return;
    const id = `theme-engine-${group.id}`;
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    const light = buildVarsBlock(group.descriptor, active.light);
    const dark = buildVarsBlock(group.descriptor, active.dark);
    el.textContent = `:root {\n${light}\n}\n.dark {\n${dark}\n}`;
    return () => el?.remove();
  }, [active, group.descriptor, group.id]);

  return null;
}

export function ThemeInjector() {
  const groups = ThemeEngine.TokenGroup.useContributions();
  return (
    <>
      {groups.map((g) => (
        <GroupStyle key={g.id} group={g} />
      ))}
    </>
  );
}
