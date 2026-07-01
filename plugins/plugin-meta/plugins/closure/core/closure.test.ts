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
import { resolveComposition, disabledClosure } from "./resolve-composition";
import { flattenManifest } from "./flatten-manifest";
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
  tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true, facets: true });
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

// ── flattenManifest: extends resolution (pure, no graph needed) ──────────────

test("flattenManifest unions an extended pack's contributors into the host", () => {
  const pack: CompositionManifest = {
    name: "self-improvement",
    entryPoints: [],
    selectedContributors: [asPluginId("review"), asPluginId("screenshot.draw-on-app")],
    extends: [],
  };
  const profile: CompositionManifest = {
    name: "full",
    entryPoints: [AGENT_MANAGER],
    selectedContributors: [asPluginId("ui.theme-toggle")],
    extends: ["self-improvement"],
  };

  const flat = flattenManifest(profile, [pack, profile]);
  expect([...flat.selectedContributors].map(String).sort()).toEqual(
    ["review", "screenshot.draw-on-app", "ui.theme-toggle"].sort(),
  );
  expect(flat.entryPoints).toEqual([AGENT_MANAGER]);
  // Always cleared after folding so downstream resolution never re-walks extends.
  expect(flat.extends).toEqual([]);
});

test("flattenManifest is diamond/cycle-safe and dedupes", () => {
  // a → b, a → c, b → c (diamond); plus c → a (cycle). All terminate, c folds once.
  const a: CompositionManifest = {
    name: "a",
    entryPoints: [asPluginId("apps.home")],
    selectedContributors: [asPluginId("ui.theme-toggle")],
    extends: ["b", "c"],
  };
  const b: CompositionManifest = {
    name: "b",
    entryPoints: [],
    selectedContributors: [asPluginId("review")],
    extends: ["c"],
  };
  const c: CompositionManifest = {
    name: "c",
    entryPoints: [],
    selectedContributors: [asPluginId("review"), asPluginId("reports.crash")],
    extends: ["a"],
  };

  const flat = flattenManifest(a, [a, b, c]);
  expect([...flat.selectedContributors].map(String).sort()).toEqual(
    ["reports.crash", "review", "ui.theme-toggle"].sort(),
  );
  expect([...flat.entryPoints].map(String)).toEqual(["apps.home"]);
});

test("flattenManifest ignores unknown extends references inertly", () => {
  const m: CompositionManifest = {
    name: "x",
    entryPoints: [asPluginId("apps.home")],
    selectedContributors: [asPluginId("ui.theme-toggle")],
    extends: ["does-not-exist"],
  };
  const flat = flattenManifest(m, [m]);
  expect([...flat.selectedContributors].map(String)).toEqual(["ui.theme-toggle"]);
});

// ── disabledClosure: reverse + subtree fixpoint (direction is load-bearing) ───

/**
 * Build a minimal synthetic EdgeGraph from explicit hard edges + a containment map.
 * Only the maps disabledClosure reads (`hardReverse`, `subtree`) are load-bearing;
 * the rest are seeded empty so the shape matches the real EdgeGraph by construction.
 */
function syntheticGraph(
  nodes: string[],
  hardEdges: [from: string, to: string][],
  subtree: Record<string, string[]>,
): EdgeGraph {
  const ids = nodes.map(asPluginId);
  const empty = () => new Map(ids.map((id) => [id, [] as ReturnType<typeof asPluginId>[]]));
  const hardForward = empty();
  const hardReverse = empty();
  const subtreeMap = empty();
  for (const [from, to] of hardEdges) {
    hardForward.get(asPluginId(from))!.push(asPluginId(to));
    hardReverse.get(asPluginId(to))!.push(asPluginId(from));
  }
  for (const [parent, kids] of Object.entries(subtree)) {
    subtreeMap.set(asPluginId(parent), kids.map(asPluginId));
  }
  return {
    hardForward,
    hardReverse,
    softForward: empty(),
    softReverse: empty(),
    subtree: subtreeMap,
    edges: hardEdges.map(([from, to]) => ({
      from: asPluginId(from),
      to: asPluginId(to),
      kind: "hard" as const,
    })),
  };
}

test("disabledClosure: pulls in transitive importers + descendants, leaves dependencies and unrelated nodes untouched", () => {
  // Import edge A → B means "A imports B" (so A breaks if B is disabled).
  //   dep      → seed  (seed imports dep — dep is a DEPENDENCY, must NOT be disabled)
  //   importer → seed  (importer imports seed — must be disabled)
  //   far      → importer (transitive importer — must be disabled)
  //   unrelated stands alone.
  // seed also has a child (subtree) that must be disabled.
  const graph = syntheticGraph(
    ["seed", "seed.child", "dep", "importer", "far", "unrelated"],
    [
      ["seed", "dep"], // seed imports dep
      ["importer", "seed"], // importer imports seed
      ["far", "importer"], // far imports importer
    ],
    { seed: ["seed.child"] },
  );

  const closure = disabledClosure([asPluginId("seed")], graph);

  // 1. Transitive importers + descendants are pulled in.
  expect(closure.has(asPluginId("seed"))).toBe(true);
  expect(closure.has(asPluginId("seed.child"))).toBe(true); // descendant
  expect(closure.has(asPluginId("importer"))).toBe(true); // direct importer
  expect(closure.has(asPluginId("far"))).toBe(true); // transitive importer

  // 2. A pure DEPENDENCY of the seed is NOT disabled — proves the reverse direction
  //    (we walk hardReverse, not hardForward).
  expect(closure.has(asPluginId("dep"))).toBe(false);

  // 3. An unrelated plugin is untouched.
  expect(closure.has(asPluginId("unrelated"))).toBe(false);

  // Exactly the expected set, nothing more.
  expect([...closure].map(String).sort()).toEqual(
    ["far", "importer", "seed", "seed.child"].sort(),
  );
});
