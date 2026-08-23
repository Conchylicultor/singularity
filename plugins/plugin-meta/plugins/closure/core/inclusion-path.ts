import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type {
  EdgeGraph,
  InclusionPath,
  InclusionStep,
  MembershipState,
} from "./types";

/**
 * Everything an inclusion explanation needs from an ALREADY-RESOLVED
 * composition. Passing the resolved parts rather than the manifest is what keeps
 * this module a leaf: `resolveComposition` needs an explanation for its
 * `unsatisfiedExclusions` postcondition, and `explainInclusion` needs a
 * resolution — routing both through this shape means neither file imports the
 * other, so there is no cycle and no second copy of the BFS.
 */
export interface ResolvedInclusionContext {
  /** The composition's resolved bundle. */
  bundle: Set<PluginId>;
  /** The composition's total membership map. */
  membership: Map<PluginId, MembershipState>;
  /** The expanded entry seeds (entries ∪ their `.**` subtrees), post-negatives. */
  entrySeeds: Set<PluginId>;
  /** The manifest's declared soft selections (bundled or not). */
  selectedContributors: readonly PluginId[];
}

/**
 * Explain why `target` is in the bundle: the shortest chain of edges from a seed
 * (an entry point, or a SELECTED soft contributor) to `target`.
 *
 * Returns `null` if `target` is not bundled. Otherwise BFS over `hardReverse`
 * from `target` back toward the seed frontier, stopping at the first reached seed
 * (shortest by BFS layering). Entry-origin seeds win ties — both because BFS
 * prefers them when discovered first and because we re-scan to favour an entry
 * path when one exists, matching membership precedence. When the seed is a
 * selected contributor, the leading soft edge `contributor → owner` is prepended
 * so the path reads "C soft-contributes to its owned slot, then C's hard imports
 * pull … → target".
 *
 * Reads `ctx.entrySeeds`, never the `named` bases: a no-runtime umbrella entry
 * has no hard imports of its own, so the hard chain to `target` actually
 * originates at a runtime-bearing sub-plugin of the entry. It also means the root
 * `**` pattern needs no special case — every node is a seed, and the answer to
 * "why is this bundled?" is correctly "it is its own entry", a zero-step path.
 */
export function inclusionPathWithin(
  graph: EdgeGraph,
  ctx: ResolvedInclusionContext,
  target: PluginId,
): InclusionPath | null {
  if (!ctx.bundle.has(target)) return null;
  const state = ctx.membership.get(target) ?? "excluded";
  const entrySet = ctx.entrySeeds;

  // Contributor origins = the explicitly selected contributors that are bundled.
  const activeSet = new Set<PluginId>();
  for (const a of ctx.selectedContributors) {
    if (ctx.bundle.has(a)) activeSet.add(a);
  }

  // BFS over hardReverse from target; predecessor[x] = the node x hard-imports
  // (i.e. the next hop toward target along forward hard edges).
  const predecessor = new Map<PluginId, PluginId>();
  const visited = new Set<PluginId>([target]);
  const queue: PluginId[] = [target];

  const buildPath = (seed: PluginId): InclusionPath => {
    // Reconstruct forward hard steps seed → … → target.
    const steps: InclusionStep[] = [];
    let cur = seed;
    while (cur !== target) {
      const next = predecessor.get(cur)!;
      steps.push({ from: cur, to: next, kind: "hard" });
      cur = next;
    }
    const originIsEntry = entrySet.has(seed);
    if (originIsEntry) {
      return { target, state, origin: seed, originKind: "entry", steps };
    }
    // Active contributor seed: prepend its soft edge to a bundled owned slot.
    const owner = (graph.softForward.get(seed) ?? []).find((b) =>
      ctx.bundle.has(b),
    );
    const softStep: InclusionStep[] = owner
      ? [{ from: seed, to: owner, kind: "soft" }]
      : [];
    return {
      target,
      state,
      origin: seed,
      originKind: "contributor",
      steps: [...softStep, ...steps],
    };
  };

  // First pass: prefer an entry-origin path. Collect contributor seeds for fallback.
  let contributorSeed: PluginId | null = null;
  while (queue.length) {
    const x = queue.shift()!;
    if (entrySet.has(x)) return buildPath(x);
    if (contributorSeed === null && activeSet.has(x)) contributorSeed = x;
    for (const p of graph.hardReverse.get(x) ?? []) {
      if (visited.has(p)) continue;
      visited.add(p);
      predecessor.set(p, x);
      queue.push(p);
    }
  }

  // No entry path; fall back to the shortest contributor-origin path found.
  if (contributorSeed !== null) return buildPath(contributorSeed);
  return null;
}
