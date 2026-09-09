/**
 * The per-target program key is what lets a tsc worker be SKIPPED, so the whole
 * value of these tests is the direction of the failures: a key that changes
 * when it should not costs a needless run, but a key that stays the same when
 * the program's meaning changed skips a check that would have failed.
 *
 * Each case below is one way the program could differ:
 *   1. nothing changed → the same key (otherwise nothing is ever skipped);
 *   2. a listed file's CONTENT changed — repo file or `node_modules` file alike;
 *   3. the ROOT set changed (the tsconfig now includes something else);
 *   4. a tsconfig's own contents changed (different compiler options);
 *   5. a NEW `.ts` appeared that no listed file mentions — the resolution
 *      shadowing hazard, which no content hash of an existing file can see;
 *   6. no buildinfo, or one whose shape we do not recognise → NO key at all,
 *      never a key over an empty program.
 */

import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { readTreeListing } from "./fingerprint";
import {
  openProgramKeyContext,
  programKey,
  readProgramFileList,
} from "./program-key";

let root = "";

function write(rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A buildinfo listing `fileNames`, written where the check keeps them. */
function writeBuildInfo(rels: string[]): string {
  const rel = ".cache/tsbuildinfo/web.tsbuildinfo";
  // Paths in a buildinfo are relative to the buildinfo's OWN directory, which
  // here is two levels below the root.
  write(rel, JSON.stringify({ fileNames: rels.map((r) => `../../${r}`) }));
  return join(root, rel);
}

const TARGET = {
  name: "web",
  get tsconfigPath() {
    return join(root, "tsconfig.json");
  },
  get buildInfoPath() {
    return join(root, ".cache/tsbuildinfo/web.tsbuildinfo");
  },
};

/**
 * A key computed the way a fresh run computes one: a brand-new context.
 * `null` stands for "no key" so the assertions below read as comparisons.
 */
function keyNow(roots: string[] = [join(root, "a.ts")]): string | null {
  const result = programKey(
    openProgramKeyContext(readTreeListing(root)),
    TARGET,
    roots,
  );
  return result.kind === "key" ? result.key : null;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "type-check-program-key-"));
  write("a.ts", "export const a = 1;\n");
  write("b.ts", "export const b = 2;\n");
  write("node_modules/dep/index.d.ts", "export declare const d: number;\n");
  write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }));
  write("package.json", JSON.stringify({ name: "fixture" }));
  writeBuildInfo(["a.ts", "b.ts", "node_modules/dep/index.d.ts"]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("an unchanged tree yields the same key", () => {
  expect(keyNow()).toBe(keyNow());
});

test("a listed repo file's content changes the key", () => {
  const before = keyNow();
  write("b.ts", "export const b = 3;\n");
  expect(keyNow()).not.toBe(before);
});

test("a listed node_modules file's content changes the key", () => {
  // Hashed DIRECTLY rather than trusted through the lockfile, so a
  // hand-patched dependency cannot pass as unchanged.
  const before = keyNow();
  write("node_modules/dep/index.d.ts", "export declare const d: string;\n");
  expect(keyNow()).not.toBe(before);
});

test("a different root set changes the key", () => {
  const before = keyNow();
  expect(keyNow([join(root, "a.ts"), join(root, "b.ts")])).not.toBe(before);
});

test("root order does not change the key", () => {
  const forward = keyNow([join(root, "a.ts"), join(root, "b.ts")]);
  expect(keyNow([join(root, "b.ts"), join(root, "a.ts")])).toBe(forward);
});

test("a tsconfig edit changes the key", () => {
  const before = keyNow();
  write(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { strict: false } }),
  );
  expect(keyNow()).not.toBe(before);
});

test("a package.json edit changes the key", () => {
  const before = keyNow();
  write("package.json", JSON.stringify({ name: "fixture", type: "module" }));
  expect(keyNow()).not.toBe(before);
});

test("a NEW .ts file that nothing lists changes the key", () => {
  // The shadowing hazard: `c.ts` appearing beside a `c/index.ts` re-resolves an
  // import whose own bytes never moved. Nothing in the file list can show that,
  // so the key over-invalidates on any add or remove instead.
  const before = keyNow();
  write("c.ts", "export const c = 3;\n");
  expect(keyNow()).not.toBe(before);
});

test("an unrelated non-TypeScript file does NOT change the key", () => {
  const before = keyNow();
  write("README.md", "# docs\n");
  expect(keyNow()).toBe(before);
});

test("no buildinfo means no key — a cold run, never a skip", () => {
  rmSync(join(root, ".cache"), { recursive: true, force: true });
  expect(keyNow()).toBeNull();
});

test("a buildinfo with no fileNames array means no key", () => {
  write(".cache/tsbuildinfo/web.tsbuildinfo", JSON.stringify({ version: "5" }));
  expect(keyNow()).toBeNull();
});

test("a torn buildinfo means no key", () => {
  write(".cache/tsbuildinfo/web.tsbuildinfo", '{"fileNames": ["../../a.ts"');
  expect(keyNow()).toBeNull();
});

test("readProgramFileList resolves against the buildinfo's own directory", () => {
  const path = writeBuildInfo(["a.ts"]);
  expect(readProgramFileList(path)).toEqual({
    kind: "files",
    files: [join(root, "a.ts")],
  });
});

test("readProgramFileList tells an ABSENT buildinfo from an unreadable one", () => {
  // The two are different facts: absent is the ordinary cold case, unreadable
  // is worth naming in the log. Collapsing them to one nullish value is exactly
  // what the discriminated result exists to prevent.
  rmSync(join(root, ".cache"), { recursive: true, force: true });
  expect(readProgramFileList(TARGET.buildInfoPath).kind).toBe("absent");
  write(".cache/tsbuildinfo/web.tsbuildinfo", "{not json");
  expect(readProgramFileList(TARGET.buildInfoPath).kind).toBe("unreadable");
});

test("readProgramFileList reads the nested `program.fileNames` shape too", () => {
  write(
    ".cache/tsbuildinfo/web.tsbuildinfo",
    JSON.stringify({ program: { fileNames: ["../../a.ts"] } }),
  );
  expect(readProgramFileList(TARGET.buildInfoPath)).toEqual({
    kind: "files",
    files: [join(root, "a.ts")],
  });
});
