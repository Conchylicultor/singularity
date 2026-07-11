import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineBlock } from "./define-block";

describe("defineBlock acceptsText", () => {
  test("is true when the schema declares a top-level `text` key", () => {
    const handle = defineBlock({
      type: "text",
      schema: z.object({ text: z.string(), checked: z.boolean().optional() }),
    });
    expect(handle.acceptsText).toBe(true);
  });

  test("is false for a void block type whose schema has no `text` key", () => {
    const handle = defineBlock({
      type: "divider",
      schema: z.object({}),
    });
    expect(handle.acceptsText).toBe(false);
  });

  test("is false when only NESTED keys are named `text` (top-level only)", () => {
    const handle = defineBlock({
      type: "nested",
      schema: z.object({ meta: z.object({ text: z.string() }) }),
    });
    expect(handle.acceptsText).toBe(false);
  });
});

describe("text-carry rule (the convert-path gate)", () => {
  // The three convert sites (slash menu, keyboard reset, markdown shortcut) all
  // apply this expression: carry `text` into the target payload iff the target's
  // schema declares it. A void target must never receive an unknown `text` key
  // (the write boundary rejects it with a 400).
  const carry = (handle: { acceptsText: boolean }, base: object, text: string) =>
    handle.acceptsText ? { ...base, text } : base;

  test("carries text into a text-bearing target", () => {
    const handle = defineBlock({ type: "text", schema: z.object({ text: z.string() }) });
    expect(carry(handle, { text: "" }, "hello")).toEqual({ text: "hello" });
  });

  test("omits text for a void target, preserving its empty payload", () => {
    const handle = defineBlock({ type: "divider", schema: z.object({}) });
    expect(carry(handle, {}, "hello")).toEqual({});
  });
});
