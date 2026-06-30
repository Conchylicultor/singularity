import { test, expect } from "bun:test";
import type {
  DefinitionStep,
  WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import {
  addStep,
  deleteStep,
  setEntry,
  setNext,
  connect,
  setRouteKey,
  setRouteTarget,
  addRoute,
  removeRoute,
} from "./step-ops";

function step(id: string, over: Partial<DefinitionStep> = {}): DefinitionStep {
  return {
    id,
    pluginId: "branch",
    label: id,
    config: {},
    next: null,
    nextStepMapping: null,
    ...over,
  };
}

function def(
  steps: DefinitionStep[],
  entryStepId: string | null = steps[0]?.id ?? null,
): WorkflowDefinition {
  return {
    id: "wf-1",
    name: "Test",
    description: null,
    steps: Object.fromEntries(steps.map((s) => [s.id, s])),
    entryStepId,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

/** Assert a step exists in a patch result and return it (keeps the assertions terse). */
function at(r: { steps: Record<string, DefinitionStep> }, id: string): DefinitionStep {
  const s = r.steps[id];
  if (!s) throw new Error(`expected step "${id}" in result`);
  return s;
}

test("addStep sets entry only when first", () => {
  const empty = def([], null);
  const first = addStep(empty, "branch", "Branch");
  expect(first.entryStepId).toBe(first.newStepId);
  expect(Object.keys(first.steps)).toHaveLength(1);
  expect(at(first, first.newStepId).label).toBe("Branch");

  const withOne = def([step("step-a")], "step-a");
  const second = addStep(withOne, "branch", "Branch");
  expect(second.entryStepId).toBe("step-a");
  expect(second.newStepId).not.toBe("step-a");
  expect(Object.keys(second.steps)).toHaveLength(2);
});

test("addStep does not mutate the source definition", () => {
  const base = def([], null);
  addStep(base, "branch", "Branch");
  expect(Object.keys(base.steps)).toHaveLength(0);
  expect(base.entryStepId).toBeNull();
});

test("deleteStep nulls inbound next and clears entry when deleting the entry", () => {
  const d = def([step("a", { next: "b" }), step("b")], "b");
  const r = deleteStep(d, "b");
  expect(r.steps.b).toBeUndefined();
  expect(at(r, "a").next).toBeNull();
  expect(r.entryStepId).toBeNull();
});

test("deleteStep prunes inbound mapping values and nulls an emptied mapping", () => {
  const d = def([
    step("a", { next: "c", nextStepMapping: { "case-1": "b" } }),
    step("b"),
    step("c"),
  ]);
  const r = deleteStep(d, "b");
  expect(at(r, "a").nextStepMapping).toBeNull();
  expect(at(r, "a").next).toBe("c");
});

test("deleteStep keeps other mapping entries when only one value matches", () => {
  const d = def([
    step("a", { nextStepMapping: { "case-1": "b", "case-2": "c" } }),
    step("b"),
    step("c"),
  ]);
  const r = deleteStep(d, "b");
  expect(at(r, "a").nextStepMapping).toEqual({ "case-2": "c" });
});

test("setEntry only changes entryStepId", () => {
  const d = def([step("a"), step("b")], "a");
  const r = setEntry(d, "b");
  expect(r.entryStepId).toBe("b");
  expect(Object.keys(r.steps)).toEqual(["a", "b"]);
});

test("setNext sets and clears the default edge", () => {
  const d = def([step("a"), step("b")]);
  expect(at(setNext(d, "a", "b"), "a").next).toBe("b");
  expect(at(setNext(d, "a", null), "a").next).toBeNull();
});

test("connect sets next first, then creates a unique case-N mapping key", () => {
  const d = def([step("a"), step("b"), step("c")]);
  const first = connect(d, "a", "b");
  expect(at(first, "a").next).toBe("b");
  expect(at(first, "a").nextStepMapping).toBeNull();

  const next = def([step("a", { next: "b" }), step("b"), step("c")]);
  const second = connect(next, "a", "c");
  expect(at(second, "a").next).toBe("b");
  expect(at(second, "a").nextStepMapping).toEqual({ "case-1": "c" });
});

test("connect picks the smallest free case-N key", () => {
  const d = def([
    step("a", { next: "b", nextStepMapping: { "case-1": "c" } }),
    step("b"),
    step("c"),
    step("e"),
  ]);
  const r = connect(d, "a", "e");
  expect(at(r, "a").nextStepMapping).toEqual({ "case-1": "c", "case-2": "e" });
});

test("connect refuses self-loops", () => {
  const d = def([step("a")]);
  const r = connect(d, "a", "a");
  expect(r.steps).toBe(d.steps);
  expect(at(r, "a").next).toBeNull();
});

test("connect refuses an exact duplicate route", () => {
  const onNext = def([step("a", { next: "b" }), step("b")]);
  expect(connect(onNext, "a", "b").steps).toBe(onNext.steps);

  const onMapping = def([
    step("a", { next: "b", nextStepMapping: { "case-1": "c" } }),
    step("b"),
    step("c"),
  ]);
  expect(connect(onMapping, "a", "c").steps).toBe(onMapping.steps);
});

test("setRouteKey renames a key", () => {
  const d = def([step("a", { nextStepMapping: { "case-1": "b" } }), step("b")]);
  const r = setRouteKey(d, "a", "case-1", "yes");
  expect(at(r, "a").nextStepMapping).toEqual({ yes: "b" });
});

test("setRouteKey rejects empty and duplicate keys", () => {
  const d = def([
    step("a", { nextStepMapping: { "case-1": "b", "case-2": "c" } }),
    step("b"),
    step("c"),
  ]);
  expect(setRouteKey(d, "a", "case-1", "").steps).toBe(d.steps);
  expect(setRouteKey(d, "a", "case-1", "case-2").steps).toBe(d.steps);
});

test("setRouteTarget repoints a route", () => {
  const d = def([step("a", { nextStepMapping: { "case-1": "b" } }), step("b"), step("c")]);
  const r = setRouteTarget(d, "a", "case-1", "c");
  expect(at(r, "a").nextStepMapping).toEqual({ "case-1": "c" });
});

test("addRoute adds under a fresh key", () => {
  const d = def([step("a", { nextStepMapping: { "case-1": "b" } }), step("b"), step("c")]);
  const r = addRoute(d, "a", "c");
  expect(at(r, "a").nextStepMapping).toEqual({ "case-1": "b", "case-2": "c" });
});

test("removeRoute deletes a route and nulls an emptied mapping", () => {
  const d = def([
    step("a", { nextStepMapping: { "case-1": "b", "case-2": "c" } }),
    step("b"),
    step("c"),
  ]);
  expect(at(removeRoute(d, "a", "case-1"), "a").nextStepMapping).toEqual({ "case-2": "c" });

  const single = def([step("a", { nextStepMapping: { "case-1": "b" } }), step("b")]);
  expect(at(removeRoute(single, "a", "case-1"), "a").nextStepMapping).toBeNull();
});
