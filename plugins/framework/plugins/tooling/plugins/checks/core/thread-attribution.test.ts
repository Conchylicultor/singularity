import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StackFrame } from "@plugins/infra/plugins/stack-sampler/core";
import {
  createOwnerTally,
  ownerLabel,
  ownerOf,
  repoRoots,
} from "./thread-attribution";

// Pure: synthetic frames in the three shapes the Bun 1.3.13 probes produced,
// against a fake checkout at `/repo` whose realpath is `/private/repo`.
const ROOTS = ["/repo", "/private/repo"];

function js(name: string, sourceURL: string, line = 1): StackFrame {
  return { name, sourceURL, line, column: 1, category: "JIT" };
}

function native(name: string, category = "native"): StackFrame {
  return { name, sourceURL: null, line: null, column: null, category };
}

const CHECK = "/repo/plugins/database/plugins/migrations/check/index.ts";
const RUNNER =
  "/repo/plugins/framework/plugins/tooling/plugins/checks/core/runner.ts";
const TREE =
  "/repo/plugins/plugin-meta/plugins/plugin-tree/core/internal/plugin-tree.ts";

describe("ownerOf", () => {
  test("sync code a check runs itself is the check's (`spin ← checkRun`)", () => {
    expect(
      ownerOf([js("spin", CHECK, 9), js("checkRun", CHECK, 4)], ROOTS),
    ).toEqual({
      kind: "check",
      module: "database/migrations",
    });
  });

  test("a check frame beneath a shared helper and a runner frame still wins", () => {
    const boundaries =
      "/repo/plugins/framework/plugins/tooling/plugins/checks/plugins/plugin-boundaries/check/index.ts";
    expect(
      ownerOf(
        [js("scanFile", TREE), js("run", boundaries), js("runOne", RUNNER)],
        ROOTS,
      ),
    ).toEqual({
      kind: "check",
      module: "framework/tooling/checks/plugin-boundaries",
    });
  });

  test("an async helper resumed after an await has lost its caller → shared, named by the helper", () => {
    expect(
      ownerOf([js("spin", TREE, 40), js("buildPluginTree", TREE, 12)], ROOTS),
    ).toEqual({
      kind: "shared",
      site: "buildPluginTree @ plugins/plugin-meta/plugins/plugin-tree/core/internal/plugin-tree.ts",
    });
  });

  test("module evaluation → import, keeping the evaluated module's plugin as detail", () => {
    const frames = [
      js("(module)", "/repo/plugins/apps/plugins/mail/core/index.ts"),
      native("evaluate", "Unknown Executable"),
      native("moduleEvaluation"),
      native("requestImportModule"),
    ];
    expect(ownerOf(frames, ROOTS)).toEqual({
      kind: "import",
      plugin: "apps/mail",
    });
  });

  test("a frame under the realpath root, not the plain one, is still attributed", () => {
    expect(
      ownerOf([js("run", "/private/repo/plugins/x/check/index.ts")], ROOTS),
    ).toEqual({ kind: "check", module: "x" });
  });

  test("a frame under neither root is outside the repo, never a check", () => {
    expect(
      ownerOf([js("run", "/elsewhere/plugins/x/check/index.ts")], ROOTS),
    ).toEqual({
      kind: "shared",
      site: "run @ /elsewhere/plugins/x/check/index.ts",
    });
  });

  test("node_modules collapses to the package name, scoped and bun-store nested alike", () => {
    expect(
      ownerOf(
        [
          js("parse", "/repo/node_modules/pg-protocol/dist/parser.js"),
          js("handle", "/repo/node_modules/pg/lib/client.js"),
        ],
        ROOTS,
      ),
    ).toEqual({ kind: "shared", site: "pg" });
    expect(
      ownerOf([js("x", "/repo/node_modules/@scope/lib/index.js")], ROOTS),
    ).toEqual({ kind: "shared", site: "@scope/lib" });
    expect(
      ownerOf(
        [
          js(
            "x",
            "/repo/node_modules/.bun/pg@8.1.0/node_modules/pg/lib/client.js",
          ),
        ],
        ROOTS,
      ),
    ).toEqual({ kind: "shared", site: "pg" });
  });

  test("a repo callback a library dispatches is the work, not the library", () => {
    expect(
      ownerOf(
        [
          js("action", "/repo/plugins/a/core/x.ts"),
          js("_dispatch", "/repo/node_modules/commander/lib/command.js"),
        ],
        ROOTS,
      ),
    ).toEqual({ kind: "shared", site: "action @ plugins/a/core/x.ts" });
  });

  test("a plugin NAMED check is not a check module", () => {
    const run = "/repo/plugins/framework/plugins/cli/plugins/check/cli/run.ts";
    expect(ownerOf([js("action", run)], ROOTS)).toEqual({
      kind: "shared",
      site: "action @ plugins/framework/plugins/cli/plugins/check/cli/run.ts",
    });
  });

  test("native frames only → native, named by the leaf", () => {
    expect(
      ownerOf([native("readFileSync"), native("(anonymous)")], ROOTS),
    ).toEqual({
      kind: "native",
      leaf: "readFileSync [native]",
    });
  });
});

describe("repoRoots", () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "thread-roots-")));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test("a checkout reached through a symlink yields both spellings", () => {
    const real = join(scratch, "real");
    const link = join(scratch, "link");
    mkdirSync(real);
    symlinkSync(real, link);
    expect(repoRoots(link)).toEqual([link, real]);
    expect(repoRoots(real)).toEqual([real]);
  });
});

describe("ownerLabel", () => {
  test("an import's plugin is detail, not identity", () => {
    expect(ownerLabel({ kind: "import", plugin: "a" })).toBe("import");
    expect(ownerLabel({ kind: "import", plugin: "b" })).toBe("import");
    expect(ownerLabel({ kind: "check", module: "x" })).toBe("check x");
  });
});

describe("createOwnerTally", () => {
  test("counts per owner, keeps the first sample's stack shortened, and pools import detail", () => {
    const tally = createOwnerTally(ROOTS);
    const checkStack = [js("spin", CHECK, 9), js("checkRun", CHECK, 4)];
    tally.add({ kind: "check", module: "database/migrations" }, checkStack);
    tally.add({ kind: "check", module: "database/migrations" }, [
      js("other", CHECK, 20),
    ]);
    tally.add({ kind: "import", plugin: "apps/mail" }, [
      native("moduleEvaluation"),
    ]);
    tally.add({ kind: "import", plugin: "apps/mail" }, [
      native("moduleEvaluation"),
    ]);
    tally.add({ kind: "import", plugin: "pages" }, [
      native("moduleEvaluation"),
    ]);

    expect(tally.samples).toBe(5);
    // Busiest first: the three import samples outrank the two check samples.
    const [imports, check] = tally.top(10);
    expect(check).toEqual({
      owner: "check database/migrations",
      samples: 2,
      example: [
        "spin @ plugins/database/plugins/migrations/check/index.ts:9",
        "checkRun @ plugins/database/plugins/migrations/check/index.ts:4",
      ],
      detail: [],
    });
    expect(imports?.owner).toBe("import");
    expect(imports?.detail).toEqual([
      { name: "apps/mail", samples: 2 },
      { name: "pages", samples: 1 },
    ]);
    expect(tally.top(1)).toHaveLength(1);
  });
});
