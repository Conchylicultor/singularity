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

// The behaviour `ZodParser<T>` exists to permit. `FieldDef.schema` used to be
// `z.ZodType<T>` — input === output — which made a schema carrying an INNER
// `.default()` unusable as a field schema at all, because `.default()` is
// precisely a combinator whose input is wider than its output. Callers worked
// around it with `.optional()` plus a hand-written normalizer.
//
// A field schema parses jsonb / JSON / wire, so its input is `unknown`; this
// pins that the inner default both type-checks and actually applies once the
// field is composed into a record. Mirrors `events.date`, the real case.
const jsonType = defineFieldType<{ freq: string; interval: number }>("__sb_json__");

test("a field schema may carry an INNER .default(), and it applies through composition", () => {
  const RuleSchema = z.object({
    freq: z.string(),
    interval: z.number().int().positive().default(1),
  });
  const ruleField: FieldDef<z.infer<typeof RuleSchema>> = Object.freeze({
    type: jsonType,
    schema: RuleSchema,
    defaultValue: { freq: "weekly", interval: 1 },
    meta: {},
  });

  // `interval` is absent on the wire — the inner default supplies it.
  const parsed = fieldsToZodObject({ rule: ruleField }).parse({
    rule: { freq: "weekly" },
  });
  expect(parsed.rule).toEqual({ freq: "weekly", interval: 1 });
});
