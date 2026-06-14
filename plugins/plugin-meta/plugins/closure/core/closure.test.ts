/**
 * Engine verification against the REAL plugin tree. Builds the tree once
 * (`skipBarrelImport: true`, so it works at build time / browser-less), classifies
 * edges, and resolves the `agent-manager` composition under the CONSERVATIVE opt-in
 * model, asserting the closure topology the design calls out. Run with `bun test`
 * from the repo root.
 *
 * Conservative model: NOTHING soft is included by default. The default bundle is the
 * pure hard closure of the entries; soft contributors become reviewable `available`
 * options the human/agent selects explicitly.
 */
import { test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { buildPluginTree, type PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { classifyEdges } from "./classify-edges";
import { resolveComposition } from "./resolve-composition";
import { explainInclusion } from "./explain";
import { impactOfPruning, impactOfSelecting } from "./impact";
import type { EdgeGraph, CompositionManifest } from "./types";

const AGENT_MANAGER = asPluginId("apps.agent-manager");
const AGENT_MANAGER_SHELL = asPluginId("apps.agent-manager.shell");
const SONATA = asPluginId("apps.sonata");
const SHELL = asPluginId("shell");
// A real `available` self-improvement contributor into the agent-manager bundle
// (verified via probe: `review` soft-contributes to `primitives.pane`, which is
// in the default hard closure of the entry).
const REVIEW = asPluginId("review");

const manifest: CompositionManifest = {
  name: "agent-manager",
  entryPoints: [AGENT_MANAGER],
  selectedContributors: [],
};

let tree: PluginTree;
let graph: EdgeGraph;

beforeAll(async () => {
  const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();
  tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true });
  graph = classifyEdges(tree);
});

function hasNode(id: string): boolean {
  for (const n of tree.byDir.values()) if (n.id === id) return true;
  return false;
}

test("the anchor plugin ids exist in the real tree", () => {
  for (const id of [AGENT_MANAGER, SONATA, SHELL, REVIEW]) {
    expect(hasNode(id)).toBe(true);
  }
});

test("default composition: small hard-only bundle + entry/required classification", () => {
  const comp = resolveComposition(graph, manifest);

  // The entry itself.
  expect(comp.membership.get(AGENT_MANAGER)).toBe("entry");

  // shell is hard-imported transitively from the entry's subtree ⇒ required (locked).
  expect(comp.bundle.has(SHELL)).toBe(true);
  expect(comp.membership.get(SHELL)).toBe("required");

  // Conservative INVARIANT (robust to tree drift — the exact count grows as main
  // adds plugins): with NO selected contributors the bundle is exactly the hard
  // closure of the entries, so every bundled node is `entry` or `required`, and
  // nothing soft is pulled in (zero contributor / via-contributor).
  for (const id of comp.bundle) {
    expect(["entry", "required"]).toContain(comp.membership.get(id)!);
  }
  const states = [...comp.membership.values()];
  expect(states.filter((s) => s === "contributor")).toHaveLength(0);
  expect(states.filter((s) => s === "via-contributor")).toHaveLength(0);

  // membership is total — every tree node has a state.
  expect(comp.membership.size).toBe(tree.byDir.size);

  // No selections ⇒ none redundant.
  expect(comp.redundantSelections).toEqual([]);

  // The bundle is a small fraction of the tree — nowhere near the ~64% the old
  // opt-out model produced.
  expect(comp.bundle.size).toBeLessThan(tree.byDir.size / 2);
});

// THE CONSERVATIVE WIN: under the old opt-out model, selecting `apps.agent-manager`
// dragged in ~64% of the repo (every app registered into the `Apps.App` switcher
// slot). Now nothing soft is auto-included, so sonata's whole subtree stays out of
// the bundle entirely — its sub-plugins are `excluded` or `available` (reviewable
// options), never bundled.
test("conservative: sonata's subtree is NOT bundled", () => {
  const comp = resolveComposition(graph, manifest);

  // The empty umbrella node itself is not bundled.
  expect(comp.bundle.has(SONATA)).toBe(false);
  expect(comp.membership.get(SONATA)).toBe("excluded");

  // Every sonata node (umbrella + sub-plugins) is out of the bundle: either
  // `excluded` or `available`. None is contributor/required/entry/via-contributor.
  const sonataNodes = [...tree.byDir.values()]
    .map((n) => n.id)
    .filter((id) => id === "apps.sonata" || id.startsWith("apps.sonata."));
  expect(sonataNodes.length).toBeGreaterThan(0);
  for (const id of sonataNodes) {
    expect(comp.bundle.has(id)).toBe(false);
    expect(["excluded", "available"]).toContain(comp.membership.get(id)!);
  }
});

test("available frontier: reviewable soft options into the bundle", () => {
  const comp = resolveComposition(graph, manifest);

  // There ARE reviewable options.
  expect(comp.available.length).toBeGreaterThan(0);

  // available is sorted + deduped.
  expect([...comp.available].sort()).toEqual(comp.available);
  expect(new Set(comp.available).size).toBe(comp.available.length);

  // A known self-improvement contributor (`review`) soft-contributes into the bundle
  // ⇒ it's an `available` option, not bundled.
  expect(comp.available).toContain(REVIEW);
  expect(comp.bundle.has(REVIEW)).toBe(false);
  expect(comp.membership.get(REVIEW)).toBe("available");
});

test("opt-in: selecting an available contributor pulls it into the bundle", () => {
  const comp = resolveComposition(graph, manifest);
  // Pick a real available id and select it.
  const X = comp.available[0]!;
  expect(comp.membership.get(X)).toBe("available");

  const selected = resolveComposition(graph, {
    ...manifest,
    selectedContributors: [X],
  });
  expect(selected.bundle.has(X)).toBe(true);
  expect(selected.membership.get(X)).toBe("contributor");

  // impactOfSelecting reports the cost of adding X — non-empty and includes X itself.
  const impact = impactOfSelecting(graph, manifest, X);
  expect(impact.length).toBeGreaterThan(0);
  expect(impact).toContain(X);
});

test("redundantSelections: selecting a required node is a surfaced no-op", () => {
  const withRedundant: CompositionManifest = { ...manifest, selectedContributors: [SHELL] };
  const base = resolveComposition(graph, manifest);
  const comp = resolveComposition(graph, withRedundant);

  // shell was already required; selecting it changes nothing about the bundle.
  expect(comp.bundle.has(SHELL)).toBe(true);
  expect(comp.membership.get(SHELL)).toBe("required");
  expect(comp.redundantSelections).toContain(SHELL);
  // Bundle unchanged.
  expect(comp.bundle.size).toBe(base.bundle.size);
});

test("explainInclusion for a required node returns an all-hard path from the entry", () => {
  const path = explainInclusion(graph, manifest, SHELL);
  expect(path).not.toBeNull();
  expect(path!.target).toBe(SHELL);
  expect(path!.originKind).toBe("entry");
  // The hard chain originates at the runtime-bearing sub-plugin of the entry
  // umbrella (the umbrella itself imports nothing).
  expect(path!.origin).toBe(AGENT_MANAGER_SHELL);
  const steps = path!.steps;
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) expect(step.kind).toBe("hard");
  // Path is contiguous: first step starts at the origin seed, last lands on target.
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  expect(first.from).toBe(AGENT_MANAGER_SHELL);
  expect(last.to).toBe(SHELL);
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i]!.from).toBe(steps[i - 1]!.to);
  }
});

test("impactOfPruning a hard-required node drops nothing", () => {
  expect(impactOfPruning(graph, manifest, SHELL)).toEqual([]);
});
