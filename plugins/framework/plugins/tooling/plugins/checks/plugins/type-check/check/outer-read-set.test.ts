/**
 * Soundness round-trip for type-check's OUTER input-keyed read-set (Stage 2),
 * exercised the way the runner drives it: record the read-set by running
 * `recordOuterReadSet` under a recording `FileSystemView` over a real throwaway
 * git repo, then `validate` it against a FRESH snapshot of a mutated tree.
 *
 * The four cases that make the outer cache trustworthy:
 *   1. a non-`.ts` change (docs) is a HIT — the whole point (docs-only ⇒ zero workers);
 *   2. any `.ts` CONTENT change is a MISS (the type graph changed);
 *   3. a BRAND-NEW `.ts` file is a MISS via the MEMBERSHIP glob (hazard H3 — the
 *      coverage gate: a content-only read-set would stale-PASS this);
 *   4. a global-trigger change (tsconfig / package.json) is a MISS via its content
 *      fact — the compiler/config-version invalidation path.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { computeTreeHash } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { loadTreeSnapshot, validate, type ReadSet } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { buildImportGraphs } from "./import-graph";
import { recordOuterReadSet } from "./outer-read-set";

let root = "";

async function git(...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  await proc.exited;
}

function write(rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "type-check-outer-read-set-"));
  // a.ts / b.ts: lintable sources. README.md: an unrelated non-.ts file.
  // tsconfig.json + package.json: global-trigger files.
  write("a.ts", "export const a = 1;\n");
  write("b.ts", "export const b = 2;\n");
  write("README.md", "# hello\n");
  write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }) + "\n");
  write("package.json", JSON.stringify({ name: "fixture", dependencies: { typescript: "5.0.0" } }) + "\n");
  await git("init", "-q");
  await git("config", "user.email", "t@t.t");
  await git("config", "user.name", "t");
  await git("add", "-A");
  await git("commit", "-q", "-m", "fixture");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** Record type-check's outer read-set the same way run() does. */
async function record(): Promise<ReadSet> {
  const treeHash = await computeTreeHash(root);
  expect(treeHash).toBeTruthy();
  const snap = await loadTreeSnapshot(root, treeHash!);
  expect(snap).not.toBeNull();
  const view = snap!.createRecordingView();
  const graphs = buildImportGraphs(root);
  recordOuterReadSet(view, root, graphs);
  return view.readSet();
}

/** Validate a read-set against a FRESH snapshot of the current tree state. */
async function revalidate(readSet: ReadSet) {
  const treeHash = await computeTreeHash(root);
  expect(treeHash).toBeTruthy();
  const snap = await loadTreeSnapshot(root, treeHash!);
  expect(snap).not.toBeNull();
  return validate(readSet, snap!);
}

test("records membership globs + a content fact per lintable & global-trigger file", async () => {
  const rs = await record();
  // (a) membership: the three namespace globs.
  expect(rs.globs.map((g) => g.glob).sort()).toEqual(["*.ts", "*.tsx", "*tsconfig*.json"]);
  const tsGlob = rs.globs.find((g) => g.glob === "*.ts")!;
  expect(tsGlob.matches).toEqual(["a.ts", "b.ts"]);
  // (b)+(c) contents: both lintable sources and both global triggers.
  const paths = rs.files.map((f) => f.path).sort();
  expect(paths).toContain("a.ts");
  expect(paths).toContain("b.ts");
  expect(paths).toContain("tsconfig.json");
  expect(paths).toContain("package.json");
});

test("case 1: a non-.ts (docs) change is a HIT — docs-only ⇒ zero workers", async () => {
  const rs = await record();
  write("README.md", "# hello world — edited, unrelated\n");
  try {
    const v = await revalidate(rs);
    expect(v.hit).toBe(true);
  } finally {
    write("README.md", "# hello\n");
  }
});

test("case 2: any .ts content change is a MISS", async () => {
  const rs = await record();
  write("a.ts", "export const a = 42;\n");
  try {
    const v = await revalidate(rs);
    expect(v.hit).toBe(false);
    if (!v.hit) expect(v.reason).toContain("a.ts");
  } finally {
    write("a.ts", "export const a = 1;\n");
  }
});

test("case 3 (H3 coverage gate): a brand-new .ts file is a MISS via the membership glob", async () => {
  const rs = await record();
  // c.ts is a NEW file — not in any recorded content fact. Only the `*.ts`
  // membership glob catches it: the match set gains c.ts. A content-only
  // read-set would HIT here and stale-PASS the coverage gate.
  write("c.ts", "export const c = 3;\n");
  try {
    const v = await revalidate(rs);
    expect(v.hit).toBe(false);
    if (!v.hit) expect(v.reason).toContain("glob match set changed");
  } finally {
    rmSync(join(root, "c.ts"), { force: true });
  }
});

test("case 4: a global-trigger (tsconfig) change is a MISS", async () => {
  const rs = await record();
  write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: false } }) + "\n");
  try {
    const v = await revalidate(rs);
    expect(v.hit).toBe(false);
    if (!v.hit) expect(v.reason).toContain("tsconfig.json");
  } finally {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }) + "\n");
  }
});

test("case 4b: a package.json (compiler-version) change is a MISS", async () => {
  const rs = await record();
  write("package.json", JSON.stringify({ name: "fixture", dependencies: { typescript: "5.9.9" } }) + "\n");
  try {
    const v = await revalidate(rs);
    expect(v.hit).toBe(false);
    if (!v.hit) expect(v.reason).toContain("package.json");
  } finally {
    write("package.json", JSON.stringify({ name: "fixture", dependencies: { typescript: "5.0.0" } }) + "\n");
  }
});
