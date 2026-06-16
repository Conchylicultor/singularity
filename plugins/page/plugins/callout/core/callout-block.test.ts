import { describe, expect, it } from "bun:test";
import { calloutDataSchema } from "./callout-block";

// Regression: a callout's `text` is the canonical `string | RichText` contract
// (see editor/core/rich-text.ts). New writes through `BlockTextEditor` persist
// the structured run-array form, so the on-load `calloutBlock.parse(block.data)`
// must accept it. A schema typing `text` as a bare string threw
// `ZodError … path: ["text"]` on every reload of an edited callout.
describe("calloutDataSchema.text", () => {
  it("accepts the legacy plain-string form", () => {
    const parsed = calloutDataSchema.parse({
      text: "hello",
      icon: null,
      iconSvgNodes: null,
      color: "info",
    });
    expect(parsed.text).toBe("hello");
    expect(parsed.color).toBe("info");
  });

  it("accepts the structured rich-text run-array form (the regression)", () => {
    const runs = [{ text: "fdgdfVersion history test paragraph one." }];
    const parsed = calloutDataSchema.parse({
      text: runs,
      icon: "abc",
      iconSvgNodes: null,
      color: "success",
    });
    expect(parsed.text).toEqual(runs);
  });
});
