import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { pruneOrphanedConfigFiles } from "./config-origin-gen";

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "config-prune-"));
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

function write(rel: string, content = "// @hash abc\n{}\n"): void {
  const full = join(configDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

test("keeps every file backed by a live descriptor", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc");
  write("apps/pages/shell/pages.sidebar.jsonc");
  write("apps/pages/shell/@app/agents/pages.sidebar.jsonc");

  const pruned = pruneOrphanedConfigFiles({
    configDir,
    liveOriginRelPaths: new Set(["apps/pages/shell/pages.sidebar.origin.jsonc"]),
  });

  expect(pruned).toEqual([]);
  expect(existsSync(join(configDir, "apps/pages/shell/pages.sidebar.origin.jsonc"))).toBe(true);
  expect(existsSync(join(configDir, "apps/pages/shell/pages.sidebar.jsonc"))).toBe(true);
  expect(existsSync(join(configDir, "apps/pages/shell/@app/agents/pages.sidebar.jsonc"))).toBe(true);
});

test("prunes a removed descriptor's origin, base override, and scoped deltas", () => {
  write("apps/pages/shell/pages.toolbar.origin.jsonc");
  write("apps/pages/shell/pages.toolbar.jsonc");
  write("apps/pages/shell/@app/agents/pages.toolbar.jsonc");

  const pruned = pruneOrphanedConfigFiles({
    configDir,
    liveOriginRelPaths: new Set(), // descriptor gone
  });

  expect(pruned.sort()).toEqual([
    "apps/pages/shell/@app/agents/pages.toolbar.jsonc",
    "apps/pages/shell/pages.toolbar.jsonc",
    "apps/pages/shell/pages.toolbar.origin.jsonc",
  ]);
  expect(existsSync(join(configDir, "apps/pages/shell"))).toBe(false);
});

test("prunes only the dead descriptor when a sibling stays live", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc");
  write("apps/pages/shell/pages.sidebar.jsonc");
  write("apps/pages/shell/pages.toolbar.origin.jsonc");
  write("apps/pages/shell/pages.toolbar.jsonc");

  const pruned = pruneOrphanedConfigFiles({
    configDir,
    liveOriginRelPaths: new Set(["apps/pages/shell/pages.sidebar.origin.jsonc"]),
  });

  expect(pruned.sort()).toEqual([
    "apps/pages/shell/pages.toolbar.jsonc",
    "apps/pages/shell/pages.toolbar.origin.jsonc",
  ]);
  // The live sibling and its directory survive.
  expect(existsSync(join(configDir, "apps/pages/shell/pages.sidebar.origin.jsonc"))).toBe(true);
  expect(existsSync(join(configDir, "apps/pages/shell/pages.sidebar.jsonc"))).toBe(true);
});

test("keeps a scoped delta whose base descriptor is still live", () => {
  write("apps/pages/shell/pages.sidebar.origin.jsonc");
  write("apps/pages/shell/@app/agents/pages.sidebar.jsonc");

  const pruned = pruneOrphanedConfigFiles({
    configDir,
    liveOriginRelPaths: new Set(["apps/pages/shell/pages.sidebar.origin.jsonc"]),
  });

  expect(pruned).toEqual([]);
  expect(existsSync(join(configDir, "apps/pages/shell/@app/agents/pages.sidebar.jsonc"))).toBe(true);
});

test("leaves non-config files (CLAUDE.md) untouched", () => {
  writeFileSync(join(configDir, "CLAUDE.md"), "# config layout\n");
  write("apps/pages/shell/pages.toolbar.origin.jsonc");

  pruneOrphanedConfigFiles({ configDir, liveOriginRelPaths: new Set() });

  expect(existsSync(join(configDir, "CLAUDE.md"))).toBe(true);
  expect(existsSync(join(configDir, "apps/pages/shell/pages.toolbar.origin.jsonc"))).toBe(false);
});

test("is a no-op on a clean tree where every file is live", () => {
  write("build/build.origin.jsonc");
  write("apps/pages/shell/pages.sidebar.origin.jsonc");

  const pruned = pruneOrphanedConfigFiles({
    configDir,
    liveOriginRelPaths: new Set([
      "build/build.origin.jsonc",
      "apps/pages/shell/pages.sidebar.origin.jsonc",
    ]),
  });

  expect(pruned).toEqual([]);
});
