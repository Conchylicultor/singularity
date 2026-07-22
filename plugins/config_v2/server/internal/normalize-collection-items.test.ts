import { describe, expect, it } from "bun:test";
import { normalizeCollectionItems } from "./registry";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import type { FieldsRecord } from "@plugins/fields/core";

const renderList: FieldsRecord = {
  items: listField({ label: "Items", itemFields: { name: textField({}) } }),
};

const stableList: FieldsRecord = {
  views: listField({
    label: "Views",
    stableIdentity: true,
    itemFields: { name: textField({}) },
  }),
};

describe("normalizeCollectionItems", () => {
  it("drops rank from every item (array order is canonical)", () => {
    const out = normalizeCollectionItems(
      { items: [{ id: "a", rank: "a0", name: "A" }, { id: "b", rank: "a1", name: "B" }] },
      renderList,
    );
    const items = (out.items as Record<string, unknown>[]);
    expect(items.every((i) => !("rank" in i))).toBe(true);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("migrates a legacy rank-ordered file into array order, then drops rank", () => {
    // Array order (b, a) disagrees with rank order (a0 < a1 ⇒ a, b): sort by rank.
    const out = normalizeCollectionItems(
      { items: [{ id: "b", rank: "a1", name: "B" }, { id: "a", rank: "a0", name: "A" }] },
      renderList,
    );
    const items = out.items as Record<string, unknown>[];
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items.every((i) => !("rank" in i))).toBe(true);
  });

  it("is idempotent — a rank-free array keeps its order", () => {
    const doc = { items: [{ id: "x", name: "X" }, { id: "y", name: "Y" }] };
    const once = normalizeCollectionItems(doc, renderList);
    const twice = normalizeCollectionItems(once, renderList);
    expect((twice.items as Record<string, unknown>[]).map((i) => i.id)).toEqual(["x", "y"]);
  });

  it("synthesizes a deterministic auto-id for id-less rows of a render list", () => {
    const out = normalizeCollectionItems({ items: [{ name: "A" }] }, renderList);
    const id = (out.items as Record<string, unknown>[])[0]!.id as string;
    expect(id).toMatch(/^auto-/);
    // Deterministic: same content + position ⇒ same id.
    const again = normalizeCollectionItems({ items: [{ name: "A" }] }, renderList);
    expect((again.items as Record<string, unknown>[])[0]!.id).toBe(id);
  });

  it("never synthesizes ids for a stableIdentity list — an id-less row is left as authored", () => {
    const out = normalizeCollectionItems({ views: [{ name: "Tree" }] }, stableList);
    const row = (out.views as Record<string, unknown>[])[0]!;
    expect("id" in row).toBe(false);
  });

  it("preserves an explicit stableIdentity id verbatim (never re-minted)", () => {
    const out = normalizeCollectionItems(
      { views: [{ id: "tree", rank: "a0", name: "Tree" }] },
      stableList,
    );
    const row = (out.views as Record<string, unknown>[])[0]!;
    expect(row.id).toBe("tree");
    expect("rank" in row).toBe(false);
  });

  it("returns a new doc object without mutating the input", () => {
    const input = { items: [{ id: "a", rank: "a0", name: "A" }] };
    const out = normalizeCollectionItems(input, renderList);
    expect(out).not.toBe(input);
    expect((input.items[0] as Record<string, unknown>).rank).toBe("a0"); // input untouched
  });
});
