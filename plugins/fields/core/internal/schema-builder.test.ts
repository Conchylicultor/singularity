import { test, expect } from "bun:test";
import { z } from "zod";
import { defineFieldType } from "./define";
import type { FieldDef, FieldsRecord } from "./field-spec";
import { fieldsToZodObject } from "./schema-builder";

const textType = defineFieldType<string>("__sb_text__");

function textField(def = ""): FieldDef<string> {
  return Object.freeze({
    type: textType,
    schema: z.string(),
    defaultValue: def,
    meta: {},
  });
}

test("fieldsToZodObject backfills missing keys with field defaults", () => {
  const record: FieldsRecord = { name: textField("anon") };
  const parsed = fieldsToZodObject(record).parse({});
  expect(parsed).toEqual({ name: "anon" });
});

test("fieldsToZodObject returns a STRICT object — unknown keys are NOT passed through", () => {
  const record: FieldsRecord = { name: textField() };
  // A plain z.object strips unknown keys (no .passthrough()): the extra key is
  // dropped from the parsed output rather than preserved.
  const parsed = fieldsToZodObject(record).parse({ name: "x", extra: "leak" });
  expect(parsed).toEqual({ name: "x" });
  expect("extra" in parsed).toBe(false);
});
