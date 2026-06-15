/**
 * Verifies the composition registry end-to-end against the REAL tree: the
 * generated `composition.generated.ts` discovers the seed manifests, they load &
 * resolve cleanly, and the agent-manager full-vs-lean pair realises the vision's
 * anchor demo (the bundle diff IS exactly the self-improvement selection). Run
 * AFTER `./singularity build` (which emits the generated registry) with:
 *   bun test plugins/plugin-meta/plugins/composition/core/load-compositions.test.ts
 */
import { test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { buildPluginTree, type PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  classifyEdges,
  resolveComposition,
  type CompositionManifest,
  type EdgeGraph,
} from "@plugins/plugin-meta/plugins/closure/core";
import { loadCompositions } from "./load-compositions";

let tree: PluginTree;
let graph: EdgeGraph;
let manifests: CompositionManifest[];

beforeAll(async () => {
  const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();
  tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true });
  graph = classifyEdges(tree);
  manifests = await loadCompositions();
});

const byName = (name: string): CompositionManifest => {
  const m = manifests.find((x) => x.name === name);
  if (!m) throw new Error(`composition "${name}" not discovered`);
  return m;
};

test("the seed agent-manager compositions are discovered", () => {
  expect(manifests.length).toBeGreaterThanOrEqual(2);
  expect(byName("agent-manager")).toBeDefined();
  expect(byName("agent-manager-lean")).toBeDefined();
});

test("every discovered composition resolves with no redundant selections", () => {
  for (const m of manifests) {
    const comp = resolveComposition(graph, m);
    expect(comp.redundantSelections).toEqual([]);
  }
});

test("anchor demo: full \\ lean bundle difference is exactly the self-improvement selection", () => {
  const full = byName("agent-manager");
  const lean = byName("agent-manager-lean");

  // The self-improvement set = what `full` selects beyond `lean`.
  const selfImprovement = full.selectedContributors.filter(
    (c) => !lean.selectedContributors.includes(c),
  );
  expect(selfImprovement.length).toBeGreaterThan(0);

  const fullComp = resolveComposition(graph, full);
  const leanComp = resolveComposition(graph, lean);

  // lean's bundle is a strict subset of full's.
  for (const id of leanComp.bundle) expect(fullComp.bundle.has(id)).toBe(true);
  expect(fullComp.bundle.size).toBeGreaterThan(leanComp.bundle.size);

  // Each self-improvement contributor is bundled in full, absent from lean.
  for (const id of selfImprovement) {
    expect(fullComp.bundle.has(id)).toBe(true);
    expect(leanComp.bundle.has(id)).toBe(false);
  }

  // Shared contributors stay in BOTH (they are not part of the delta).
  for (const id of lean.selectedContributors) {
    expect(fullComp.bundle.has(id)).toBe(true);
    expect(leanComp.bundle.has(id)).toBe(true);
  }

  // The bundle delta traces only to the self-improvement selection: every added
  // node is a selected self-improvement contributor or in one's hard closure
  // (i.e. membership contributor / via-contributor in full).
  const delta = [...fullComp.bundle].filter((id) => !leanComp.bundle.has(id));
  expect(delta.length).toBeGreaterThan(0);
  for (const id of delta) {
    expect(["contributor", "via-contributor"]).toContain(fullComp.membership.get(id)!);
  }
});
