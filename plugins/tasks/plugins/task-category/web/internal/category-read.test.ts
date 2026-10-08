/**
 * The `category` field's state from its two reads (the live set and the
 * registry). The load-bearing cases are the half-known ones: the set ready
 * while the registry is not would lay a category-grouped view out under raw
 * ids in id order, then relabel and reorder it when the registry lands — so
 * the field is `pending` (data-view holds a view grouped by a pending field in
 * its loading state, body-state.test.ts), and a registry failure with nothing
 * held is the field's `readError` with the REGISTRY's Retry.
 */

import { describe, expect, test } from "bun:test";
import { ResourceError } from "@plugins/primitives/plugins/live-state/core";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { TaskCategoryDef } from "@plugins/tasks/plugins/task-category/core";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import type { TaskCategoryMap } from "../hooks";
import { categoryFieldDef, categoryFieldRead, readOf } from "./category-read";

const mapRefetch = () => Promise.resolve();
const registryRefetch = () => Promise.resolve();
const failure = new ResourceError("loader-failed", "boom", null);

const MAP: TaskCategoryMap = new Map([["T1", "agents"]]);
const REGISTRY: TaskCategoryDef[] = [
  { id: "conversations", label: "Conversations", order: 0 },
  { id: "agents", label: "Agents", order: 2 },
];

function ready<T>(data: T, refetch = mapRefetch): ResourceResult<T> {
  return { status: "ready", data, refetch };
}
function loading<T>(refetch = mapRefetch): ResourceResult<T> {
  return { status: "loading", refetch };
}
function failed<T>(refetch = mapRefetch, stale?: T): ResourceResult<T> {
  return stale === undefined
    ? { status: "error", error: failure, refetch }
    : { status: "error", error: failure, stale, refetch };
}

const task = (id: string) => ({ id }) as TaskListItem;

function fieldFor(
  map: ResourceResult<TaskCategoryMap>,
  registry: ResourceResult<TaskCategoryDef[]>,
) {
  return categoryFieldDef(categoryFieldRead(readOf(map), readOf(registry)));
}

describe("the category field", () => {
  test("both known → the registry's options in its order, the map's values", () => {
    const field = fieldFor(ready(MAP), ready(REGISTRY, registryRefetch));
    expect(field.pending).toBeUndefined();
    expect(field.readError).toBeUndefined();
    expect(field.options).toEqual([
      { value: "conversations", label: "Conversations" },
      { value: "agents", label: "Agents" },
    ]);
    expect(field.value?.(task("T1"))).toBe("agents");
    expect(field.value?.(task("T2"))).toBeNull();
  });

  test("grouped by category while the registry is pending: the field is pending, no raw-id options", () => {
    const field = fieldFor(ready(MAP), loading(registryRefetch));
    expect(field.pending).toBe(true);
    expect(field.readError).toBeUndefined();
    expect(field.options).toEqual([]);
  });

  test("the map pending (registry ready) → pending, never None for every task", () => {
    const field = fieldFor(loading(), ready(REGISTRY, registryRefetch));
    expect(field.pending).toBe(true);
  });

  test("a registry failure with nothing held → readError with the registry's Retry", () => {
    const field = fieldFor(ready(MAP), failed(registryRefetch));
    expect(field.pending).toBeUndefined();
    expect(field.readError?.error).toBe(failure);
    expect(field.readError?.refetch).toBe(registryRefetch);
  });

  test("a registry failure outranks the map still loading", () => {
    const field = fieldFor(loading(), failed(registryRefetch));
    expect(field.readError?.refetch).toBe(registryRefetch);
  });

  test("the map's failure comes first, with the map's Retry", () => {
    const field = fieldFor(failed(mapRefetch), failed(registryRefetch));
    expect(field.readError?.refetch).toBe(mapRefetch);
  });

  test("a failure over a held value keeps painting that value", () => {
    const field = fieldFor(
      failed(mapRefetch, MAP),
      failed(registryRefetch, REGISTRY),
    );
    expect(field.pending).toBeUndefined();
    expect(field.readError).toBeUndefined();
    expect(field.value?.(task("T1"))).toBe("agents");
    expect(field.options?.length).toBe(2);
  });
});
