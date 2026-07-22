/**
 * Tests for the memoized git-root helpers. Run with `bun test`.
 *
 * The memo contract is per resolved cwd and stores the PROMISE, so two calls
 * for the same cwd must return the identical promise (one spawn per process).
 * Outside a git repo the helpers THROW — never absorb to "".
 */

import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getWorktreeRoot, getMainRepoRoot } from "./internal/git-roots";
import { SpawnFailedError } from "./internal/spawn-captured";

test("getWorktreeRoot resolves this checkout's root", async () => {
  const root = await getWorktreeRoot();
  expect(isAbsolute(root)).toBe(true);
  expect(existsSync(join(root, "package.json"))).toBe(true);
});

test("per-cwd memo identity: same cwd returns the identical promise", () => {
  expect(getWorktreeRoot()).toBe(getWorktreeRoot());
  expect(getWorktreeRoot(process.cwd())).toBe(getWorktreeRoot());
  expect(getMainRepoRoot()).toBe(getMainRepoRoot());
});

test("getMainRepoRoot resolves the main checkout owning .git", async () => {
  const mainRoot = await getMainRepoRoot();
  expect(isAbsolute(mainRoot)).toBe(true);
  expect(existsSync(join(mainRoot, ".git"))).toBe(true);
});

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test (see the
 * host-semaphore suite's identical helper), so this asserts the rejection for
 * real and hands back the error to pin its class.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

test("throws outside a git repo instead of absorbing to empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sg-spawn-norepo-"));
  try {
    expect(await rejection(getWorktreeRoot(dir))).toBeInstanceOf(SpawnFailedError);
    expect(await rejection(getMainRepoRoot(dir))).toBeInstanceOf(SpawnFailedError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
