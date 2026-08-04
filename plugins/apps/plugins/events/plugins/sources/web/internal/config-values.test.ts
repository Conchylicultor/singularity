import { describe, expect, test } from "bun:test";
import { nullable, type FieldsRecord } from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { initialConfigValues, readConfigValues } from "./config-values";

// A stand-in source type's config record. Deliberately NOT one of the shipped
// source types: this file tests the GENERIC form machinery, and naming a real
// type here would be the first crack in "the UI names no source type".
const fields = {
  url: textField({ label: "Page URL" }),
  hint: nullable(textField({ label: "Hint" })),
  limit: intField({ label: "Limit", default: 10 }),
} satisfies FieldsRecord;

describe("initialConfigValues", () => {
  test("seeds every key from the field's own default", () => {
    expect(initialConfigValues(fields)).toEqual({
      url: "",
      hint: null,
      limit: 10,
    });
  });

  test("a zero-config type seeds an empty object, not undefined", () => {
    expect(initialConfigValues({})).toEqual({});
  });
});

describe("readConfigValues", () => {
  test("backfills a key the stored blob predates", () => {
    const result = readConfigValues(fields, { url: "https://example.test" });
    expect(result).toEqual({
      status: "ok",
      values: { url: "https://example.test", hint: null, limit: 10 },
    });
  });

  test("coerces a JSON-round-tripped date back to a Date", () => {
    const dated = { when: dateField({ label: "When" }) } satisfies FieldsRecord;
    const result = readConfigValues(dated, { when: "2026-08-03T10:00:00.000Z" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.values.when).toBeInstanceOf(Date);
  });

  test("reports a blob that no longer fits its schema instead of half-reading it", () => {
    const result = readConfigValues(fields, { url: 42 });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("strips a key the type no longer declares (matching server validation)", () => {
    const result = readConfigValues(fields, {
      url: "https://example.test",
      gone: "stale",
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(result.values).sort()).toEqual(["hint", "limit", "url"]);
  });
});
