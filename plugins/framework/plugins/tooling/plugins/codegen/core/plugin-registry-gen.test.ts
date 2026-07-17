/**
 * Regression test for the comment/string robustness of `discoverCollectedDirs`.
 *
 * The trigger bug: a `defineCollectedDir("…")` written inside a code comment (or
 * embedded in a string literal) was matched by a raw-text regex and silently
 * produced a phantom collected-dir registry. Routing the scan through
 * `findMarkerCalls` (which masks comments/strings/regex) must ignore those while
 * still discovering genuine calls. Run with `bun test` from the repo root.
 */

import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  assertCompositionName,
  assertServableCompositionNamespace,
  collectedDirCompositionRegistryPath,
  collectedDirNamedCompositionRegistryPath,
  discoverCollectedDirs,
  listNamedCompositionRegistries,
  parseNamedCompositionRegistryFileName,
  type DiscoveredCollectedDir,
} from "./plugin-registry-gen";

const root = mkdtempSync(join(tmpdir(), "collected-dir-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Write a core/index.ts barrel for a plugin under <root>/plugins/<name>/core. */
function writeCoreBarrel(pluginName: string, contents: string) {
  const coreDir = join(root, "plugins", pluginName, "core");
  mkdirSync(coreDir, { recursive: true });
  writeFileSync(join(coreDir, "index.ts"), contents);
}

test("discoverCollectedDirs ignores commented/stringified markers but finds real calls", () => {
  writeCoreBarrel(
    "real",
    [
      'export const realDir = defineCollectedDir("widget");',
    ].join("\n"),
  );
  writeCoreBarrel(
    "phantoms",
    [
      '// defineCollectedDir("phantom")',
      'const s = "defineCollectedDir(\'stringed\')";',
      "/* block defineCollectedDir(\"blocked\") */",
    ].join("\n"),
  );

  const dirs = discoverCollectedDirs(root).map((d) => d.dir).sort();

  // Only the genuine call is discovered; the comment- and string-embedded
  // markers must not produce phantom collected dirs.
  expect(dirs).toEqual(["widget"]);
});

// ── Per-name composition registries ────────────────────────────────

test("composition name validation rejects namespace-unsafe names", () => {
  expect(() => assertCompositionName("sonata")).not.toThrow();
  expect(() => assertCompositionName("a-1")).not.toThrow();
  for (const bad of ["", "Sonata", "so nata", "-sonata", "so/nata", "so.nata", "a".repeat(64)]) {
    expect(() => assertCompositionName(bad)).toThrow("Invalid composition name");
  }
});

test("servable namespace validation additionally rejects the reserved namespaces", () => {
  expect(() => assertServableCompositionNamespace("sonata")).not.toThrow();
  for (const reserved of ["central", "singularity", "main"]) {
    expect(() => assertServableCompositionNamespace(reserved)).toThrow("reserved namespace");
  }
  expect(() => assertServableCompositionNamespace("So nata")).toThrow("Invalid composition name");
});

test("per-name registry path renders beside the singleton and round-trips through parse", () => {
  const def: DiscoveredCollectedDir = {
    dir: "web",
    _brand: "CollectedDirDef",
    ownerDir: "/repo/plugins/framework/plugins/web-sdk",
  };
  expect(collectedDirCompositionRegistryPath(def)).toBe(
    "/repo/plugins/framework/plugins/web-sdk/core/web.composition.generated.ts",
  );
  const file = collectedDirNamedCompositionRegistryPath(def, "sonata");
  expect(file).toBe(
    "/repo/plugins/framework/plugins/web-sdk/core/web.composition.sonata.generated.ts",
  );
  expect(parseNamedCompositionRegistryFileName("web.composition.sonata.generated.ts")).toEqual({
    dir: "web",
    name: "sonata",
  });
  expect(() => collectedDirNamedCompositionRegistryPath(def, "../evil")).toThrow(
    "Invalid composition name",
  );
});

test("parse rejects the singleton, committed, and non-registry file names", () => {
  expect(parseNamedCompositionRegistryFileName("web.composition.generated.ts")).toBeNull();
  expect(parseNamedCompositionRegistryFileName("web.generated.ts")).toBeNull();
  expect(parseNamedCompositionRegistryFileName("web.composition.Sonata.generated.ts")).toBeNull();
  expect(parseNamedCompositionRegistryFileName("web.composition.sonata.generated.ts.bak")).toBeNull();
});

test("listNamedCompositionRegistries finds per-name files, skipping singletons", () => {
  // The fake root's `widget` collected dir is not a served runtime — build a
  // second fake root declaring `web` + `server` (+ `prewarm`, which must be
  // excluded from the per-name listing).
  const namedRoot = mkdtempSync(join(tmpdir(), "named-registry-test-"));
  try {
    const coreDir = join(namedRoot, "plugins", "sdk", "core");
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(
      join(coreDir, "index.ts"),
      [
        'export const webDir = defineCollectedDir("web");',
        'export const serverDir = defineCollectedDir("server");',
        'export const prewarmDir = defineCollectedDir("prewarm");',
      ].join("\n"),
    );
    for (const f of [
      "web.composition.sonata.generated.ts",
      "web.composition.generated.ts", // singleton — not per-name
      "server.composition.sonata.generated.ts",
      "server.composition.pages.generated.ts",
      "prewarm.composition.sonata.generated.ts", // prewarm — singleton-only runtime
      "web.generated.ts", // committed — never listed
    ]) {
      writeFileSync(join(coreDir, f), "export const x = [];\n");
    }

    const listed = listNamedCompositionRegistries(namedRoot)
      .map((e) => `${e.dir}:${e.name}`)
      .sort();
    expect(listed).toEqual(["server:pages", "server:sonata", "web:sonata"]);
  } finally {
    rmSync(namedRoot, { recursive: true, force: true });
  }
});
