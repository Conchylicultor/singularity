import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashedRootsFor, isHashedFile, listOwnFiles } from "./own-files";

// A plugin tree with one file per folder, so which folders an artifact HASHES
// is readable straight off the returned list.
const dir = mkdtempSync(join(tmpdir(), "own-files-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

for (const folder of ["web", "shared", "core", "fixtures"]) {
  mkdirSync(join(dir, folder), { recursive: true });
  writeFileSync(join(dir, folder, "index.ts"), `export const ${folder} = 1;\n`);
}
writeFileSync(join(dir, "package.json"), "{}\n");

const rel = async (kind: string): Promise<string[]> =>
  (await listOwnFiles(dir, kind))
    .map((abs) => abs.slice(dir.length + 1))
    .sort();

describe("listOwnFiles walks exactly inlinedRootsFor(kind)", () => {
  test("fixtures: its own folder + shared + package.json — never web or core", async () => {
    expect(await rel("fixtures")).toEqual([
      "fixtures/index.ts",
      "package.json",
      "shared/index.ts",
    ]);
  });

  // The `web` hash NARROWS here: own-core is rewritten to the external barrel,
  // so it never enters the bytes and hashing it only forced spurious rebuilds.
  test("web: web + shared + package.json — NOT core", async () => {
    expect(await rel("web")).toEqual([
      "package.json",
      "shared/index.ts",
      "web/index.ts",
    ]);
  });

  test("core: core + shared + package.json", async () => {
    expect(await rel("core")).toEqual([
      "core/index.ts",
      "package.json",
      "shared/index.ts",
    ]);
  });
});

describe("hashedRootsFor", () => {
  test("entry hashes the passed dir itself (web-core/web, no plugin around it)", () => {
    expect(hashedRootsFor(dir, "entry")).toEqual([dir]);
  });

  test("a plugin kind hashes its own folder plus shared", () => {
    expect(hashedRootsFor(dir, "fixtures")).toEqual([
      join(dir, "fixtures"),
      join(dir, "shared"),
    ]);
  });
});

describe("isHashedFile", () => {
  const roots = ["/p/web", "/p/shared"];

  test("a source file inside a root is hashed", () => {
    expect(isHashedFile(roots, "/p/web/index.ts")).toBe(true);
    expect(isHashedFile(roots, "/p/shared/deep/util.tsx")).toBe(true);
  });

  test("outside every root is not hashed", () => {
    expect(isHashedFile(roots, "/p/core/index.ts")).toBe(false);
    expect(isHashedFile(roots, "/p/webx/index.ts")).toBe(false);
  });

  test("what the walk skips is not hashed, though inside a root", () => {
    for (const abs of [
      "/p/web/testing/index.ts",
      "/p/web/a/__tests__/x.tsx",
      "/p/web/a.test.ts",
      "/p/web/node_modules/dep/index.js",
      "/p/web/public/logo.svg",
      "/p/web/dist.live.1/x.js",
    ]) {
      expect(isHashedFile(roots, abs)).toBe(false);
    }
  });

  test("agrees with listOwnFiles on a real tree", async () => {
    const files = await listOwnFiles(dir, "web");
    for (const f of files.filter((f) => !f.endsWith("package.json"))) {
      expect(isHashedFile(hashedRootsFor(dir, "web"), f)).toBe(true);
    }
  });
});
