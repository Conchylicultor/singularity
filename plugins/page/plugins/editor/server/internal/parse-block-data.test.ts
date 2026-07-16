import { test, expect } from "bun:test";
import { z } from "zod";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { defineBlock, textBlockSchema, type BlockData } from "../../core";
import { Editor, resolveBlockHandle } from "./block-registry";
import { parseBlockData } from "./parse-block-data";

// Throwaway handles registered via `collectContributions`, keeping this resolver
// unit test decoupled from any concrete block-type plugin (importing one would form
// a cross-plugin cycle). `empty()` supplies the type's default so the absent-data
// path is observable.
const noteBlock = defineBlock({
  type: "__note__",
  schema: z.object({ title: z.string(), pinned: z.boolean() }),
  empty: () => ({ title: "untitled", pinned: false }),
});

function register(): void {
  collectContributions([
    { id: "note", contributions: [Editor.BlockData(noteBlock)] },
  ]);
}

// `BlockData` is branded so only `parseBlockData` can mint one; widening to the
// plain record it structurally IS lets `toEqual` compare against a literal. An
// annotated upcast, not a cast — the brand must never be forgeable.
function asRecord(data: BlockData): Record<string, unknown> {
  return data;
}

test("valid data parses to canonical output", () => {
  register();
  expect(asRecord(parseBlockData("__note__", { title: "hi", pinned: true }))).toEqual({
    title: "hi",
    pinned: true,
  });
});

test("missing required key is a 400", () => {
  register();
  try {
    parseBlockData("__note__", { title: "hi" });
    throw new Error("expected parseBlockData to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  }
});

test("unknown key is a 400 (strict, never stripped)", () => {
  register();
  try {
    parseBlockData("__note__", { title: "hi", pinned: false, junk: 1 });
    throw new Error("expected parseBlockData to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  }
});

test("absent data falls back to the type's empty()", () => {
  register();
  expect(asRecord(parseBlockData("__note__", undefined))).toEqual({
    title: "untitled",
    pinned: false,
  });
});

test("unknown block type is a 400", () => {
  register();
  try {
    parseBlockData("__does_not_exist__", {});
    throw new Error("expected parseBlockData to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  }
});

test("duplicate registration for one type throws loudly", () => {
  collectContributions([
    { id: "a", contributions: [Editor.BlockData(noteBlock)] },
    { id: "b", contributions: [Editor.BlockData(noteBlock)] },
  ]);
  expect(() => resolveBlockHandle("__note__")).toThrow(/Duplicate/);
});

// ── Stage 2: string `data.text` → runs normalization at the write boundary ──
//
// The persisted `data.text` shape is runs-only (`string | RichText` retired). A
// text-bearing type composes `textBlockSchema`; a void type has no `text` field.
// `__void__` mirrors the divider: it must still reject an injected `text` key.

const textBlock = defineBlock({
  type: "__text__",
  schema: textBlockSchema({}),
  empty: () => ({ text: [] }),
});

const voidBlock = defineBlock({
  type: "__void__",
  schema: z.object({}),
  empty: () => ({}),
});

function registerText(): void {
  collectContributions([
    {
      id: "text-blocks",
      contributions: [Editor.BlockData(textBlock), Editor.BlockData(voidBlock)],
    },
  ]);
}

test("string data.text is normalized to a single run", () => {
  registerText();
  expect(asRecord(parseBlockData("__text__", { text: "hello" }))).toEqual({
    text: [{ text: "hello" }],
  });
});

test('empty-string data.text normalizes to []', () => {
  registerText();
  expect(asRecord(parseBlockData("__text__", { text: "" }))).toEqual({ text: [] });
});

test("runs data.text passes through unchanged", () => {
  registerText();
  expect(
    asRecord(parseBlockData("__text__", { text: [{ text: "hi", marks: ["bold"] }] })),
  ).toEqual({ text: [{ text: "hi", marks: ["bold"] }] });
});

test("a MISSING text key on a text-bearing type is a loud 400 (never materialized as [])", () => {
  registerText();
  try {
    // A provided object without `text` must NOT fall back to empty() — only an
    // entirely absent `data` does. The normalizer is `text`-presence-gated.
    parseBlockData("__text__", {});
    throw new Error("expected parseBlockData to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  }
});

test("a void type with an injected string text key is still a 400", () => {
  registerText();
  try {
    parseBlockData("__void__", { text: "" });
    throw new Error("expected parseBlockData to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  }
});
