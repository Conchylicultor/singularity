import { test, expect } from "bun:test";
import { computeLoadWaves } from "./waves";
import { topoSortPlugins } from "./topo";

// A plugin never appears before every in-graph plugin it depends on: its wave
// index strictly exceeds each dependency's. This is the load-order invariant the
// wave loader relies on to keep a barrel fully evaluated before any dependent
// imports it (see `computeLoadWaves`). Concrete edges below use minimal
// `{ pluginPath, dependsOn }` stubs — the only shape the function reads.
const e = (pluginPath: string, dependsOn: string[] = []) => ({ pluginPath, dependsOn });

function waveIndex(waves: { pluginPath: string }[][]): Map<string, number> {
  const idx = new Map<string, number>();
  waves.forEach((wave, i) => wave.forEach((n) => idx.set(n.pluginPath, i)));
  return idx;
}

test("a dependency always lands in an earlier wave than its dependent", () => {
  const waves = computeLoadWaves([
    e("editor"),
    e("text", ["editor"]),
    e("heading", ["editor"]),
    e("cover", ["editor", "attachment-block"]),
    e("attachment-block", ["editor"]),
  ]);
  const at = waveIndex(waves);
  expect(at.get("editor")!).toBeLessThan(at.get("text")!);
  expect(at.get("editor")!).toBeLessThan(at.get("heading")!);
  expect(at.get("attachment-block")!).toBeLessThan(at.get("cover")!);
  expect(at.get("editor")!).toBeLessThan(at.get("cover")!);
});

test("independent plugins share wave 0", () => {
  const waves = computeLoadWaves([e("a"), e("b"), e("c")]);
  expect(waves).toHaveLength(1);
  expect(waves[0]!.map((n) => n.pluginPath).sort()).toEqual(["a", "b", "c"]);
});

test("edges to plugins absent from the entry set are ignored, not deadlocked", () => {
  // `text` depends on `web-only`, which is not a server entry — the edge is
  // dropped so `text` still resolves (to wave 0) rather than waiting forever.
  const waves = computeLoadWaves([e("text", ["web-only"])]);
  expect(waves).toHaveLength(1);
  expect(waves[0]!.map((n) => n.pluginPath)).toEqual(["text"]);
});

test("every entry is placed exactly once", () => {
  const entries = [e("a"), e("b", ["a"]), e("c", ["b"]), e("d", ["a", "c"])];
  const waves = computeLoadWaves(entries);
  const flat = waves.flat().map((n) => n.pluginPath).sort();
  expect(flat).toEqual(["a", "b", "c", "d"]);
});

test("a genuine cycle throws with the cycle path", () => {
  expect(() => computeLoadWaves([e("a", ["b"]), e("b", ["a"])])).toThrow(/load cycle/);
});

test("empty input yields no waves", () => {
  expect(computeLoadWaves([])).toEqual([]);
});

// ── The real central graph ──────────────────────────────────────────────
// Mirrors the actual `centralEntries` shape from
// `plugins/framework/plugins/central-core/core/central.generated.ts`: the
// `infra/secrets` → {auth, fields.secret.config} → {auth.google, auth.notion}
// dependency shape whose final wave is the precise concurrent first-eval the
// core-warming step closes. Uses the ACTUAL pluginPath strings from the
// generated file.
test("the central graph partitions into the expected three waves", () => {
  const waves = computeLoadWaves([
    e("auth", ["infra/plugins/secrets"]),
    e("auth/plugins/google", ["auth", "fields/plugins/secret/plugins/config"]),
    e("auth/plugins/notion", ["auth", "fields/plugins/secret/plugins/config"]),
    e("fields/plugins/secret/plugins/config", ["infra/plugins/secrets"]),
    e("infra/plugins/secrets", []),
  ]);
  const at = waveIndex(waves);
  // Wave 0: the sole root.
  expect(at.get("infra/plugins/secrets")!).toBe(0);
  // Wave 1: both direct dependents of the root.
  expect(at.get("auth")!).toBe(1);
  expect(at.get("fields/plugins/secret/plugins/config")!).toBe(1);
  // Wave 2: the two leaves that share a `core` dep and thus first-eval it
  // concurrently — the race the core-warming step closes.
  expect(at.get("auth/plugins/google")!).toBe(2);
  expect(at.get("auth/plugins/notion")!).toBe(2);
});

// ── topoSortPlugins ─────────────────────────────────────────────────────
// The init-phase order (register/onReady are driven by this). Previously
// untested. Keys on the resolved plugin refs' `id`, not the string edge list.
// A recursive node type so the stubs satisfy `T extends { dependsOn?: T[] }`.
interface Node {
  id: string;
  dependsOn: Node[];
}

test("topoSortPlugins places a dependency before its dependent", () => {
  const a: Node = { id: "a", dependsOn: [] };
  const b: Node = { id: "b", dependsOn: [a] };
  const c: Node = { id: "c", dependsOn: [b] };
  // Input order is reversed relative to the dependency order to prove the sort
  // actually reorders rather than passing input through.
  const ordered = topoSortPlugins([c, b, a]);
  const at = new Map(ordered.map((n, i) => [n.id, i] as const));
  expect(at.get("a")!).toBeLessThan(at.get("b")!);
  expect(at.get("b")!).toBeLessThan(at.get("c")!);
});

test("topoSortPlugins throws on a cycle", () => {
  const a: Node = { id: "a", dependsOn: [] };
  const b: Node = { id: "b", dependsOn: [a] };
  a.dependsOn.push(b);
  expect(() => topoSortPlugins([a, b])).toThrow(/init cycle/);
});
