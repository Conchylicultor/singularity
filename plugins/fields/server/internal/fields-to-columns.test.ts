import { test, expect } from "bun:test";
import { z } from "zod";
import { integer, jsonb, text } from "drizzle-orm/pg-core";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { defineFieldType } from "@plugins/fields/core";
import type { FieldDef, FieldsRecord } from "@plugins/fields/core";
import { Fields } from "./storage";
import { fieldsToColumns } from "./fields-to-columns";

// Throwaway field types defined locally via fields/core keep this unit test
// decoupled from concrete field-type plugins (importing a sibling type would
// form a `fields ⇄ fields/plugins/<type>` cross-plugin cycle — see storage.test.ts).
const textType = defineFieldType<string>("__ftc_text__");
const intType = defineFieldType<number>("__ftc_int__");
const jsonType = defineFieldType<unknown>("__ftc_json__");
// A type with NO storage contribution — stands in for `enum` (no column mapping).
const noStorageType = defineFieldType<string>("__ftc_no_storage__");

function field<T>(type: ReturnType<typeof defineFieldType<T>>): FieldDef<T> {
  return Object.freeze({
    type,
    schema: z.any() as z.ZodType<T>,
    defaultValue: undefined as unknown as T,
    meta: {},
  });
}

collectContributions([
  {
    id: "fields-to-columns-test",
    contributions: [
      Fields.Storage({ type: textType, build: (n) => text(n) }),
      Fields.Storage({ type: intType, build: (n) => integer(n) }),
      Fields.Storage({ type: jsonType, build: (n) => jsonb(n) }),
    ],
  },
]);

test("fieldsToColumns returns a column builder per storage-backed field", () => {
  const record: FieldsRecord = {
    title: field(textType),
    count: field(intType),
    payload: field(jsonType),
  };

  const columns = fieldsToColumns(record);

  expect(Object.keys(columns).sort()).toEqual(["count", "payload", "title"]);
  for (const builder of Object.values(columns)) {
    expect(builder).toBeDefined();
  }
});

test("fieldsToColumns throws (naming key + type) for a field whose type has no storage", () => {
  const record: FieldsRecord = {
    title: field(textType),
    kind: field(noStorageType),
  };

  expect(() => fieldsToColumns(record)).toThrow(/"kind"/);
  expect(() => fieldsToColumns(record)).toThrow(/__ftc_no_storage__/);
});
