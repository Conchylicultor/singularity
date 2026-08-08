import { describe, expect, test } from "bun:test";
import { deriveEnumFieldDef, readOptions } from "./enum-config";

const OPTIONS = [
  { value: "9f1c-…-a3", label: "In review" },
  { value: "2b7e-…-c8", label: "Shipped" },
];

describe("readOptions", () => {
  test("reads the options list out of the opaque blob", () => {
    expect(readOptions({ options: OPTIONS })).toEqual(OPTIONS);
  });

  test("a blob with no options (or none at all) reads as empty", () => {
    expect(readOptions({})).toEqual([]);
    expect(readOptions(undefined)).toEqual([]);
  });
});

describe("deriveEnumFieldDef", () => {
  // The whole point of the projection: consumers (chip cell, inline editor,
  // filter input, group-by section label) read `FieldDef.options` and never the
  // private blob, so an option renders as its label and not its minted value.
  test("publishes the private options as the generic FieldDef.options", () => {
    expect(deriveEnumFieldDef({ options: OPTIONS })).toEqual({
      options: OPTIONS,
    });
  });

  test("projects generic keys ONLY — never identity or storage", () => {
    const derived = deriveEnumFieldDef({ options: OPTIONS, id: "hijack" });
    expect(Object.keys(derived)).toEqual(["options"]);
  });

  test("an unconfigured column derives an empty option list, not undefined", () => {
    expect(deriveEnumFieldDef(undefined)).toEqual({ options: [] });
  });
});
