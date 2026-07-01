import { useEffect, useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  deserializeEdgeGraph,
  explainInclusion,
  flattenManifest,
  impactOfPruning,
  impactOfSelecting,
  type CompositionManifest,
  type EdgeGraph,
  type InclusionPath,
} from "@plugins/plugin-meta/plugins/closure/core";
import {
  getCompositionData,
  manifestItemToManifest,
  type CompositionData,
} from "@plugins/plugin-meta/plugins/composition/core";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  setGraph,
  setRegistry,
  useActiveComposition,
  useGraph,
  useRegistry,
} from "./store";
import { useManifestItems } from "./manifests";

export interface CompositionDataResult {
  graph: EdgeGraph | null;
  manifests: CompositionManifest[];
  allIds: PluginId[];
  isLoading: boolean;
}

// Deserialize the graph EXACTLY ONCE per fetched response, shared across every
// caller (the membership band runs in hundreds of tree rows at once — they must
// not each deserialize the whole graph). Keyed on the raw response object identity,
// which TanStack Query keeps stable across renders for one cache entry.
let lastResponse: CompositionData | null = null;
let lastGraph: EdgeGraph | null = null;

function graphFor(data: CompositionData | undefined): EdgeGraph | null {
  if (!data) return null;
  if (data === lastResponse) return lastGraph;
  lastResponse = data;
  lastGraph = deserializeEdgeGraph(data.graph);
  return lastGraph;
}

/**
 * Fetch the closure data and rehydrate it. The serialized graph is deserialized
 * exactly once per response (module-cached, see {@link graphFor}) and published into
 * the active-composition store so the membership recompute can read it. Manifests
 * are sourced from the `compositions` config_v2 config (not the endpoint) and
 * mapped to the engine's `CompositionManifest[]` (dropping `id` / `rank`). Safe to
 * call from many components — `useEndpoint` (TanStack Query) dedupes the network
 * request and the deserialize is shared.
 */
export function useCompositionData(): CompositionDataResult {
  const { data, isLoading } = useEndpoint(getCompositionData, {});
  const graph = graphFor(data);
  const items = useManifestItems();
  const manifests = useMemo(() => items.map(manifestItemToManifest), [items]);

  // Publish the deserialized graph into the store so the band / detail sections
  // resolve membership against it. `graph` is module-cache-stable per response, so
  // this fires once per fetch.
  useEffect(() => {
    if (graph) setGraph(graph);
  }, [graph]);

  // Publish the full manifest set so the store's resolution boundary can flatten
  // each draft's `extends` against it. `manifests` is `useMemo`-stable per `items`
  // (config) change, so this fires once per config edit, not per render.
  useEffect(() => {
    setRegistry(manifests);
  }, [manifests]);

  return {
    graph,
    manifests,
    allIds: data?.allIds ?? [],
    isLoading,
  };
}

/**
 * The disabled-plugin cascade set (package.json-seeded disabled plugins plus every
 * plugin pulled into their dependent-closure), derived server-side from the same
 * edge graph. `null` until the composition data loads. Shares the `useEndpoint`
 * cache entry with the other composition-data consumers.
 */
export function useDisabledClosure(): Set<PluginId> | null {
  const { data } = useEndpoint(getCompositionData, {});
  return useMemo(() => (data ? new Set(data.disabledIds) : null), [data]);
}

/**
 * Ensure the closure graph is fetched + published to the store, without returning
 * the (potentially large) payload. For ambient consumers like the per-row
 * membership band that only need the store populated so `useActiveMembership()` can
 * resolve. The network request and deserialize are shared with `useCompositionData`.
 */
export function useEnsureCompositionData(): void {
  const { data } = useEndpoint(getCompositionData, {});
  const graph = graphFor(data);
  useEffect(() => {
    if (graph) setGraph(graph);
  }, [graph]);
}

/** Why `node` is in the active composition's bundle (or `null` when not bundled /
 *  no active composition / graph not loaded). The active draft is flattened
 *  against the registry so `extends`-pulled contributors are explained too. */
export function useInclusion(node: PluginNode): InclusionPath | null {
  const active = useActiveComposition();
  const graph = useGraph();
  const registry = useRegistry();
  return useMemo(() => {
    if (!active || !graph) return null;
    return explainInclusion(graph, flattenManifest(active, registry), node.id);
  }, [active, graph, registry, node.id]);
}

export interface ImpactResult {
  /** Ids that would be ADDED by selecting `node` as a contributor. */
  select: PluginId[];
  /** Ids that would be DROPPED by deselecting `node` (if currently selected). */
  prune: PluginId[];
}

/** The select/prune impact of `node` against the active composition. `null` when no
 *  active composition / graph not loaded. */
export function useImpact(node: PluginNode): ImpactResult | null {
  const active = useActiveComposition();
  const graph = useGraph();
  const registry = useRegistry();
  return useMemo(() => {
    if (!active || !graph) return null;
    const flat = flattenManifest(active, registry);
    return {
      select: impactOfSelecting(graph, flat, node.id),
      prune: impactOfPruning(graph, flat, node.id),
    };
  }, [active, graph, registry, node.id]);
}
