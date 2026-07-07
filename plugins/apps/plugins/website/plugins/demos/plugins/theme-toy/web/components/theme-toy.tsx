import { useState } from "react";
import { ThemeEngine, ThemeScope } from "@plugins/ui/plugins/theme-engine/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { usePresetVars } from "./use-preset-vars";

/**
 * A small fake-app vignette built entirely from real UI primitives. They read the
 * semantic theme tokens (`--card`, `--primary`, `--radius`, `--border`, …), so
 * when the enclosing `<ThemeScope>` overrides those vars the whole vignette
 * restyles with no per-component wiring. Controls are decorative no-ops — the
 * point is the look, not the behavior.
 */
/** Mini bar chart driven purely by the `--chart-*` tokens — the clearest signal
 * that a preset switch reaches beyond the primary button. */
const CHART_BARS = [
  { color: "bg-chart-1", height: "h-8" },
  { color: "bg-chart-2", height: "h-14" },
  { color: "bg-chart-3", height: "h-10" },
  { color: "bg-chart-4", height: "h-16" },
  { color: "bg-chart-5", height: "h-11" },
] as const;

function SampleVignette() {
  return (
    <Card>
      <Stack gap="md">
        <Stack direction="row" justify="between" align="center" gap="sm">
          <Text variant="subheading" as="h3">
            Project Aurora
          </Text>
          <Badge variant="success" shape="pill">
            Live
          </Badge>
        </Stack>
        <Text variant="body" tone="muted">
          A tiny app vignette — every color, corner, and shadow below is driven by
          theme tokens.
        </Text>
        <Cluster>
          <Badge variant="primary">Design</Badge>
          <Badge variant="info">Engineering</Badge>
          <Badge variant="warning">Review</Badge>
        </Cluster>
        <Surface level="raised">
          <Inset pad="md">
            <Stack gap="sm">
              <Stack direction="row" justify="between" align="center" gap="sm">
                <Stack gap="2xs">
                  <Text variant="caption" tone="muted">
                    This week
                  </Text>
                  <Text variant="heading" as="p">
                    1,284
                  </Text>
                </Stack>
                <Badge variant="success">+12%</Badge>
              </Stack>
              <Stack direction="row" gap="sm" align="end">
                {CHART_BARS.map((bar) => (
                  <div
                    key={bar.color}
                    className={`w-6 rounded-t-md ${bar.color} ${bar.height}`}
                  />
                ))}
              </Stack>
            </Stack>
          </Inset>
        </Surface>
        <Stack direction="row" gap="sm">
          <Button type="button">Get started</Button>
          <Button type="button" variant="ghost">
            Learn more
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

/**
 * Landing-page strip showcasing the theming engine: a preset switcher over the
 * REAL global presets (Default / Ocean / Warm, plus any others contributed to
 * `ThemeEngine.GlobalPreset`). Selecting one resolves its token values and applies
 * them as inline CSS variables on a local `<ThemeScope>` wrapper only — so the
 * sample surface restyles live while the rest of the site is untouched. Ephemeral
 * and local: no config writes, no persistence.
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
            Theming engine
          </Text>
          <Text variant="heading" as="h2" className="tracking-tight">
            Every surface is themeable — try it.
          </Text>
          <Text variant="body" tone="muted" className="max-w-xl">
            Switch a preset and watch the sample app restyle live. Nothing here
            touches your real theme.
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
