/**
 * Pure-logic tests for the compositions config: the seeded `default` items parse
 * against the descriptor schema, map to valid `CompositionManifest`s via the
 * mapper, and the agent-manager full-vs-lean pair realises the vision's anchor
 * demo (their `selectedContributors` set-difference IS exactly the
 * self-improvement selection). No generated registry, no server. Run with:
 *   bun test plugins/plugin-meta/plugins/composition/core/config.test.ts
 */
import { test, expect } from "bun:test";
import { compositionsConfig } from "./config";
import { manifestItemToManifest, type CompositionManifestItem } from "./manifest-map";

const seeds = compositionsConfig.defaults.manifests as CompositionManifestItem[];

const SELF_IMPROVEMENT = [
  "improve.element-picker",
  "review",
  "reports.crash",
  "reports.launch-fix",
  "screenshot.draw-on-app",
];

const byName = (name: string): CompositionManifestItem => {
  const m = seeds.find((x) => x.name === name);
  if (!m) throw new Error(`seed composition "${name}" not found`);
  return m;
};

test("the seeded default parses against the descriptor schema", () => {
  const parsed = compositionsConfig.schema.safeParse(compositionsConfig.defaults);
  expect(parsed.success).toBe(true);
});

test("both seeds carry explicit, distinct id + rank and the two flavors", () => {
  expect(seeds).toHaveLength(2);
  const ids = seeds.map((s) => s.id);
  const ranks = seeds.map((s) => s.rank);
  expect(new Set(ids).size).toBe(2);
  expect(new Set(ranks).size).toBe(2);
  expect(byName("agent-manager")).toBeDefined();
  expect(byName("agent-manager-lean")).toBeDefined();
});

test("each seed maps to a valid CompositionManifest via the mapper", () => {
  for (const item of seeds) {
    const m = manifestItemToManifest(item);
    expect(typeof m.name).toBe("string");
    expect(m.name.length).toBeGreaterThan(0);
    expect(Array.isArray(m.entryPoints)).toBe(true);
    expect(m.entryPoints.length).toBeGreaterThan(0);
    expect(Array.isArray(m.selectedContributors)).toBe(true);
    expect(m.selectedContributors.every((id) => typeof id === "string")).toBe(true);
  }
});

test("anchor demo: full \\ lean contributor difference is exactly the self-improvement set", () => {
  const full = manifestItemToManifest(byName("agent-manager"));
  const lean = manifestItemToManifest(byName("agent-manager-lean"));

  const diff = full.selectedContributors.filter(
    (c) => !lean.selectedContributors.includes(c),
  );

  // Set equality (order-independent) between the diff and the self-improvement
  // set. Compare as plain strings — `diff` is branded `PluginId[]`.
  expect([...diff].map(String).sort()).toEqual([...SELF_IMPROVEMENT].sort());

  // Lean's contributors are a strict subset of full's.
  for (const c of lean.selectedContributors) {
    expect(full.selectedContributors).toContain(c);
  }
});
