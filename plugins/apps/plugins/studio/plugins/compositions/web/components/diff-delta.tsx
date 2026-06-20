import { useMemo } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { DiffState } from "@plugins/plugin-meta/plugins/composition/web";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { DIFF_LEGEND } from "@plugins/apps/plugins/studio/plugins/explorer/plugins/membership/web";

/**
 * Feature-level delta between bundle A (active) and bundle B (compareWith): the
 * symmetric difference, grouped into "only in A" and "only in B". Reads the same
 * store-derived diff map the Explorer band tints by, so the list and the tree
 * never disagree. Counts surface the magnitude of the difference.
 */
export function DiffDelta({
  diff,
  nameA,
  nameB,
}: {
  diff: Map<PluginId, DiffState>;
  nameA: string;
  nameB: string;
}) {
  const { onlyA, onlyB } = useMemo(() => {
    const a: PluginId[] = [];
    const b: PluginId[] = [];
    for (const [id, state] of diff) {
      if (state === "only-a") a.push(id);
      else if (state === "only-b") b.push(id);
    }
    a.sort();
    b.sort();
    return { onlyA: a, onlyB: b };
  }, [diff]);

  return (
    <Stack gap="md">
      <DiffLegend />
      <DeltaGroup
        label={`Only in A · ${nameA}`}
        ids={onlyA}
        tint={DIFF_LEGEND.find((l) => l.state === "only-a")?.tint ?? null}
      />
      <DeltaGroup
        label={`Only in B · ${nameB}`}
        ids={onlyB}
        tint={DIFF_LEGEND.find((l) => l.state === "only-b")?.tint ?? null}
      />
    </Stack>
  );
}

function DiffLegend() {
  return (
    <Stack gap="2xs">
      <SectionLabel>Legend</SectionLabel>
      <Cluster gap="sm">
        {DIFF_LEGEND.map(({ state, label, tint }) => (
          <Stack key={state} as="span" direction="row" align="center" gap="xs">
            <span
              aria-hidden
              className={cn(
                "inline-block size-3 rounded-sm border border-border",
                tint,
              )}
            />
            <Text variant="caption" tone="muted">
              {label}
            </Text>
          </Stack>
        ))}
      </Cluster>
    </Stack>
  );
}

function shortName(id: PluginId): string {
  const s = String(id);
  const dot = s.lastIndexOf(".");
  return dot === -1 ? s : s.slice(dot + 1);
}

function DeltaGroup({
  label,
  ids,
  tint,
}: {
  label: string;
  ids: PluginId[];
  tint: string | null;
}) {
  return (
    <Stack gap="sm">
      <Frame
        content={<SectionLabel>{label}</SectionLabel>}
        trailing={
          <Badge variant="muted">
            {ids.length}
          </Badge>
        }
      />
      {ids.length === 0 ? (
        <Text variant="caption" tone="muted">
          No plugins unique to this side.
        </Text>
      ) : (
        <Cluster gap="xs">
          {ids.map((id) => (
            <span
              key={id}
              title={String(id)}
              className={cn(
                "max-w-full truncate rounded-sm border border-border px-xs py-2xs font-mono",
                tint,
              )}
            >
              <Text variant="caption" tone="default" as="span">
                {shortName(id)}
              </Text>
            </span>
          ))}
        </Cluster>
      )}
    </Stack>
  );
}
