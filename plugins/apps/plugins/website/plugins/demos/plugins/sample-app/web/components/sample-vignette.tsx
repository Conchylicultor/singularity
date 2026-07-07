import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** Mini bar chart driven purely by the `--chart-*` tokens — the clearest signal
 * that a preset switch reaches beyond the primary button. */
const CHART_BARS = [
  { color: "bg-chart-1", height: "h-8" },
  { color: "bg-chart-2", height: "h-14" },
  { color: "bg-chart-3", height: "h-10" },
  { color: "bg-chart-4", height: "h-16" },
  { color: "bg-chart-5", height: "h-11" },
] as const;

/**
 * A small fake-app vignette ("Project Aurora") built entirely from real UI
 * primitives. They read the semantic theme tokens (`--card`, `--primary`,
 * `--radius`, `--border`, …), so an enclosing `<ThemeScope>` or frame chrome
 * restyles the whole vignette with no per-component wiring. Controls are
 * decorative no-ops — the point is the look, not the behavior. Shared by the
 * site demos (theme toy, release switcher).
 */
export function SampleVignette() {
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
