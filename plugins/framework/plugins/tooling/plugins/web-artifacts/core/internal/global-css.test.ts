import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCssInputs } from "./global-css";
import { cachedAggregateHash } from "./own-files";
import type { FingerprintCache } from "./store";

describe("parseCssInputs", () => {
  test("extracts @source dirs and @import specifiers", () => {
    const css = [
      `@import "tailwindcss";`,
      `@import "shadcn/tailwind.css";`,
      `@import "@fontsource-variable/inter";`,
      `@source "../../../../plugins/";`,
      `@source "../../../../prototypes/";`,
      `@custom-variant dark (&:is(.dark *));`,
    ].join("\n");
    expect(parseCssInputs(css)).toEqual({
      sourceDirs: ["../../../../plugins/", "../../../../prototypes/"],
      importSpecs: ["tailwindcss", "shadcn/tailwind.css", "@fontsource-variable/inter"],
    });
  });

  test("handles single quotes and @source not", () => {
    const css = `@import 'pkg/base.css';\n@source not '../ignored/';`;
    expect(parseCssInputs(css)).toEqual({
      sourceDirs: ["../ignored/"],
      importSpecs: ["pkg/base.css"],
    });
  });
});

describe("cachedAggregateHash (the css-key content fingerprint)", () => {
  const freshCache = (): FingerprintCache => ({ version: 1, records: {} });

  function fixture(): { dir: string; files: string[] } {
    const dir = mkdtempSync(join(tmpdir(), "css-key-test-"));
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "one.tsx"), `<div className="p-md" />`);
    writeFileSync(join(dir, "b.md"), "docs");
    return { dir, files: [join(dir, "a", "one.tsx"), join(dir, "b.md")].sort() };
  }

  test("content change flips the hash; untouched sibling set keeps it", () => {
    const { dir, files } = fixture();
    const h1 = cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache: freshCache() });
    const h1again = cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache: freshCache() });
    expect(h1again).toBe(h1);

    writeFileSync(join(dir, "a", "one.tsx"), `<div className="p-lg" />`);
    const h2 = cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache: freshCache() });
    expect(h2).not.toBe(h1);
  });

  test("stat fast path reuses the recorded hash without re-reading", () => {
    const { dir, files } = fixture();
    const cache = freshCache();
    const h1 = cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache });
    // Poison the recorded hash: an (incorrect) sentinel proves the fast path
    // returns the RECORD, i.e. no content was re-read when stats match.
    cache.records["k"]!.ownHash = "sentinel";
    expect(cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache })).toBe("sentinel");

    // An mtime bump invalidates the record and recomputes the true hash.
    const later = new Date(Date.now() + 5000);
    utimesSync(files[0]!, later, later);
    expect(cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache })).toBe(h1);
  });

  test("a vanished file changes the set (and never throws)", () => {
    const { dir, files } = fixture();
    const h1 = cachedAggregateHash({ cacheKey: "k", baseDir: dir, files, cache: freshCache() });
    const withGhost = [...files, join(dir, "gone.ts")];
    const h2 = cachedAggregateHash({
      cacheKey: "k",
      baseDir: dir,
      files: withGhost,
      cache: freshCache(),
    });
    expect(h2).toBe(h1); // ENOENT contributes nothing — same effective set
  });
});
