import { useMemo, useState } from "react";
import { MdAdd, MdRemove } from "react-icons/md";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { Stack, Inset } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { Surface } from "@plugins/primitives/plugins/surface/web";
import { GraphCanvas } from "@plugins/primitives/plugins/graph-canvas/web";
import {
  useCompositionData,
  useActiveComposition,
  useActiveMembership,
  useGraph,
} from "@plugins/plugin-meta/plugins/composition/web";
import { STATE_LEGEND } from "@plugins/apps/plugins/studio/plugins/membership-tint/web";
import { focusSubgraph, toCanvas, type Direction } from "../internal/subgraph";

const DEFAULT_DEPTH = 2;
const NODE_CAP = 60;
const DIRECTION_OPTIONS: { id: Direction; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "deps", label: "Deps" },
  { id: "dependents", label: "Dependents" },
];

export function GraphView({ paneFocusId }: { paneFocusId?: PluginId }) {
  const { allIds, isLoading } = useCompositionData();
  const graph = useGraph();
  const membership = useActiveMembership();
  const active = useActiveComposition();

  // Seed focus: pane param → active composition's first entry point → unset.
  const seed = paneFocusId ?? active?.entryPoints[0] ?? null;
  const [focusId, setFocusId] = useState<PluginId | null>(seed);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [direction, setDirection] = useState<Direction>("both");
  const [query, setQuery] = useState("");

  const { nodes, edges, hiddenCount } = useMemo(() => {
    if (!graph || !focusId) return { nodes: [], edges: [], hiddenCount: 0 };
    const sub = focusSubgraph(graph, focusId, { depth, cap: NODE_CAP, direction });
    const { nodes, edges } = toCanvas(sub, focusId, membership);
    return { nodes, edges, hiddenCount: sub.hiddenCount };
  }, [graph, focusId, depth, direction, membership]);

  if (isLoading || !graph) return <Loading variant="spinner" />;

  // Empty state: prompt + search over allIds to pick a focus node. Clear the
  // query on pick so the toolbar's own search doesn't open pre-filled.
  if (!focusId) {
    return (
      <FocusPicker
        allIds={allIds}
        query={query}
        onQuery={setQuery}
        onPick={(id) => {
          setFocusId(id);
          setQuery("");
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Inset pad="sm">
        <div className="flex flex-wrap items-center gap-sm">
          <div className="relative w-56">
            <SearchInput
              placeholder="Focus on a plugin…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <Surface
                level="overlay"
                className="absolute left-0 top-full z-overlay mt-2xs w-full p-2xs"
              >
                <FocusResults
                  allIds={allIds}
                  query={query}
                  onPick={(id) => {
                    setFocusId(id);
                    setQuery("");
                  }}
                />
              </Surface>
            )}
          </div>

          <div className="flex items-center gap-2xs">
            <Text variant="caption" tone="muted">Depth</Text>
            <IconButton
              icon={MdRemove}
              label="Decrease depth"
              size="sm"
              disabled={depth <= 1}
              onClick={() => setDepth((d) => Math.max(1, d - 1))}
            />
            <Text variant="label">{depth}</Text>
            <IconButton
              icon={MdAdd}
              label="Increase depth"
              size="sm"
              onClick={() => setDepth((d) => d + 1)}
            />
          </div>

          <SegmentedControl<Direction>
            options={DIRECTION_OPTIONS}
            value={direction}
            onChange={setDirection}
          />

          {hiddenCount > 0 && (
            <Text variant="caption" tone="muted">+{hiddenCount} hidden</Text>
          )}

          {membership && <Legend />}
        </div>
      </Inset>

      <div className="min-h-0 flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          focusId={focusId}
          onNodeClick={(id) => setFocusId(id as PluginId)}
        />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-sm">
      {STATE_LEGEND.map(({ state, label, tint }) => (
        <span key={state} className="flex items-center gap-2xs">
          <span
            aria-hidden
            className={`inline-block size-3 rounded-sm border border-border ${tint ?? "bg-transparent"}`}
          />
          <Text variant="caption" tone="muted">{label}</Text>
        </span>
      ))}
    </div>
  );
}

function FocusPicker({
  allIds,
  query,
  onQuery,
  onPick,
}: {
  allIds: PluginId[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (id: PluginId) => void;
}) {
  return (
    <Inset pad="md">
      <Stack gap="md">
        <Text variant="caption" tone="muted">
          Search for a plugin to focus the closure graph on its dependencies and
          dependents.
        </Text>
        <SearchInput
          placeholder="Search plugins…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus
        />
        <FocusResults allIds={allIds} query={query} onPick={onPick} />
      </Stack>
    </Inset>
  );
}

function FocusResults({
  allIds,
  query,
  onPick,
}: {
  allIds: PluginId[];
  query: string;
  onPick: (id: PluginId) => void;
}) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allIds.filter((id) => id.toLowerCase().includes(q)).slice(0, 12);
  }, [allIds, query]);

  if (matches.length === 0) return null;

  return (
    <Stack gap="2xs">
      {matches.map((id) => {
        const segs = pluginIdSegments(id);
        return (
          <Row key={id} onClick={() => onPick(id)}>
            <span className="truncate">
              <span className="font-medium">{segs[segs.length - 1]}</span>
              <span className="text-muted-foreground"> · {id}</span>
            </span>
          </Row>
        );
      })}
    </Stack>
  );
}
