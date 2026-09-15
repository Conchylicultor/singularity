import { describe, it, expect } from "bun:test";

import {
  textStepFor,
  buttonTextClassFor,
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
