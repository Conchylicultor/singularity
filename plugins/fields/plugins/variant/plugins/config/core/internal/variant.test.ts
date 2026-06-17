import { describe, expect, test } from "bun:test";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import {
  variantField,
  validateVariant,
  isVariantFieldDef,
  type VariantEntry,
} from "./variant";

// A stub per-type registry: the "table" variant's payload carries a nested
// `sort` object with `fieldId` + `direction` text sub-fields.
const registry = new Map<string, VariantEntry>([
  [
    "table",
    {
      label: "Table",
      fields: {
        sort: objectField({
          subFields: {
            fieldId: textField({ label: "Field" }),
            direction: textField({ label: "Direction" }),
          },
        }),
      },
    },
  ],
]);

describe("variantField", () => {
  test("schema validates the type discriminant and passes payload through", () => {
    const field = variantField();
    const parsed = field.schema.safeParse({
      type: "table",
      sort: { fieldId: "title", direction: "asc" },
    });
    expect(parsed.success).toBe(true);
    // Passthrough preserves the opaque payload verbatim.
    expect(parsed.success && parsed.data).toEqual({
      type: "table",
      sort: { fieldId: "title", direction: "asc" },
    });
  });

  test("schema rejects a value without a `type` discriminant", () => {
    const field = variantField();
    expect(field.schema.safeParse({ sort: {} }).success).toBe(false);
  });

  test("default value is an empty-type variant", () => {
    expect(variantField().defaultValue).toEqual({ type: "" });
    expect(variantField({ default: { type: "table" } }).defaultValue).toEqual({
      type: "table",
    });
  });

  test("isVariantFieldDef recognizes the token", () => {
    expect(isVariantFieldDef(variantField())).toBe(true);
    expect(isVariantFieldDef(textField())).toBe(false);
  });
});

describe("validateVariant", () => {
  test("validates payload against the chosen type's fields", () => {
    const result = validateVariant(
      { type: "table", sort: { fieldId: "title", direction: "asc" } },
      registry,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      type: "table",
      sort: { fieldId: "title", direction: "asc" },
    });
  });

  test("fails-soft on an unknown type", () => {
    expect(validateVariant({ type: "nope" }, registry)).toEqual({ ok: false });
  });
});
