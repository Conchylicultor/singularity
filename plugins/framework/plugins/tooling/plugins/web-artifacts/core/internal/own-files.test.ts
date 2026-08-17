import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashedRootsFor, listOwnFiles } from "./own-files";

// A plugin tree with one file per folder, so which folders an artifact HASHES
// is readable straight off the returned list.
const dir = mkdtempSync(join(tmpdir(), "own-files-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

for (const folder of ["web", "shared", "core", "fixtures"]) {
  mkdirSync(join(dir, folder), { recursive: true });
  writeFileSync(join(dir, folder, "index.ts"), `export const ${folder} = 1;\n`);
}
writeFileSync(join(dir, "package.json"), "{}\n");

const rel = (kind: string): string[] =>
  listOwnFiles(dir, kind)
    .map((abs) => abs.slice(dir.length + 1))
    .sort();

describe("listOwnFiles walks exactly inlinedRootsFor(kind)", () => {
  test("fixtures: its own folder + shared + package.json — never web or core", () => {
    expect(rel("fixtures")).toEqual([
      "fixtures/index.ts",
      "package.json",
      "shared/index.ts",
    ]);
  });

  // The `web` hash NARROWS here: own-core is rewritten to the external barrel,
  // so it never enters the bytes and hashing it only forced spurious rebuilds.
  test("web: web + shared + package.json — NOT core", () => {
    expect(rel("web")).toEqual([
      "package.json",
      "shared/index.ts",
      "web/index.ts",
    ]);
  });

  test("core: core + shared + package.json", () => {
    expect(rel("core")).toEqual([
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
