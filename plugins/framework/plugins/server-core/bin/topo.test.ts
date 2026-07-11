import { test, expect } from "bun:test";
import { computeLoadWaves } from "./topo";

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
