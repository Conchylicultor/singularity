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

describe("emptyRowData (the convert-path seed)", () => {
  // `empty()` seeding `{ text: [] }` is correct at block CREATION — a brand-new
  // id has no content doc, so its row is the only seed. A CONVERSION keeps the
  // block's id, hence its doc, hence its text, so every convert site seeds from
  // `emptyRowData()` instead: the same payload with `text` derived away, so no
  // call site hand-strips and none can clear a block's text by converting it.
  test("drops `text` while keeping the target type's other defaults", () => {
    const handle = defineBlock({
      type: "to-do",
      schema: textBlockSchema({ checked: z.boolean() }),
      empty: () => ({ text: [], checked: false }),
    });
    expect(handle.empty!()).toEqual({ text: [], checked: false });
    expect(handle.emptyRowData()).toEqual({ checked: false });
  });

  test("is an empty payload for a void type that declares no `empty`", () => {
    const handle = defineBlock({ type: "divider", schema: z.object({}) });
    expect(handle.emptyRowData()).toEqual({});
  });
});

describe("declared semantics (the type's ARIA identity)", () => {
  test("a text-bearing type carries its declaration onto the handle", () => {
    const handle = defineBlock({
      type: "heading-2",
      schema: textBlockSchema({}),
      markdownPrefixes: ["## "],
      textVariant: "heading",
      semantics: { role: "heading", level: 2 },
    });
    expect(handle.semantics).toEqual({ role: "heading", level: 2 });
  });

  test("a type that declares none has no semantics — nothing supplies a default", () => {
    // `textVariant: "title"` is the trap this pins: nothing derives a role from
    // typography, because "renders large" and "is a heading" are different
    // claims and only one of them is true of a big paragraph.
    const handle = defineBlock({
      type: "text",
      schema: textBlockSchema({}),
      textVariant: "title",
    });
    expect(handle.semantics).toBeUndefined();
  });

  test("a void type has none either (it has no line to describe)", () => {
    const handle = defineBlock({ type: "divider", schema: z.object({}) });
    expect(handle.semantics).toBeUndefined();
  });

  test("a void type CANNOT declare one — the gate is a compile error", () => {
    // The load-bearing half, and the only assertion that guards it: `semantics`
    // describes a LINE, so `SemanticsFor` collapses to a named unsatisfiable
    // object for a schema without the text-bearing brand. tsc fails on an
    // UNUSED `@ts-expect-error`, so if that gate ever stops erroring, the
    // type-check fails here rather than a void type silently carrying an inert
    // role. (Same idiom as `pane-write-path-types.test.ts`.)
    const handle = defineBlock({
      type: "divider",
      schema: z.object({}),
      // @ts-expect-error - a void schema has no line, so it may declare no semantics
      semantics: { role: "heading", level: 1 },
    });
    // It is rejected at the TYPE level only — nothing throws, so the value still
    // arrives on the handle. Pinned so the gate is never mistaken for a runtime
    // guard by someone reading only the test names.
    expect(handle.semantics).toEqual({ role: "heading", level: 1 });
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
    expect(textHandle.text({ text: [{ text: "a", marks: ["bold"] }] })).toEqual(
      [{ text: "a", marks: ["bold"] }],
    );
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
