import { describe, it, expect } from "bun:test";

import {
  textStepFor,
  buttonTextClassFor,
  fieldSizeClassFor,
  type ControlSize,
} from "./control-size";

const ALL: ControlSize[] = ["xs", "sm", "md", "lg"];

describe("textStepFor — the single density→text-step policy", () => {
  it("drops one rung ONLY at the compact `xs` density", () => {
    expect(textStepFor("xs")).toBe(1);
  });

  it("keeps the comfortable size at sm/md/lg", () => {
    for (const d of ["sm", "md", "lg"] as const) {
      expect(textStepFor(d)).toBe(0);
    }
  });
});

describe("buttonTextClassFor — Button's text rungs driven by the shared step", () => {
  it("maps all four tiers (xs → the compact control rung, sm/md/lg → the control role)", () => {
    const expected: Record<ControlSize, string> = {
      xs: "text-control-compact",
      sm: "text-control",
      md: "text-control",
      lg: "text-control",
    };
    for (const d of ALL) {
      expect(buttonTextClassFor(d)).toBe(expected[d]);
    }
  });
});

describe("fieldSizeClassFor — a field's height is the button's size token", () => {
  it("maps each tier to its control height, the spacing-ramp padding and the field's text rung", () => {
    const expected: Record<ControlSize, string> = {
      xs: "control-xs px-xs gap-xs text-body",
      sm: "control-sm px-sm gap-xs text-caption",
      md: "control-md px-sm gap-xs text-body",
      lg: "control-lg px-sm gap-xs text-body",
    };
    for (const d of ALL) {
      expect(fieldSizeClassFor(d)).toBe(expected[d]);
    }
  });
});
