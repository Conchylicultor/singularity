import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineBlock } from "./define-block";
import { textBlockSchema } from "./text-data";

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

describe("typed text lens", () => {
  // Branded via `textBlockSchema`, so the lens is present at both the type level
  // (required `text(data): RichText`) and at runtime.
  const textHandle = defineBlock({
    type: "text",
    schema: textBlockSchema({}),
    empty: () => ({ text: [] }),
  });

  // The TYPED contract is runs-only (the union is retired), but the lens's
  // runtime still tolerates legacy strings: pre-migration history snapshots can
  // reach readers un-normalized. The cast below is the test deliberately handing
  // it that legacy wire shape.
  const legacy = (text: string) => ({ text }) as unknown as { text: [] };

  test("coerces a legacy empty string to []", () => {
    expect(textHandle.text(legacy(""))).toEqual([]);
  });

  test("coerces a legacy non-empty string to a single unmarked run", () => {
    expect(textHandle.text(legacy("hello"))).toEqual([{ text: "hello" }]);
  });

  test("passes an existing runs array through", () => {
    expect(textHandle.text({ text: [{ text: "a", marks: ["bold"] }] })).toEqual([
      { text: "a", marks: ["bold"] },
    ]);
  });

  test("a void handle has no lens (runtime undefined + type-level undefined)", () => {
    const voidHandle = defineBlock({ type: "divider", schema: z.object({}) });
    expect(voidHandle.text).toBeUndefined();
    // Type-level assertion: `text` is `undefined` on an unbranded (void) handle.
    // This line fails to compile if the lens type ever widens to a function.
    const lens: undefined = voidHandle.text;
    expect(lens).toBeUndefined();
  });
});
