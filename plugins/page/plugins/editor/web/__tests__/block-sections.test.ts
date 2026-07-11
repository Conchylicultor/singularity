import { describe, expect, it } from "vitest";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReorderNodeData, TopLevelEntry } from "@plugins/reorder/web";
import type { BlockHandle } from "../../core";
import { entriesToSections, flattenSections } from "../internal/block-sections";

// --- Fixture builders (shape-only; the transform reads `.block`, `.type`,
// `.payload.label`, `.members`, and the `_node` discriminant). ----------------

function handle(type: string, label?: string): BlockHandle<unknown> {
  return { type, label } as unknown as BlockHandle<unknown>;
}

function contrib(h: BlockHandle<unknown>): Contribution {
  return {
    _pluginId: `page.${h.type}`,
    id: h.type,
    block: h,
  } as unknown as Contribution;
}

function header(
  label: string | undefined,
  members: TopLevelEntry[],
): ReorderNodeData {
  return {
    _node: true,
    type: "header",
    payload: label === undefined ? {} : { label },
    members,
    rawNode: {} as never,
  } as ReorderNodeData;
}

function spacer(id: string): ReorderNodeData {
  return {
    _node: true,
    type: "spacer",
    id,
    payload: {},
    rawNode: {} as never,
  } as ReorderNodeData;
}

/** Compact assertion view: [{ label, types }]. */
function shape(entries: TopLevelEntry[], enabled?: readonly string[]) {
  return entriesToSections(entries, enabled).map((s) => ({
    label: s.label,
    types: s.blocks.map((b) => b.type),
  }));
}

describe("entriesToSections", () => {
  it("groups a run of loose top-level items into one label-less section", () => {
    const entries = [
      contrib(handle("text", "Text")),
      contrib(handle("quote", "Quote")),
    ];
    expect(shape(entries)).toEqual([
      { label: undefined, types: ["text", "quote"] },
    ]);
  });

  it("turns a header node into a labeled section", () => {
    const entries = [
      header("Basic blocks", [
        contrib(handle("text", "Text")),
        contrib(handle("quote", "Quote")),
      ]),
    ];
    expect(shape(entries)).toEqual([
      { label: "Basic blocks", types: ["text", "quote"] },
    ]);
  });

  it("drops blocks that declare no menu label (loose and inside headers)", () => {
    const loose = [contrib(handle("text", "Text")), contrib(handle("divider"))];
    expect(shape(loose)).toEqual([{ label: undefined, types: ["text"] }]);

    const grouped = [
      header("Basic blocks", [
        contrib(handle("text", "Text")),
        contrib(handle("divider")), // no label → dropped
      ]),
    ];
    expect(shape(grouped)).toEqual([
      { label: "Basic blocks", types: ["text"] },
    ]);
  });

  it("applies the enabledBlockTypes allowlist", () => {
    const entries = [
      contrib(handle("text", "Text")),
      contrib(handle("image", "Image")),
    ];
    expect(shape(entries, ["text"])).toEqual([
      { label: undefined, types: ["text"] },
    ]);
  });

  it("drops a section left empty after filtering", () => {
    const entries = [header("Media", [contrib(handle("image", "Image"))])];
    // image not in the allowlist → section is empty → dropped entirely.
    expect(shape(entries, ["text"])).toEqual([]);
  });

  it("ignores spacer / unknown nodes without splitting a loose run", () => {
    const entries = [
      contrib(handle("text", "Text")),
      spacer("s1"),
      contrib(handle("quote", "Quote")),
    ];
    expect(shape(entries)).toEqual([
      { label: undefined, types: ["text", "quote"] },
    ]);
  });

  it("preserves order across interleaved loose runs and headers", () => {
    const entries = [
      contrib(handle("text", "Text")),
      header("Media", [contrib(handle("image", "Image"))]),
      contrib(handle("quote", "Quote")),
    ];
    expect(shape(entries)).toEqual([
      { label: undefined, types: ["text"] },
      { label: "Media", types: ["image"] },
      { label: undefined, types: ["quote"] },
    ]);
  });

  it("emits nothing for an empty or fully-filtered tree", () => {
    expect(shape([])).toEqual([]);
    expect(shape([contrib(handle("divider"))])).toEqual([]);
  });
});

describe("flattenSections", () => {
  it("concatenates section blocks in order", () => {
    const a = handle("text", "Text");
    const b = handle("image", "Image");
    const c = handle("quote", "Quote");
    const flat = flattenSections([
      { label: "Basic blocks", blocks: [a] },
      { blocks: [b, c] },
    ]);
    expect(flat.map((h) => h.type)).toEqual(["text", "image", "quote"]);
  });
});
