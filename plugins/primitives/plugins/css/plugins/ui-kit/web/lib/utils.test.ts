import { it, expect } from "bun:test";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";

it("a trailing size-* strips an earlier custom control-icon utility", () => {
  expect(cn("control-icon-md", "size-5")).toBe("size-5");
});

it("a trailing h-* strips an earlier custom control-height utility", () => {
  expect(cn("control-md", "h-8")).toBe("h-8");
});

it("a trailing p-* strips an earlier custom pad utility", () => {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- test fixture: asserts cn()/tailwind-merge treats a raw p-* as conflicting with the custom p-chip utility; the raw class is the subject under test
  expect(cn("p-chip", "p-2")).toBe("p-2");
});

it("preserves a non-conflicting combo of a custom utility and an axis padding", () => {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- test fixture: asserts a raw px-* does NOT conflict with the custom control-md utility; the raw class is the subject under test
  const result = cn("control-md", "px-2");
  expect(result).toContain("control-md");
  expect(result).toContain("px-2");
});

// — Generated-registry regression cases (derived from app.css twmerge markers) —

it("sg-pad conflicts with the built-in p group so a trailing p-2 wins", () => {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- test fixture: asserts the custom p-card (synthetic group sg-pad, conflicts: p) loses to a raw p-* listed last
  expect(cn("p-card", "p-2")).toBe("p-2");
});

it("a text role utility is NOT silently stripped — a trailing text-sm wins via font-size", () => {
  // text-caption extends font-size (not text-color), so the later text-sm (also
  // font-size) deduplicates it instead of both surviving / the role being dropped.
  // eslint-disable-next-line text/no-adhoc-typography -- test fixture: asserts cn()/tailwind-merge treats a raw text-* (font-size) as conflicting with the custom text-caption role utility; the raw class is the subject under test
  expect(cn("text-caption", "text-sm")).toBe("text-sm");
});

it("a standalone utility coexists with unrelated classes", () => {
  // focus-ring is standalone (invisible to twMerge); shadow-md is unrelated.
  expect(cn("focus-ring", "shadow-md")).toBe("focus-ring shadow-md");
});
