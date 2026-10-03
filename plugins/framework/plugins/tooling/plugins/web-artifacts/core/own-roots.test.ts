import { describe, expect, test } from "bun:test";
import {
  cobuildHostOf,
  cobuiltFoldersOf,
  firstSegmentOf,
  inlinedRootsFor,
  SHARED_ROOT,
} from "./own-roots";

describe("inlinedRootsFor (the one list address and content both read)", () => {
  test("a kind inlines its own folder", () => {
    expect(inlinedRootsFor("web")).toContain("web");
    expect(inlinedRootsFor("core")).toContain("core");
    expect(inlinedRootsFor("prewarm")).toContain("prewarm");
  });

  test("shared/ is inlined by EVERY kind (no barrel to route it to)", () => {
    for (const kind of ["web", "core", "prewarm"]) {
      expect(inlinedRootsFor(kind)).toContain(SHARED_ROOT);
    }
  });

  test("no kind inlines `plugins/` — sub-plugins are different plugins", () => {
    for (const kind of ["web", "core", "prewarm"]) {
      expect(inlinedRootsFor(kind)).not.toContain("plugins");
    }
  });

  test("one kind never inlines another's folder", () => {
    expect(inlinedRootsFor("prewarm")).not.toContain("web");
    expect(inlinedRootsFor("prewarm")).not.toContain("core");
    expect(inlinedRootsFor("web")).not.toContain("core");
  });
});

describe("co-built folders", () => {
  test("the web artifact inlines (and so hashes) its exhibits/ — one build, one address", () => {
    expect(inlinedRootsFor("web")).toEqual(["web", SHARED_ROOT, "exhibits"]);
  });

  test("exhibits is co-built into web, and nothing else is co-built", () => {
    expect(cobuildHostOf("exhibits")).toBe("web");
    expect(cobuildHostOf("core")).toBeNull();
    expect(cobuiltFoldersOf("web")).toEqual(["exhibits"]);
    expect(cobuiltFoldersOf("core")).toEqual([]);
  });

  test("no other kind inlines exhibits/", () => {
    for (const kind of ["core", "prewarm"]) {
      expect(inlinedRootsFor(kind)).not.toContain("exhibits");
    }
  });
});

describe("firstSegmentOf", () => {
  test("splits at the first slash, or returns the whole path", () => {
    expect(firstSegmentOf("web/theme/app.ts")).toBe("web");
    expect(firstSegmentOf("core")).toBe("core");
    expect(firstSegmentOf("plugins/tasks/web")).toBe("plugins");
  });
});
