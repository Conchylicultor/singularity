import { describe, expect, it } from "bun:test";
import { roleTokenKeys } from "@plugins/primitives/plugins/css/plugins/text/core";
import { typeScaleGroup } from "./group";

// Every role size / line height is multiplied by `--font-scale` at the element
// (`calc(var(--line-height-body) * var(--font-scale))`), so each must be a
// LENGTH: a unitless line height would be a factor the scale multiplies twice,
// and a `var()` chain freezes inside a sub-theme that only emits the keys it
// names.
const LENGTH = /^\d*\.?\d+(rem|px)$/;

describe("type-scale role tokens", () => {
  const schema: Readonly<Record<string, { default: string } | undefined>> =
    typeScaleGroup.schema;
  const keys = roleTokenKeys();

  // That the group declares EXACTLY the ladder's keys is the
  // `type-scale:closed-role-ladder` check's job (one authority), not this test's.

  it("defaults every role size and line height to a literal length", () => {
    const sized = keys.filter(
      (k) => k.startsWith("fontSize") || k.startsWith("lineHeight"),
    );
    expect(sized.length).toBeGreaterThan(0);
    const bad = sized.filter((k) => !LENGTH.test(schema[k]?.default ?? ""));
    expect(bad).toEqual([]);
  });

  it("defaults the inherited base size to rem, never em (panes nest scopes)", () => {
    expect(typeScaleGroup.schema.fontSizeBase.default).toMatch(/rem$/);
    expect(typeScaleGroup.schema.fontScale.default).toBe("1");
  });
});
