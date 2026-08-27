/**
 * The inline-chip registry: what `inlineChip()` records, and what the three
 * reads over it answer.
 *
 * A pure-logic suite, so it sits next to its source under `bun:test`. Nothing
 * here renders — `component` is only ever carried, never called — which is why
 * a stub function stands in for a chip and no DOM is needed.
 *
 * The registry is module state, so every chip declared here uses an id no other
 * test in this file reuses (vitest/bun both isolate per FILE, not per test).
 */

import { describe, expect, test } from "bun:test";
import { inlineChip, inlineChipFor, inlineChips } from "./inline-registry";
import { activeDataInlineExtension } from "./inline-extension";

const stub = () => null;

describe("inlineChip", () => {
  test("records the chip once, and hands back the contribution", () => {
    const chip = inlineChip({
      id: "test-records",
      pattern: /records-\d+/,
      surfaces: ["transcript"],
      component: stub,
    });

    expect(chip.display).toBe("inline");
    expect(chip.id).toBe("test-records");
    expect(inlineChips("transcript").filter((c) => c.id === chip.id)).toEqual([
      chip,
    ]);
  });

  test("throws on a duplicate id, naming both patterns", () => {
    inlineChip({
      id: "test-duplicate",
      pattern: /first-\d+/,
      surfaces: ["transcript"],
      component: stub,
    });

    expect(() =>
      inlineChip({
        id: "test-duplicate",
        pattern: /second-\d+/,
        surfaces: ["document"],
        component: stub,
      }),
    ).toThrow(/test-duplicate/);
  });
});

describe("inlineChips(surface)", () => {
  test("a transcript-only chip is excluded from the document surface", () => {
    const transcriptOnly = inlineChip({
      id: "test-transcript-only",
      pattern: /transcript-only-\d+/,
      surfaces: ["transcript"],
      component: stub,
    });
    const both = inlineChip({
      id: "test-both-surfaces",
      pattern: /both-surfaces-\d+/,
      surfaces: ["transcript", "document"],
      component: stub,
    });

    const ids = (surface: "transcript" | "document") =>
      inlineChips(surface).map((c) => c.id);

    expect(ids("transcript")).toContain(transcriptOnly.id);
    expect(ids("transcript")).toContain(both.id);
    expect(ids("document")).not.toContain(transcriptOnly.id);
    expect(ids("document")).toContain(both.id);
  });
});

describe("activeDataInlineExtension(surface)", () => {
  test("unions only the chips that declared the surface", () => {
    inlineChip({
      id: "test-union-transcript",
      pattern: /uniontranscript-\d+/,
      surfaces: ["transcript"],
      component: stub,
    });
    inlineChip({
      id: "test-union-document",
      pattern: /uniondocument-\d+/,
      surfaces: ["transcript", "document"],
      component: stub,
    });

    const documentSource =
      activeDataInlineExtension("document")!.pattern.source;
    expect(documentSource).toContain("uniondocument-");
    expect(documentSource).not.toContain("uniontranscript-");

    const transcriptSource =
      activeDataInlineExtension("transcript")!.pattern.source;
    expect(transcriptSource).toContain("uniontranscript-");
    expect(transcriptSource).toContain("uniondocument-");
  });

  test("the union matches each member's token, and only whole tokens", () => {
    inlineChip({
      id: "test-union-match",
      pattern: /matchme-\d+/,
      surfaces: ["document"],
      component: stub,
    });
    const extension = activeDataInlineExtension("document")!;

    // The scan re-mints the pattern per call, so `lastIndex` cannot leak; this
    // asserts the union's SHAPE, which is what a host compiles.
    expect(new RegExp(extension.pattern.source).test("matchme-12")).toBe(true);
    expect(new RegExp(extension.pattern.source).test("matchme-")).toBe(false);
  });
});

describe("inlineChipFor(token)", () => {
  test("resolves by ANCHORED full match, so an embedded id never wins", () => {
    const inner = inlineChip({
      id: "test-anchor-inner",
      pattern: /inner-\d+/,
      surfaces: ["transcript"],
      component: stub,
    });
    const outer = inlineChip({
      id: "test-anchor-outer",
      // Deliberately contains the inner chip's token shape.
      pattern: /<wrap>inner-\d+<\/wrap>/,
      surfaces: ["transcript"],
      component: stub,
    });

    expect(inlineChipFor("<wrap>inner-12</wrap>")?.id).toBe(outer.id);
    expect(inlineChipFor("inner-12")?.id).toBe(inner.id);
  });

  test("an unclaimed token resolves to null, so the caller keeps the text", () => {
    expect(inlineChipFor("nothing-claims-this")).toBeNull();
  });
});
