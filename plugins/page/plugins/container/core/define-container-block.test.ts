import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { textBlockSchema } from "@plugins/page/plugins/editor/core";
import { defineContainerBlock } from "./define-container-block";

/**
 * The primitive's whole value is that the two container facts cannot be
 * declared piecemeal, and that a container cannot be text-bearing. These cases
 * pin both — a regression that stops forcing one of the flags, or starts
 * accepting a `text` field, is what re-creates the fused
 * container-identity-plus-first-line model this replaced.
 */
describe("defineContainerBlock", () => {
  const voidSchema = z.object({});
  const container = defineContainerBlock({
    type: "test-container",
    schema: voidSchema,
    label: "Test container",
    empty: () => ({}),
  });

  it("forces the two container facts", () => {
    expect(container.anchor).toBe(true);
    expect(container.wrapOnConvert).toBe(true);
  });

  it("is FOLDABLE: it declares no `collapsible`, so its stored `expanded` is live", () => {
    // The third forced fact used to be `collapsible: "never"`, which made the
    // flag inert because an anchor had no chevron to reopen itself with. A
    // collapsed container now folds to its BORROWED line — always painted,
    // always carrying the chevron back out — so the flag is meaningful and the
    // opt-out is gone. A regression that re-introduces it silently removes
    // folding from every container.
    expect(container.collapsible).toBeUndefined();
  });

  it("is void: no derived text lens, and none of the text-row seams", () => {
    expect(container.acceptsText).toBe(false);
    expect(container.text).toBeUndefined();
    expect(container.placeholder).toBeUndefined();
    expect(container.splitChildWhenExpanded).toBeUndefined();
    expect(container.resetToOnBackspaceAtStart).toBeUndefined();
    expect(container.breakOutOnEmptyEnter).toBeUndefined();
  });

  it("passes the declaration surface through to the handle", () => {
    expect(container.type).toBe("test-container");
    expect(container.label).toBe("Test container");
    expect(container.empty?.()).toEqual({});
  });

  it("throws on a text-bearing schema reaching it through `any`", () => {
    // The type-level `VoidBlockSchema` constraint rejects this at compile time;
    // the cast is what a JS caller (or a dynamically built schema) would do, and
    // the guard is what keeps that loud instead of minting a text-bearing
    // container whose first line is its own identity again.
    const textBearing = textBlockSchema({}) as unknown as typeof voidSchema;
    expect(() =>
      defineContainerBlock({ type: "bad", schema: textBearing }),
    ).toThrow(/must not declare `text`/);
  });
});
