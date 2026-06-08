/**
 * Tests for `grepCode`. Run with `bun test` from the repo root.
 *
 * `grepCode` shells out to `git grep` to narrow candidate files, so these tests
 * stand up a throwaway git repo with a fixture file. The fixture writes the same
 * marker into real code, a comment and a string — only the real-code line must
 * survive the mask-and-rescan.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { grepCode } from "./grep-code";

let root = "";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "grep-code-test-"));
  const fixture = [
    "// new WebSocket(commented) should be ignored", // L1
    'const note = "new WebSocket(stringed) ignored too";', // L2
    "const ws = new WebSocket(url);", // L3 — the only real match
    "const r = /new WebSocket\\(/; // regex literal ignored", // L4
  ].join("\n");
  writeFileSync(join(root, "fixture.ts"), fixture + "\n");

  const run = async (...args: string[]) => {
    const proc = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  };
  await run("git", "init", "-q");
  await run("git", "config", "user.email", "t@t.t");
  await run("git", "config", "user.name", "t");
  await run("git", "add", "-A");
  await run("git", "commit", "-q", "-m", "fixture");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

test("grepCode returns only real-code matches, skipping comments/strings/regex", async () => {
  const matches = await grepCode({
    root,
    pattern: /new WebSocket\(/,
    grepArg: "new WebSocket(",
    fixed: true,
    maskStrings: true,
  });
  expect(matches.length).toBe(1);
  expect(matches[0]!.path).toBe("fixture.ts");
  expect(matches[0]!.line).toBe(3);
  expect(matches[0]!.text).toBe("const ws = new WebSocket(url);");
});

test("grepCode returns [] when git grep finds nothing", async () => {
  const matches = await grepCode({
    root,
    pattern: /zzz_no_such_token_zzz/,
    grepArg: "zzz_no_such_token_zzz",
    fixed: true,
  });
  expect(matches).toEqual([]);
});
