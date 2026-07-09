import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { editedFilesSignature } from "./edited-files-signature";
import { editedFilesSignatureFor, loadEditedFilesFor } from "./edited-files-resource";

// Real throwaway git repos (no fixture helper exists for this shape — the nearest
// precedent is commit-list's run-git.test.ts, which also mkdtemps a repo under
// tmpdir). `editedFilesSignature` shells out to git and lstats real paths, so a
// fake would test nothing.

const repos: string[] = [];

/**
 * A repo with one commit on `main` containing `a.txt`, with a `feature` branch
 * checked out — the shape every conversation worktree has (HEAD ahead of, or
 * level with, main; `merge-base main HEAD` well-defined).
 */
async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "edited-files-sig-"));
  repos.push(dir);
  await runGit(["init", "-q"], dir);
  // Set the initial branch without relying on `git init -b` (newer git only).
  await runGit(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
  await runGit(["config", "user.email", "test@example.com"], dir);
  await runGit(["config", "user.name", "Test"], dir);
  await runGit(["config", "commit.gpgsign", "false"], dir);
  await writeFile(join(dir, "a.txt"), "one\n");
  await runGit(["add", "a.txt"], dir);
  await runGit(["commit", "-q", "-m", "initial"], dir);
  await runGit(["checkout", "-q", "-b", "feature"], dir);
  return dir;
}

/** The `${headSha}|${mergeBase}` prefix of the signature, before the dirty rows. */
function shaPart(signature: string): string {
  return signature.split("\0")[0]!;
}

afterAll(async () => {
  await Promise.all(repos.map((d) => rm(d, { recursive: true, force: true })));
});

describe("editedFilesSignature", () => {
  // THE property that lets the watcher generation counter die: an uncommitted save
  // moves no SHA, so a pure git-SHA signature would serve a stale value. The
  // per-dirty-file lstat (mtime+size) makes the content signature move anyway, so
  // `revalidate` and the loader's memo can share it as one authority.
  test("moves on an uncommitted edit with no SHA change", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "a.txt"), "one\ntwo\n");
    const before = await editedFilesSignature(repo);

    await writeFile(join(repo, "a.txt"), "one\ntwo\nthree\n");
    const after = await editedFilesSignature(repo);

    expect(after).not.toBe(before);
    // Neither HEAD nor the merge-base moved — only the working tree did.
    expect(shaPart(after)).toBe(shaPart(before));
  });

  test("moves when an untracked file appears", async () => {
    const repo = await makeRepo();
    const before = await editedFilesSignature(repo);

    await writeFile(join(repo, "new.txt"), "hello\n");
    const after = await editedFilesSignature(repo);

    expect(after).not.toBe(before);
    expect(shaPart(after)).toBe(shaPart(before));
  });

  test("moves when a dirty file is deleted", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "a.txt"), "one\ntwo\n");
    const dirty = await editedFilesSignature(repo);

    await unlink(join(repo, "a.txt"));
    const deleted = await editedFilesSignature(repo);

    expect(deleted).not.toBe(dirty);
    // The vanished path can't be lstat'd — it degrades to the -1 sentinels rather
    // than throwing, and the porcelain code flips to a delete.
    expect(deleted).toContain(":-1:-1:a.txt");
  });

  test("is stable across repeated probes with no change", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "a.txt"), "one\ntwo\n");
    await writeFile(join(repo, "untracked.txt"), "x\n");

    const first = await editedFilesSignature(repo);
    const second = await editedFilesSignature(repo);
    expect(second).toBe(first);
  });

  test("moves when main advances (merge-base changes)", async () => {
    const repo = await makeRepo();
    // Commit on feature; main still points at the initial commit.
    await writeFile(join(repo, "b.txt"), "b\n");
    await runGit(["add", "b.txt"], repo);
    await runGit(["commit", "-q", "-m", "feature work"], repo);
    const head = (await runGit(["rev-parse", "HEAD"], repo)).trim();

    const before = await editedFilesSignature(repo);

    // main advances onto HEAD (the branch landed) — merge-base moves, HEAD doesn't.
    await runGit(["update-ref", "refs/heads/main", head], repo);
    const after = await editedFilesSignature(repo);

    expect(after).not.toBe(before);
    // The merge-base half (after the `|`) is what moved; HEAD is unchanged.
    expect(before).not.toContain(`|${head}`);
    expect(after).toContain(`|${head}`);
  });
});

describe("missing worktree", () => {
  // The absorbable-failure guard: an unresolvable worktree means the edited-file
  // set is UNKNOWN, not empty. `[]` / `"none"` would render as a legitimate
  // "no changes" and arm the destructive Drop & Close.
  const NO_SUCH_CONVERSATION = "edited-files-signature-test-no-such-conversation";

  test("loader rejects — never []", async () => {
    const value = await loadEditedFilesFor(NO_SUCH_CONVERSATION).then(
      (files) => ({ resolved: files }),
      (err: unknown) => ({ err }),
    );
    expect(value).not.toHaveProperty("resolved");
    expect((value as { err: unknown }).err).toBeInstanceOf(Error);
    expect((value as { err: Error }).err.message).toContain(NO_SUCH_CONVERSATION);
  });

  test("revalidate rejects — never \"none\"", async () => {
    const value = await editedFilesSignatureFor(NO_SUCH_CONVERSATION).then(
      (signature) => ({ resolved: signature }),
      (err: unknown) => ({ err }),
    );
    expect(value).not.toHaveProperty("resolved");
    expect((value as { err: unknown }).err).toBeInstanceOf(Error);
    expect((value as { err: Error }).err.message).toContain(NO_SUCH_CONVERSATION);
  });
});
