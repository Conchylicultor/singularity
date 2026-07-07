/**
 * Tests for the `<…>`-tolerant marker-call scanner. Run with `bun test` from the
 * repo root.
 *
 * The regression these guard against: a fixed-string `marker(` token silently
 * MISSES the generic call form `marker<…>(…)` — the blind spot that let a
 * DB-backed `defineExternalResource<…>(…)` slip the `no-db-backed-notify` check
 * and let the resources facet undercount generic resources.
 */

import { test, expect } from "bun:test";
import { maskSource, markerCallSpans, findMarkerCalls } from "./index";

/** Convenience: the args interior of each span, sliced from the (masked) src. */
function spanArgs(src: string, marker: string): string[] {
  const masked = maskSource(src, { strings: false });
  return markerCallSpans(masked, marker).map((s) => masked.slice(s.open + 1, s.close));
}

// === markerCallSpans =========================================================

test("matches the plain call form", () => {
  const src = `const r = defineResource({ key: "a" });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a" }`]);
});

test("matches the single-line generic call form", () => {
  const src = `const r = defineResource<Task | null, { id: string }>({ key: "a" });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a" }`]);
});

test("matches the multi-line generic call form", () => {
  const src = `export const r =\n  defineResource<\n    Payload\n  >({ key: "a" });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a" }`]);
});

test("matches a `.`-member-prefixed call", () => {
  const src = `const r = h.runtime.defineResource<T>({ key: "a" });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a" }`]);
});

test("does NOT match a longer identifier containing the marker", () => {
  // `defineResource` must not fire inside `defineExternalResource`.
  const src = `const r = defineExternalResource<T, P>({ key: "a" });`;
  expect(markerCallSpans(maskSource(src), "defineResource")).toEqual([]);
  // …but the external marker itself matches the same generic form.
  expect(spanArgs(src, "defineExternalResource")).toEqual([`{ key: "a" }`]);
});

test("ignores a marker inside a comment (comments are always masked)", () => {
  const src = [
    `// defineResource<T>({ key: "nope" })`,
    `const r = defineResource({ key: "real" });`,
  ].join("\n");
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "real" }`]);
});

test("ignores a marker inside a string when strings are masked", () => {
  // The `findMarkerCalls` path masks strings, so a marker written inside a
  // string literal is never picked up.
  const src = [
    `const s = "defineResource({ key: 'nope' })";`,
    `const r = defineResource({ key: "real" });`,
  ].join("\n");
  const calls = findMarkerCalls(src, "defineResource");
  expect(calls.map((c) => c.argsText)).toEqual([`{ key: "real" }`]);
});

test("walks balanced parens, including nested calls in the args", () => {
  const src = `defineResource({ load: () => f(g(1)), key: "a" });`;
  expect(spanArgs(src, "defineResource")).toEqual([
    `{ load: () => f(g(1)), key: "a" }`,
  ]);
});

test("a stray `)` inside a string in the args does not end the span early", () => {
  // strings KEPT (mode-reading callers use `{ strings: false }`).
  const src = `defineResource({ key: "a)b", x: 1 });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a)b", x: 1 }`]);
});

test("finds multiple independent calls in one file", () => {
  const src = `defineResource<A>({ key: "a" });\ndefineResource({ key: "b" });`;
  expect(spanArgs(src, "defineResource")).toEqual([`{ key: "a" }`, `{ key: "b" }`]);
});

// === findMarkerCalls (now generic-tolerant) ==================================

test("findMarkerCalls picks up the generic call form too", () => {
  const src = `const r = defineResource<Payload>({ key: "x" });`;
  const calls = findMarkerCalls(src, "defineResource");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.argsText).toBe(`{ key: "x" }`);
});

test("findMarkerCalls finds a call whose generic type-arg contains parens", () => {
  // A shallow `<[^()]*?>` generic skip stops at the `(` in `() => void` and
  // silently drops the whole call — the real-world blind spot this guards.
  const src = `const s = defineFoo<{ f: () => void }>("id");`;
  const calls = findMarkerCalls(src, "defineFoo");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.argsText).toBe(`"id"`);
});

test("findMarkerCalls finds a call with a nested-generic type-arg", () => {
  const src = `const s = defineFoo<A<B>>("nested");`;
  const calls = findMarkerCalls(src, "defineFoo");
  expect(calls.map((c) => c.argsText)).toEqual([`"nested"`]);
});

test("findMarkerCalls finds a multi-line generic containing an arrow type", () => {
  const src = [
    `const App = defineRenderSlot<{`,
    `  onClick?: () => void;`,
    `  badge?: ComponentType<{ className?: string }>;`,
    `}>("apps.app", { foo: 1 });`,
  ].join("\n");
  const calls = findMarkerCalls(src, "defineRenderSlot");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.argsText).toBe(`"apps.app", { foo: 1 }`);
});

test("findMarkerCalls still finds the plain (non-generic) call form", () => {
  const src = `const s = defineFoo("plain");`;
  const calls = findMarkerCalls(src, "defineFoo");
  expect(calls.map((c) => c.argsText)).toEqual([`"plain"`]);
});

test("findMarkerCalls ignores a call embedded inside a string literal", () => {
  // A `defineFoo("phantom")` written INSIDE a string literal (a codegen
  // template, test fixture, or docs snippet) is blanked by the full string mask
  // and must never surface as a real call — only the genuine adjacent call is.
  const src = [
    `const code = 'defineFoo("phantom")';`,
    `const real = defineFoo("real");`,
  ].join("\n");
  const calls = findMarkerCalls(src, "defineFoo");
  expect(calls.map((c) => c.argsText)).toEqual([`"real"`]);
});
