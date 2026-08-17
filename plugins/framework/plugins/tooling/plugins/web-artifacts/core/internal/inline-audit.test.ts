import { describe, expect, test } from "bun:test";
import { createInlineAudit } from "./inline-audit";

const ROOTS = ["/repo/plugins/x/fixtures", "/repo/plugins/x/shared"];

/**
 * Drive the REAL `generateBundle` hook with a synthetic bundle, so the test
 * exercises the shape rollup actually hands the plugin rather than a private
 * setter. The double cast is the narrowest way to call the hook off the vite
 * `Plugin` type (whose hooks are `ObjectHook` unions) with a bundle stub that
 * carries only the fields the hook reads.
 */
function auditOf(moduleIds: string[]) {
  const audit = createInlineAudit({
    dirName: "x.fixtures.abc123",
    hashedRoots: ROOTS,
    kind: "fixtures",
  });
  const bundle = {
    "index.js": {
      type: "chunk",
      modules: Object.fromEntries(moduleIds.map((id) => [id, {}])),
    },
    "index.js.map": { type: "asset" }, // assets carry no modules — must be skipped
  };
  const hook = audit.plugin.generateBundle as unknown as (
    options: unknown,
    bundle: unknown,
  ) => void;
  hook(null, bundle);
  return audit;
}

describe("createInlineAudit", () => {
  test("passes when every first-party module is inside the hashed roots", () => {
    expect(() =>
      auditOf([
        "/repo/plugins/x/fixtures/index.ts",
        "/repo/plugins/x/fixtures/internal/cases.tsx",
        "/repo/plugins/x/shared/util.ts",
      ]).verify(),
    ).not.toThrow();
  });

  test("skips virtual ids, node_modules, and non-path ids", () => {
    expect(() =>
      auditOf([
        "\0commonjsHelpers.js",
        "\0vite/preload-helper",
        "/repo/node_modules/react-icons/md/index.mjs",
        "/repo/plugins/x/node_modules/some-dep/index.js",
        "virtual:some-plugin",
        "/repo/plugins/x/fixtures/index.ts",
      ]).verify(),
    ).not.toThrow();
  });

  test("query suffixes are stripped before the containment check", () => {
    expect(() =>
      auditOf(["/repo/plugins/x/fixtures/a.css?used"]).verify(),
    ).not.toThrow();
    expect(() => auditOf(["/repo/plugins/x/web/a.css?used"]).verify()).toThrow(
      "/repo/plugins/x/web/a.css",
    );
  });

  test("throws naming the artifact and the offending file", () => {
    let message = "";
    try {
      auditOf([
        "/repo/plugins/x/fixtures/index.ts",
        "/repo/plugins/x/web/internal/bar.tsx",
      ]).verify();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("x.fixtures.abc123");
    expect(message).toContain("/repo/plugins/x/web/internal/bar.tsx");
    expect(message).not.toContain("/repo/plugins/x/fixtures/index.ts");
    expect(message).toContain("inlinedRootsFor()");
  });

  test("a sibling dir sharing a root's prefix is NOT inside it", () => {
    expect(() =>
      auditOf(["/repo/plugins/x/fixtures-extra/a.ts"]).verify(),
    ).toThrow("/repo/plugins/x/fixtures-extra/a.ts");
  });

  test("caps the listed paths and summarizes the rest", () => {
    const many = Array.from(
      { length: 25 },
      (_, i) => `/repo/plugins/x/web/f${i}.ts`,
    );
    expect(() => auditOf(many).verify()).toThrow("…and 5 more");
  });
});
