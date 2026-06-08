/**
 * Regression test for the `no-raw-websocket` migration onto `grepCode`.
 *
 * Proves the check's detection ignores comments/strings/regex but still flags a
 * genuine `new WebSocket(` call. The check narrows files with `git grep`, so we
 * stand up a throwaway git repo with a fixture exercising every context.
 *
 * Run with `bun test` from the repo root.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

// Mirror the exact detection config the check feeds to grepCode.
const PATTERN = /new WebSocket\(/;
const GREP_ARG = "new WebSocket(";

let root = "";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "no-raw-websocket-test-"));
  const fixture = [
    "// new WebSocket(commented) should be ignored", // L1 — comment
    'const note = "new WebSocket(stringed) ignored too";', // L2 — string literal
    "const ws = new WebSocket(url);", // L3 — the only real call
    "const r = /new WebSocket\\(/; // regex literal ignored", // L4 — regex literal
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

test("no-raw-websocket flags a real call but not a commented/stringed one", async () => {
  const matches = await grepCode({
    root,
    pattern: PATTERN,
    grepArg: GREP_ARG,
    fixed: true,
    maskStrings: true,
  });
  expect(matches.map((m) => m.line)).toEqual([3]);
  expect(matches[0]!.text).toBe("const ws = new WebSocket(url);");
});
