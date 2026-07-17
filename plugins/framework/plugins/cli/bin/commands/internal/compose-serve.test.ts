import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeHash } from "@plugins/config_v2/core";
import type { JsonValue } from "@plugins/config_v2/core";
import {
  fileConfigProxy,
  readEffectiveConfigFromDisk,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { compositionsConfig } from "@plugins/plugin-meta/plugins/composition/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  activatedCompositionIds,
  namespaceCollision,
  sweepIds,
} from "./compose-serve";

const HIER = asPath(asPluginId("plugin-meta.composition"));

const tmp = mkdtempSync(join(tmpdir(), "compose-serve-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A minimal manifest item satisfying the compositions config schema.
function item(id: string, autoBuild: boolean) {
  return {
    id,
    rank: "a0",
    name: id,
    category: "app" as const,
    entryPoints: [] as string[],
    selectedContributors: [] as string[],
    extends: [] as string[],
    excludes: [] as string[],
    autoBuild,
  };
}

// One fixture tree = one fake repo root + one fake ~/.singularity dir.
function fixture(name: string) {
  const root = join(tmp, name, "repo");
  const singularityDir = join(tmp, name, "singularity");
  const worktreeName = "singularity";
  const gitDir = join(root, "config", HIER);
  const userDir = join(singularityDir, "config", worktreeName, HIER);
  const read = () =>
    readEffectiveConfigFromDisk(compositionsConfig, {
      root,
      worktreeName,
      singularityDir,
      hierarchyPath: HIER,
    });
  return { root, singularityDir, gitDir, userDir, read };
}

function writeLayer(dir: string, file: string, content: JsonValue, hash: string | null) {
  fileConfigProxy(join(dir, file)).write(content, hash);
}

describe("readEffectiveConfigFromDisk (layering against fixture jsonc)", () => {
  test("no files on disk → code defaults (seeds, nothing activated)", () => {
    const f = fixture("defaults");
    const values = f.read();
    expect(values.manifests.length).toBeGreaterThan(0);
    expect(activatedCompositionIds(values.manifests)).toEqual([]);
  });

  test("git origin only (no user layer) → git-layer value wins over code defaults", () => {
    const f = fixture("git-only");
    const gitContent = { manifests: [item("sonata", true)] } as unknown as JsonValue;
    writeLayer(f.gitDir, "compositions.origin.jsonc", gitContent, computeHash(gitContent));
    expect(activatedCompositionIds(f.read().manifests)).toEqual(["sonata"]);
  });

  test("non-stale user override wins over the propagated origin", () => {
    const f = fixture("user-override");
    const origin = { manifests: [item("sonata", false)] } as unknown as JsonValue;
    const originHash = computeHash(origin);
    writeLayer(f.gitDir, "compositions.origin.jsonc", origin, originHash);
    writeLayer(f.userDir, "compositions.origin.jsonc", origin, originHash);
    const override = { manifests: [item("sonata", true)] } as unknown as JsonValue;
    writeLayer(f.userDir, "compositions.jsonc", override, originHash);
    expect(activatedCompositionIds(f.read().manifests)).toEqual(["sonata"]);
  });

  test("STALE user override (hash mismatch) falls back to the user origin", () => {
    const f = fixture("stale-override");
    const origin = { manifests: [item("sonata", false)] } as unknown as JsonValue;
    writeLayer(f.gitDir, "compositions.origin.jsonc", origin, computeHash(origin));
    writeLayer(f.userDir, "compositions.origin.jsonc", origin, computeHash(origin));
    const override = { manifests: [item("sonata", true)] } as unknown as JsonValue;
    writeLayer(f.userDir, "compositions.jsonc", override, "deadbeef");
    expect(activatedCompositionIds(f.read().manifests)).toEqual([]);
  });

  test("user override with no user origin still applies (override stands alone)", () => {
    const f = fixture("override-only");
    const override = { manifests: [item("pages", true), item("sonata", false)] } as unknown as JsonValue;
    writeLayer(f.userDir, "compositions.jsonc", override, null);
    expect(activatedCompositionIds(f.read().manifests)).toEqual(["pages"]);
  });
});

describe("activated set / deactivation sweep arithmetic", () => {
  test("activatedCompositionIds keeps only autoBuild manifests, in config order", () => {
    const items = [item("a", false), item("b", true), item("c", true)];
    expect(activatedCompositionIds(items)).toEqual(["b", "c"]);
  });

  test("sweepIds = present namespaces minus the activated set, deduped and sorted", () => {
    expect(sweepIds(["sonata", "pages", "sonata", "website"], new Set(["pages"]))).toEqual([
      "sonata",
      "website",
    ]);
    expect(sweepIds([], new Set(["pages"]))).toEqual([]);
    expect(sweepIds(["pages"], new Set())).toEqual(["pages"]);
  });
});

describe("namespaceCollision", () => {
  const clean = {
    specDirExists: false,
    hasCompositionMarker: false,
    gitWorktreeDirExists: false,
    branchExists: false,
  };

  test("fresh namespace → no collision", () => {
    expect(namespaceCollision("sonata", clean)).toBeNull();
  });

  test("re-serving our own marker-carrying namespace → no collision", () => {
    expect(
      namespaceCollision("sonata", { ...clean, specDirExists: true, hasCompositionMarker: true }),
    ).toBeNull();
  });

  test("spec dir without our marker → collision (never overwrite a foreign namespace)", () => {
    expect(
      namespaceCollision("sonata", { ...clean, specDirExists: true }),
    ).toContain("WITHOUT");
  });

  test("same-named git worktree checkout or branch → collision", () => {
    expect(
      namespaceCollision("sonata", { ...clean, gitWorktreeDirExists: true }),
    ).toContain("worktree");
    expect(namespaceCollision("sonata", { ...clean, branchExists: true })).toContain("branch");
  });
});
