import { it, expect } from "bun:test";

import { mergeGroupValues } from "./merge-group-values";
import type { TokenGroupSchema } from "../../core";

const schema: TokenGroupSchema = {
  fontSizeCaption: { default: "0.75rem" },
  fontSizeBody: { default: "1rem" },
  fontSizeTitle: { default: "2rem" },
};

it("fills holes from schema defaults while preset values win where present", () => {
  const result = mergeGroupValues(
    schema,
    // sparse preset: only some keys, and different sets per mode
    { light: { fontSizeBody: "0.9rem" }, dark: { fontSizeTitle: "2.5rem" } },
    {},
  );

  // all schema keys are present in both modes
  expect(Object.keys(result.light).sort()).toEqual(Object.keys(schema).sort());
  expect(Object.keys(result.dark).sort()).toEqual(Object.keys(schema).sort());

  // preset values win where present
  expect(result.light.fontSizeBody).toBe("0.9rem");
  expect(result.dark.fontSizeTitle).toBe("2.5rem");

  // holes fall through to schema defaults
  expect(result.light.fontSizeCaption).toBe("0.75rem");
  expect(result.light.fontSizeTitle).toBe("2rem");
  expect(result.dark.fontSizeCaption).toBe("0.75rem");
  expect(result.dark.fontSizeBody).toBe("1rem");
});

it("non-empty overrides win over preset and default; empty-string overrides are ignored", () => {
  const result = mergeGroupValues(
    schema,
    { light: { fontSizeBody: "0.9rem" }, dark: {} },
    {
      light: { fontSizeBody: "1.1rem", fontSizeCaption: "" },
      dark: { fontSizeTitle: "3rem" },
    },
  );

  // override wins over preset value
  expect(result.light.fontSizeBody).toBe("1.1rem");
  // override wins over schema default
  expect(result.dark.fontSizeTitle).toBe("3rem");
  // empty-string override is ignored → falls back to schema default
  expect(result.light.fontSizeCaption).toBe("0.75rem");
});

it("a complete preset is unchanged (defaults are no-ops)", () => {
  const complete = {
    light: {
      fontSizeCaption: "0.7rem",
      fontSizeBody: "0.95rem",
      fontSizeTitle: "1.9rem",
    },
    dark: {
      fontSizeCaption: "0.71rem",
      fontSizeBody: "0.96rem",
      fontSizeTitle: "1.91rem",
    },
  };
  const result = mergeGroupValues(schema, complete, {});
  expect(result.light).toEqual(complete.light);
  expect(result.dark).toEqual(complete.dark);
});
