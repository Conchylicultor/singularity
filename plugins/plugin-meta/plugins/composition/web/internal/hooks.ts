import { useEffect, useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  deserializeEdgeGraph,
  explainInclusion,
  flattenManifest,
  impactOfPruning,
  impactOfSelecting,
  resolveComposition,
  type CompositionManifest,
  type EdgeGraph,
  type InclusionPath,
} from "@plugins/plugin-meta/plugins/closure/core";
import { MAIN_COMPOSITION_ID } from "@plugins/infra/plugins/namespace/core";
import {
  getCompositionData,
  manifestItemToManifest,
  type CompositionData,
  type CompositionManifestItem,
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
 * mapped to the engine's `CompositionManifest[]` (dropping `id`). Safe to
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
 * What the app this repo builds does NOT ship, and which half of that is a
 * decision rather than a consequence.
 *
 * `excluded` is every plugin id outside the `singularity` composition's bundle.
 * `negatedTargets` is the subset a manifest negated BY NAME (in practice the
 * `base-exclusions` row every composition inherits) — the rest are ids the
 * removal cascade took because they descend from, or import, one of those. That
 * is exactly the distinction the explorer badge draws between *Not in the app*
 * and *Not in the app (cascade)*.
 *
 * **Derived here rather than shipped.** The answer is a pure function of the
 * edge graph and the composition manifests, and the client already holds both —
 * the graph from `getCompositionData`, the manifests from the `compositions`
 * config. A `disabledIds`-style wire field would be a SECOND spelling of a
 * computation the engine already owns, free to drift from it the moment the
 * negative pass changes; deriving it means the badge and the codegen that emits
 * the registries are reading one implementation.
 *
 * **Which config layer this reads.** The client reads the EFFECTIVE (layered)
 * config, while codegen reads the GIT layer. They coincide because a runtime
 * write to the two rows that govern this answer is refused: `save` throws for
 * `MAIN_COMPOSITION_ID` and `BASE_EXCLUSIONS_ID` (see `manifests.ts`), and the
 * surfaces render those controls inert. So no user layer can exist for either
 * row, and this badge cannot claim an exclusion the committed registries do not
 * have.
 *
 * The `pending` arm is a state to render, not an absence to collapse: before the
 * graph arrives nothing is known about any plugin, and answering with an empty
 * `excluded` would assert that every plugin ships — a claim that then reverses
 * itself.
 */
export type AppExclusions =
  | { kind: "pending" }
  | {
      kind: "ready";
      /** Every id outside main's bundle — excluded on purpose or by cascade. */
      excluded: Set<PluginId>;
      /** The subset a manifest negated by name. Always ⊆ `excluded`. */
      negatedTargets: Set<PluginId>;
    };

const PENDING_EXCLUSIONS: AppExclusions = { kind: "pending" };

// Resolved ONCE per (graph, manifest-config) pair rather than per caller: the
// explorer badge asks this question from every row of a tree of ~900, and
// resolving main's whole closure per row would be that many full closures per
// render. Both inputs are reference-stable — the graph per fetched response (see
// `graphFor`), the items array per config document — so identity is the whole
// cache key, the same shape `graphFor` uses one screen up.
let exclusionsForGraph: EdgeGraph | null = null;
let exclusionsForItems: CompositionManifestItem[] | null = null;
let exclusionsCache: AppExclusions | null = null;

function appExclusions(
  graph: EdgeGraph,
  items: CompositionManifestItem[],
): AppExclusions {
  if (
    exclusionsCache &&
    exclusionsForGraph === graph &&
    exclusionsForItems === items
  ) {
    return exclusionsCache;
  }

  const registry = items.map(manifestItemToManifest);
  const main = registry.find((m) => m.name === MAIN_COMPOSITION_ID);
  // Loud rather than "nothing is excluded": the config defaults always carry
  // main's row, so reaching here means a stored manifest set replaced it — the
  // state `composition-closure` refuses, and one where every answer this hook
  // could give would be a guess about an app that has no definition.
  if (!main) {
    throw new Error(
      `The compositions config carries no "${MAIN_COMPOSITION_ID}" manifest, so what the app ships is undefined.`,
    );
  }

  // `flattenManifest` folds in the `base-exclusions` row unconditionally, which
  // is where the negatives actually live — main's own row is still `["**"]`.
  const { bundle, negatedTargets } = resolveComposition(
    graph,
    flattenManifest(main, registry),
  );
  const excluded = new Set<PluginId>();
  // Every tree node is a key in each adjacency map, so this is the full id set
  // without the endpoint's `allIds` (which not every caller of this hook fetches
  // the payload for).
  for (const id of graph.hardForward.keys()) {
    if (!bundle.has(id)) excluded.add(id);
  }

  exclusionsCache = { kind: "ready", excluded, negatedTargets };
  exclusionsForGraph = graph;
  exclusionsForItems = items;
  return exclusionsCache;
}

/** See {@link AppExclusions}. Shares the `useEndpoint` cache entry with the other
 *  composition-data consumers, so calling it from every tree row costs one fetch. */
export function useAppExclusions(): AppExclusions {
  const { data } = useEndpoint(getCompositionData, {});
  const graph = graphFor(data);
  const items = useManifestItems();
  if (!graph) return PENDING_EXCLUSIONS;
  return appExclusions(graph, items);
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
