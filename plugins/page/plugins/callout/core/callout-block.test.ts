import { describe, expect, it } from "bun:test";
import { calloutDataSchema } from "./callout-block";

// A callout's `text` is the canonical `RichText` contract (runs-only; the legacy
// `string | RichText` union is retired — see editor/core/rich-text.ts). The
// schema itself accepts ONLY the run-array form; a legacy plain string is
// canonicalized to runs upstream at the write boundary (parse-block-data.ts),
// never by the schema. New writes through `BlockTextEditor` already persist runs.
describe("calloutDataSchema.text", () => {
  it("accepts the structured rich-text run-array form", () => {
    const runs = [{ text: "fdgdfVersion history test paragraph one." }];
    const parsed = calloutDataSchema.parse({
      text: runs,
      icon: "abc",
      iconSvgNodes: null,
      color: "success",
    });
    expect(parsed.text).toEqual(runs);
  });

  it("rejects a bare string (the union is retired; strings normalize at the boundary)", () => {
    expect(() =>
      calloutDataSchema.parse({
        text: "hello",
        icon: null,
        iconSvgNodes: null,
        color: "info",
      }),
    ).toThrow();
  });
});
