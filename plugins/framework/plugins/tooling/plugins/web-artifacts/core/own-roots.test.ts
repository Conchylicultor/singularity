import { describe, expect, test } from "bun:test";
import { firstSegmentOf, inlinedRootsFor, SHARED_ROOT } from "./own-roots";

describe("inlinedRootsFor (the one list address and content both read)", () => {
  test("a kind inlines its own folder", () => {
    expect(inlinedRootsFor("web")).toContain("web");
    expect(inlinedRootsFor("core")).toContain("core");
    expect(inlinedRootsFor("fixtures")).toContain("fixtures");
    expect(inlinedRootsFor("prewarm")).toContain("prewarm");
  });

  test("shared/ is inlined by EVERY kind (no barrel to route it to)", () => {
    for (const kind of ["web", "core", "fixtures", "prewarm"]) {
      expect(inlinedRootsFor(kind)).toContain(SHARED_ROOT);
    }
  });

  test("no kind inlines `plugins/` — sub-plugins are different plugins", () => {
    for (const kind of ["web", "core", "fixtures", "prewarm"]) {
      expect(inlinedRootsFor(kind)).not.toContain("plugins");
    }
  });

  test("one kind never inlines another's folder", () => {
    expect(inlinedRootsFor("fixtures")).not.toContain("web");
    expect(inlinedRootsFor("fixtures")).not.toContain("core");
    expect(inlinedRootsFor("web")).not.toContain("core");
  });
});

describe("firstSegmentOf", () => {
  test("splits at the first slash, or returns the whole path", () => {
    expect(firstSegmentOf("web/theme/app.ts")).toBe("web");
    expect(firstSegmentOf("core")).toBe("core");
    expect(firstSegmentOf("plugins/tasks/web")).toBe("plugins");
  });
});
