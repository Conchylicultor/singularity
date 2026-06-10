import { it, expect } from "vitest";

import { cn } from "@/lib/utils";

it("a trailing size-* strips an earlier custom control-icon utility", () => {
  expect(cn("control-icon-md", "size-5")).toBe("size-5");
});

it("a trailing h-* strips an earlier custom control-height utility", () => {
  expect(cn("control-md", "h-8")).toBe("h-8");
});

it("a trailing p-* strips an earlier custom pad utility", () => {
  expect(cn("p-chip", "p-2")).toBe("p-2");
});

it("preserves a non-conflicting combo of a custom utility and an axis padding", () => {
  const result = cn("control-md", "px-2");
  expect(result).toContain("control-md");
  expect(result).toContain("px-2");
});
