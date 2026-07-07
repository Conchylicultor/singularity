import type React from "react";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The four plugins that make up the pyramid's middle-tier sample app. Each id
 * maps 1:1 to a toggle chip below (owned by the pyramid section) and to one
 * region of the composed vignette here — so the block set is authored once and
 * both the chips and the regions read from it.
 */
export type BlockId = "editor" | "charts" | "tags" | "actions";

export interface PluginBlock {
  id: BlockId;
  label: string;
}

export const PLUGIN_BLOCKS: readonly PluginBlock[] = [
  { id: "editor", label: "Editor" },
  { id: "charts", label: "Charts" },
  { id: "tags", label: "Tags" },
  { id: "actions", label: "Actions" },
];

/** Mini bar chart driven by the `--chart-*` tokens — echoes the sibling
 * sample-app vignette so the two read as the same fake app. */
const CHART_BARS = [
  { color: "bg-chart-1", height: "h-8" },
  { color: "bg-chart-2", height: "h-14" },
  { color: "bg-chart-3", height: "h-10" },
  { color: "bg-chart-4", height: "h-16" },
  { color: "bg-chart-5", height: "h-11" },
] as const;

function EditorRegion() {
  return (
    <Stack gap="2xs">
      <Text variant="subheading" as="h4">
        Weekly digest
      </Text>
      <Text variant="body" tone="muted">
        A short line of body copy, laid out by the editor block.
      </Text>
    </Stack>
  );
}

function ChartsRegion() {
  return (
    <Surface level="raised">
      <Inset pad="md">
        <Stack direction="row" gap="sm" align="end">
          {CHART_BARS.map((bar) => (
            <div
              key={bar.color}
              className={`w-6 rounded-t-md ${bar.color} ${bar.height}`}
            />
          ))}
        </Stack>
      </Inset>
    </Surface>
  );
}

function TagsRegion() {
  return (
    <Cluster>
      <Badge variant="primary">Design</Badge>
      <Badge variant="info">Engineering</Badge>
      <Badge variant="warning">Review</Badge>
    </Cluster>
  );
}

function ActionsRegion() {
  return (
    <Stack direction="row" gap="sm">
      <Button type="button">Get started</Button>
      <Button type="button" variant="ghost">
        Learn more
      </Button>
    </Stack>
  );
}

const REGIONS: Record<BlockId, () => React.ReactElement> = {
  editor: EditorRegion,
  charts: ChartsRegion,
  tags: TagsRegion,
  actions: ActionsRegion,
};

/**
 * One region of the sample app. When its plugin is on, the real region renders;
 * when off, the region collapses to a dashed empty-slot placeholder labelled
 * with the slot name — making the slot architecture literally visible. Both
 * states share a min-height and a `transition-all` so toggling doesn't jump the
 * card around.
 */
function RegionSlot({ block, active }: { block: PluginBlock; active: boolean }) {
  const Region = REGIONS[block.id];
  return (
    <div className="min-h-16 transition-all duration-300">
      {active ? (
        <Region />
      ) : (
        <Center
          axis="both"
          className="min-h-16 rounded-lg border border-dashed border-border"
        >
          <Inset pad="md">
            <Text variant="caption" tone="muted" className="font-mono">
              app.section ← {block.id}
            </Text>
          </Inset>
        </Center>
      )}
    </div>
  );
}

/**
 * The pyramid's middle tier: a mini fake app ("Project Aurora") whose four
 * regions map 1:1 to the plugin toggles. Turning a plugin off empties its
 * region into a labelled placeholder — the app is the sum of its plugins.
 */
export function ComposedVignette({ active }: { active: ReadonlySet<BlockId> }) {
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
        {PLUGIN_BLOCKS.map((block) => (
          <RegionSlot key={block.id} block={block} active={active.has(block.id)} />
        ))}
      </Stack>
    </Card>
  );
}
