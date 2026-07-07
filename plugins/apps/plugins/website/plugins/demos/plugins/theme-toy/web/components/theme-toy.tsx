import { useState } from "react";
import { ThemeEngine, ThemeScope } from "@plugins/ui/plugins/theme-engine/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { SampleVignette } from "@plugins/apps/plugins/website/plugins/demos/plugins/sample-app/web";
import { usePresetVars } from "./use-preset-vars";

/**
 * Platform-page strip showcasing that theming itself is a plugin: a preset
 * switcher over the REAL global presets (Default / Ocean / Warm, plus any
 * others contributed to `ThemeEngine.GlobalPreset`). Selecting one resolves its
 * token values and applies them as inline CSS variables on a local
 * `<ThemeScope>` wrapper only — so the sample surface restyles live while the
 * rest of the site is untouched. Ephemeral and local: no config writes, no
 * persistence.
 */
export function ThemeToySection() {
  const presets = ThemeEngine.GlobalPreset.useContributions();
  const [activeId, setActiveId] = useState(() => presets[0]?.id ?? "default");
  const active = presets.find((p) => p.id === activeId) ?? presets[0];
  const vars = usePresetVars(active);

  const options = presets.map((p) => ({ id: p.id, label: p.label }));

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
      <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
        <Stack gap="2xs" align="center" className="text-center">
          <Text variant="eyebrow" tone="primary">
            Theming is a plugin too
          </Text>
          <Text variant="heading" as="h2" className="tracking-tight">
            Every surface is themeable — try it.
          </Text>
          <Text variant="body" tone="muted" className="max-w-xl">
            These are the workspace's real theme presets, contributed by the
            theming plugin. Switch one and watch the sample app restyle live —
            nothing here touches your real theme.
          </Text>
        </Stack>
        {options.length > 0 && (
          <SegmentedControl
            options={options}
            value={activeId}
            onChange={setActiveId}
          />
        )}
        <div className="w-full max-w-md">
          <ThemeScope overrides={vars}>
            <SampleVignette />
          </ThemeScope>
        </div>
      </Stack>
      </Inset>
    </section>
  );
}
