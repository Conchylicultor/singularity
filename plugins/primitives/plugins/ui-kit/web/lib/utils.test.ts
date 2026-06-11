import { it, expect } from "bun:test";

import { cn } from "@plugins/primitives/plugins/ui-kit/web/lib/utils";

it("a trailing size-* strips an earlier custom control-icon utility", () => {
  expect(cn("control-icon-md", "size-5")).toBe("size-5");
});

it("a trailing h-* strips an earlier custom control-height utility", () => {
  expect(cn("control-md", "h-8")).toBe("h-8");
});

it("a trailing p-* strips an earlier custom pad utility", () => {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- raw p-2 is the test input exercising cn()'s merge of a custom pad vs a raw Tailwind padding
  expect(cn("p-chip", "p-2")).toBe("p-2");
});

it("preserves a non-conflicting combo of a custom utility and an axis padding", () => {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- raw px-2 is the test input verifying it survives alongside a custom control utility
  const result = cn("control-md", "px-2");
  expect(result).toContain("control-md");
  expect(result).toContain("px-2");
});
