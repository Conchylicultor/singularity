import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ComponentType } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import { useViewsConfig } from "../internal/use-views-config";
import type { ViewTypeMeta } from "../../core";

// The engine reads rows off `useConfig(descriptor).views` and persists via
// `useSetConfig(descriptor)(key, value)`. Mock both: `useConfig` returns a fixed
// doc (so the reconcile effect's JSON identity stays stable and the optimistic
// mirror is the source of truth for assertions), `useSetConfig` a spy.
const setConfigSpy = vi.fn();
let configDoc: { views: unknown[] } = { views: [] };
vi.mock("@plugins/config_v2/web", () => ({
  useConfig: () => configDoc,
  useSetConfig: () => setConfigSpy,
}));

const Icon: ComponentType<{ className?: string }> = () => null;

// Minimal view-type contributions so `buildInstanceFromRow` resolves each row.
const contributions = [
  { type: "table", title: "Table", icon: Icon },
  { type: "gallery", title: "Gallery", icon: Icon },
] as unknown as SealContributions<ViewTypeMeta>[];

const descriptorMap = new Map<string, ConfigDescriptor>([
  ["k", {} as ConfigDescriptor],
]);

function renderViews(views: unknown[]) {
  configDoc = { views };
  return renderHook(() =>
    useViewsConfig<ViewTypeMeta>("k", descriptorMap, contributions, false, undefined),
  );
}

function ids(result: { current: ReturnType<typeof useViewsConfig> }): string[] {
  return result.current.instances.map((i) => i.instance.id);
}

describe("useViewsConfig — array-order (no rank)", () => {
  it("renders rows in authored array order", () => {
    const { result } = renderViews([
      { id: "a", name: "A", view: { type: "table" } },
      { id: "b", name: "B", view: { type: "table" } },
      { id: "c", name: "C", view: { type: "table" } },
    ]);
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("reorderView moves a row down by array splice", () => {
    const { result } = renderViews([
      { id: "a", name: "A", view: { type: "table" } },
      { id: "b", name: "B", view: { type: "table" } },
      { id: "c", name: "C", view: { type: "table" } },
      { id: "d", name: "D", view: { type: "table" } },
    ]);
    // Move A (index 0) to index 2 → lands after C.
    act(() => result.current.reorderView("a", 2));
    expect(ids(result)).toEqual(["b", "c", "a", "d"]);
  });

  it("reorderView moves a row up by array splice", () => {
    const { result } = renderViews([
      { id: "a", name: "A", view: { type: "table" } },
      { id: "b", name: "B", view: { type: "table" } },
      { id: "c", name: "C", view: { type: "table" } },
      { id: "d", name: "D", view: { type: "table" } },
    ]);
    // Move D (index 3) to index 1.
    act(() => result.current.reorderView("d", 1));
    expect(ids(result)).toEqual(["a", "d", "b", "c"]);
  });

  it("addView appends to the end", () => {
    const { result } = renderViews([
      { id: "a", name: "A", view: { type: "table" } },
    ]);
    let newIdReturned = "";
    act(() => {
      newIdReturned = result.current.addView("gallery");
    });
    const order = ids(result);
    expect(order).toHaveLength(2);
    expect(order[0]).toBe("a");
    expect(order[1]).toBe(newIdReturned);
  });

  it("duplicateView inserts the clone immediately after the source", () => {
    const { result } = renderViews([
      { id: "a", name: "A", view: { type: "table" } },
      { id: "b", name: "B", view: { type: "table" } },
      { id: "c", name: "C", view: { type: "table" } },
    ]);
    let cloneId = "";
    act(() => {
      cloneId = result.current.duplicateView("b");
    });
    const order = ids(result);
    // Clone lands directly after "b".
    expect(order).toEqual(["a", "b", cloneId, "c"]);
  });
});

describe("useViewsConfig — mergeView key omission (Part B)", () => {
  it("drops keys whose merged value is undefined instead of persisting them", () => {
    const { result } = renderViews([
      {
        id: "a",
        name: "A",
        view: { type: "table", sort: [{ fieldId: "x", direction: "asc" }] },
      },
    ]);
    // A host clears the sort by passing `sort: undefined`.
    act(() => {
      result.current.updateView(
        "a",
        { sort: undefined } as unknown as VariantValue,
        { merge: true },
      );
    });
    const view = result.current.viewFor("a");
    expect(view).toBeDefined();
    // The key is GONE — not persisted as `sort: []` / `sort: null` / `sort: undefined`.
    expect(view && "sort" in view).toBe(false);
    // Other keys survive the merge.
    expect(view?.type).toBe("table");
  });
});
