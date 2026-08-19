import { describe, expect, test } from "bun:test";
import { computeGraphHash } from "./compose";

const graph = {
  htmlSrc: "<!doctype html><head><script>var a = 1;</script></head>",
  importMap: {
    imports: {
      "@plugins/a/web": "/artifacts/a.web.1111111111111111/index.js",
      "@plugins/b/web": "/artifacts/b.web.2222222222222222/index.js",
    },
  },
  preloads: ["/artifacts/entry.3333333333333333/index.js"],
  entryUrl: "/artifacts/entry.3333333333333333/index.js",
  cssHref: "/global.4444444444444444.css",
};

describe("computeGraphHash", () => {
  test("is stable across two composes of the same graph", () => {
    expect(computeGraphHash(graph)).toBe(
      computeGraphHash(structuredClone(graph)),
    );
  });

  test("does not depend on import-map key order", () => {
    const reordered = {
      ...graph,
      importMap: {
        imports: {
          "@plugins/b/web": graph.importMap.imports["@plugins/b/web"]!,
          "@plugins/a/web": graph.importMap.imports["@plugins/a/web"]!,
        },
      },
    };
    expect(computeGraphHash(reordered)).toBe(computeGraphHash(graph));
  });

  // Each input decides which bytes the browser runs, so each must move the hash
  // — otherwise a tab could hold a genuinely different bundle and read as fresh.
  test("changes when any part of the graph changes", () => {
    const base = computeGraphHash(graph);
    // The shell's inline scripts belong to no URL: nothing else in the digest
    // moves when one of them is edited, so this line is the only thing standing
    // between a changed theme-replay script and a tab that reads as fresh.
    expect(
      computeGraphHash({
        ...graph,
        htmlSrc: "<!doctype html><head><script>var a = 2;</script></head>",
      }),
    ).not.toBe(base);
    expect(
      computeGraphHash({
        ...graph,
        importMap: {
          imports: {
            ...graph.importMap.imports,
            "@plugins/a/web": "/artifacts/a.web.9999999999999999/index.js",
          },
        },
      }),
    ).not.toBe(base);
    expect(
      computeGraphHash({
        ...graph,
        preloads: [...graph.preloads, "/artifacts/c/index.js"],
      }),
    ).not.toBe(base);
    expect(
      computeGraphHash({ ...graph, entryUrl: "/artifacts/other/index.js" }),
    ).not.toBe(base);
    expect(
      computeGraphHash({ ...graph, cssHref: "/global.5555555555555555.css" }),
    ).not.toBe(base);
  });

  test("is a 16-char hex digest", () => {
    expect(computeGraphHash(graph)).toMatch(/^[0-9a-f]{16}$/);
  });
});
